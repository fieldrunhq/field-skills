import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the library at a scratch root before importing it, so no test ever
// reads or writes a real practitioner's ~/.fieldruns.
const ROOT = await mkdtemp(join(tmpdir(), 'fieldrun-test-'));
process.env.FIELDRUN_HOME = ROOT;

const m = await import('../lib/fieldrun.mjs');

test('every run lives under the one configured root', () => {
  assert.equal(m.fieldrunsRoot(), ROOT);
  assert.equal(m.runDir('hfdjqxpc5i'), join(ROOT, 'HFDJQXPC5I'));
});

// The root is the plugin's own storage, not something the user curates, so it
// is hidden. Pinned because changing it silently strands every existing run.
test('the run root is dotted', async () => {
  assert.equal(m.FIELDRUNS_DIRNAME, '.fieldruns');
  const realHome = process.env.FIELDRUN_HOME;
  delete process.env.FIELDRUN_HOME;
  try {
    const fresh = await import(`../lib/fieldrun.mjs?dotted=${Date.now()}`);
    assert.ok(fresh.fieldrunsRoot().endsWith('/.fieldruns'), fresh.fieldrunsRoot());
  } finally {
    process.env.FIELDRUN_HOME = realHome;
  }
});

test('the run directory is named by the normalized code', () => {
  assert.equal(m.runDir('  hfdjqxpc5i '), join(ROOT, 'HFDJQXPC5I'));
});

test('run files all sit inside that one directory', () => {
  const files = m.runFiles('HFDJQXPC5I');
  for (const [name, path] of Object.entries(files)) {
    if (name === 'dir') continue;
    assert.ok(path.startsWith(join(ROOT, 'HFDJQXPC5I')), `${name} escaped the run directory`);
  }
});

// The client refuses malformed codes locally so a typo never reaches the API,
// and so the alphabet cannot drift from the server's without a test failing.
test('the id alphabet matches the server: uppercase letters and digits', () => {
  assert.equal(m.JOB_CODE_ALPHABET, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  assert.equal(m.JOB_CODE_LENGTH, 10);
  assert.ok(!/[a-z]/.test(m.JOB_CODE_ALPHABET));
});

test('id validation is case-insensitive and length-checked', () => {
  assert.ok(m.isValidJobCode('hfdjqxpc5i'));
  assert.ok(m.isValidJobCode('HFDJQXPC5I'));
  assert.ok(!m.isValidJobCode('HFDJQXPC5'));
  assert.ok(!m.isValidJobCode('HFDJQXPC5II'));
  assert.ok(!m.isValidJobCode('HFDJQXPC5-'), 'punctuation is not in the alphabet');
  assert.ok(!m.isValidJobCode(''));
});

test('the environment fingerprint carries what CI cannot tell you', async () => {
  const env = await m.captureEnvironment();
  assert.match(env.runtime, /^node \d+\./);
  assert.ok(env.os.length > 0);
  assert.equal(typeof env.extra.mcpServers, 'number');
  assert.ok(env.extra.capturedAt);
  // The fingerprint must never carry a credential out with it.
  const serialized = JSON.stringify(env);
  assert.ok(!/FIELDRUN_TOKEN|authorization|private_key/i.test(serialized));
});

test('listing runs ignores directories that are not job codes', async () => {
  await mkdir(join(ROOT, 'AB2CDEFGHJ'), { recursive: true });
  await writeFile(join(ROOT, 'AB2CDEFGHJ', 'job.json'), JSON.stringify({ code: 'AB2CDEFGHJ', title: 'A job' }));
  await writeFile(join(ROOT, 'AB2CDEFGHJ', 'run.json'), JSON.stringify({ id: 'r1', claimedAt: '2026-01-01T00:00:00Z' }));
  await mkdir(join(ROOT, 'not-a-code'), { recursive: true });

  const runs = await m.listRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].code, 'AB2CDEFGHJ');
  assert.equal(runs[0].job.title, 'A job');
});

test('the api base strips a trailing slash', () => {
  process.env.FIELDRUN_API_URL = 'http://localhost:4000/';
  assert.equal(m.apiBase(), 'http://localhost:4000');
  delete process.env.FIELDRUN_API_URL;
});

// The whole point of the rewrite: a first-time installer has no token, and
// nothing in these skills should ever ask for one. This test fails loudly if
// credential handling creeps back in.
test('the client carries no credentials at all', async () => {
  for (const name of ['readToken', 'isAuthenticated', 'tokensUrl', 'CREDENTIALS_PATH']) {
    assert.equal(m[name], undefined, `${name} is back — these skills must stay unauthenticated`);
  }

  const { createServer } = await import('node:http');
  const seen = [];
  const server = createServer((req, res) => {
    seen.push(req.headers);
    res.writeHead(201, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true, runId: 'r-1' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.FIELDRUN_API_URL = `http://127.0.0.1:${server.address().port}`;

  try {
    const started = await m.startRun('hfdjqxpc5i');
    assert.equal(started.body.runId, 'r-1');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].authorization, undefined);
    assert.equal(seen[0]['x-dev-auth-uid'], undefined);
  } finally {
    delete process.env.FIELDRUN_API_URL;
    await new Promise((resolve) => server.close(resolve));
  }
});

// Agent detection is the field a cloud VM cannot produce, so it is the one most
// worth pinning: it must find what is there, stay quiet about what is not, and
// never read a conversation's contents.
test('agent detection reports sessions and last use', async () => {
  const { mkdtemp: mkTmp } = await import('node:fs/promises');
  const fake = await mkTmp(join(tmpdir(), 'fieldrun-home-'));

  // A .codex tree with two rollout files and one unrelated file.
  await mkdir(join(fake, '.codex', 'sessions', '2026', '09'), { recursive: true });
  for (const name of ['rollout-a.jsonl', 'rollout-b.jsonl', 'notes.txt']) {
    await writeFile(join(fake, '.codex', 'sessions', '2026', '09', name), 'x');
  }

  const realHome = process.env.HOME;
  process.env.HOME = fake;
  try {
    // homedir() reads HOME on POSIX, so this exercises the real lookup path.
    const { detectAgents, agentRoot } = await import(`../lib/fieldrun.mjs?home=${encodeURIComponent(fake)}`);
    assert.equal(agentRoot('.codex'), join(fake, '.codex'));
    assert.equal(agentRoot('.nonesuch'), null);

    const agents = await detectAgents();
    const codex = agents.find((a) => a.agent === 'Codex');
    assert.ok(codex, 'Codex should be found');
    assert.equal(codex.sessions, 2, 'only rollout-*.jsonl counts');
    assert.equal(typeof codex.daysSinceLastUsed, 'number');
    assert.ok(!agents.some((a) => a.agent === 'Cursor'), 'absent agents are omitted');
  } finally {
    process.env.HOME = realHome;
  }
});

test('the fingerprint never carries conversation contents', async () => {
  const env = await m.captureEnvironment();
  assert.ok(Array.isArray(env.extra.agents));
  // Every field is a name, a count or a date — never anything a user wrote.
  for (const a of env.extra.agents) {
    assert.equal(typeof a.agent, 'string');
    assert.equal(typeof a.sessions, 'number');
    for (const p of a.skills?.plugins ?? []) {
      assert.deepEqual(Object.keys(p).sort(), ['enabled', 'id', 'installedAt', 'version']);
    }
  }
});
