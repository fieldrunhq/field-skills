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

// The handover block is the only thing telling a practitioner what the second
// half of the workflow is called. A run that is done but never submitted is
// worth nothing, so every skill is required to end with one.
test('every skill ends by naming the next step', async () => {
  const { readFile: rf } = await import('node:fs/promises');
  const skills = ['start-fieldrun', 'review-fieldrun', 'submit-fieldrun'];
  for (const name of skills) {
    const body = await rf(new URL(`../skills/${name}/SKILL.md`, import.meta.url), 'utf8');
    assert.match(body, /NEXT {2}─+/, `${name} has no NEXT block`);
    const arrows = (body.match(/^ {2}→ {2}/gm) ?? []).length;
    assert.equal(arrows, 1, `${name} should mark exactly one next action, found ${arrows}`);
  }
});

// "Agent" means the host doing the work AND the subagents defined inside it.
// An inventory reporting only the first misses how someone actually works.
test('subagent detection reads names and tools, never descriptions', async () => {
  const { mkdtemp: mkTmp } = await import('node:fs/promises');
  const fake = await mkTmp(join(tmpdir(), 'fieldrun-sub-'));
  const project = join(fake, 'work', 'secret-client');

  await mkdir(join(fake, '.claude', 'agents'), { recursive: true });
  await mkdir(join(project, '.claude', 'agents'), { recursive: true });
  // Claude Code names a project dir after its cwd, separators hyphenated.
  await mkdir(join(fake, '.claude', 'projects', project.replaceAll('/', '-')), { recursive: true });

  await writeFile(join(fake, '.claude', 'agents', 'helper.md'),
    '---\nname: helper\ndescription: Reads the acme-corp invoice mailbox\ntools: Read, Bash\n---\nbody');
  await writeFile(join(project, '.claude', 'agents', 'triage.md'),
    '---\nname: triage\ndescription: Sweeps support@secret-client.com\ntools: Bash\n---\nbody');

  const realHome = process.env.HOME;
  process.env.HOME = fake;
  try {
    const fresh = await import(`../lib/fieldrun.mjs?sub=${Date.now()}`);
    const subs = await fresh.detectSubagents();
    const names = subs.map((s) => s.name).sort();
    assert.deepEqual(names, ['helper', 'triage']);
    assert.equal(subs.find((s) => s.name === 'helper').scope, 'user');
    assert.equal(subs.find((s) => s.name === 'triage').scope, 'project');
    assert.equal(subs.find((s) => s.name === 'triage').tools, 'Bash');

    // The description names a client and a mailbox. It must never leave.
    const serialized = JSON.stringify(subs);
    assert.ok(!/acme-corp|secret-client|mailbox|description/i.test(serialized), serialized);
    // Nor the path the agent was found at.
    assert.ok(!serialized.includes(project), 'project paths must not be captured');
  } finally {
    process.env.HOME = realHome;
  }
});

// Both of these traps produced a false negative in a real run — an agent
// reported "no session history" for a machine with 31 sessions. A false
// negative reads as a finding and a customer banks it, so both are pinned.
test('session history survives the hyphen and ignores the sessions decoy', async () => {
  const { mkdtemp: mkTmp } = await import('node:fs/promises');
  const fake = await mkTmp(join(tmpdir(), 'fieldrun-proj-'));

  // Real transcripts, in directories named the way Claude Code names them:
  // the launch cwd with separators hyphenated, so every name starts with '-'.
  const busy = join(fake, '.claude', 'projects', '-Users-someone-Documents-AcmeCorp');
  const quiet = join(fake, '.claude', 'projects', '-Users-someone');
  await mkdir(busy, { recursive: true });
  await mkdir(quiet, { recursive: true });
  for (const n of ['a', 'b', 'c']) await writeFile(join(busy, `${n}.jsonl`), '{}');
  await writeFile(join(quiet, 'd.jsonl'), '{}');

  // The decoy: ~/.claude/sessions holds keys and metadata, never transcripts.
  await mkdir(join(fake, '.claude', 'sessions'), { recursive: true });
  await writeFile(join(fake, '.claude', 'sessions', '10906.json'), '{}');
  await writeFile(join(fake, '.claude', 'sessions', '10906.key'), 'x');

  const realHome = process.env.HOME;
  process.env.HOME = fake;
  try {
    const fresh = await import(`../lib/fieldrun.mjs?proj=${Date.now()}`);
    const projects = await fresh.claudeProjects();

    assert.equal(projects.length, 2, 'both hyphen-named project dirs must be found');
    assert.equal(projects[0].sessions, 3, 'busiest project first');
    assert.equal(projects[1].sessions, 1);
    assert.equal(projects.reduce((n, p) => n + p.sessions, 0), 4,
      'the sessions/ decoy must contribute nothing');

    // The directory names decode to real paths and name employers and clients.
    const serialized = JSON.stringify(projects);
    assert.ok(!/AcmeCorp|Users|someone/i.test(serialized), serialized);
    for (const p of projects) {
      assert.deepEqual(Object.keys(p).sort(), ['firstUsed', 'lastUsed', 'sessions']);
    }
  } finally {
    process.env.HOME = realHome;
  }
});

// Codex partitions by DATE, not by project, so the project can only come from
// inside the rollout — and only its opening metadata record, never a message.
test('codex projects come from the rollout header, not the path', async () => {
  const { mkdtemp: mkTmp } = await import('node:fs/promises');
  const fake = await mkTmp(join(tmpdir(), 'fieldrun-codex-'));
  const day = join(fake, '.codex', 'sessions', '2026', '09', '16');
  await mkdir(day, { recursive: true });

  const rollout = (cwd, ts, extra = '') =>
    JSON.stringify({ timestamp: ts, ordinal: 0, type: 'session_meta',
      payload: { cwd, timestamp: ts, cli_version: '0.154.0' } })
    + '\n' + JSON.stringify({ type: 'message', payload: { text: `SECRET-${extra}` } }) + '\n';

  await writeFile(join(day, 'rollout-a.jsonl'), rollout('/Users/x/Documents/AcmeCorp', '2026-09-16T10:00:00Z', 'a'));
  await writeFile(join(day, 'rollout-b.jsonl'), rollout('/Users/x/Documents/AcmeCorp', '2026-09-18T10:00:00Z', 'b'));
  await writeFile(join(day, 'rollout-c.jsonl'), rollout('/Users/x/Documents/Other', '2026-09-17T10:00:00Z', 'c'));
  await writeFile(join(day, 'notes.txt'), 'ignored');

  const realHome = process.env.HOME;
  process.env.HOME = fake;
  try {
    const fresh = await import(`../lib/fieldrun.mjs?codex=${Date.now()}`);
    const { projects, version } = await fresh.codexProjects();

    assert.equal(version, '0.154.0');
    assert.equal(projects.length, 2, 'grouped by cwd, not by file or by day');
    assert.equal(projects[0].sessions, 2, 'busiest first');
    // Dates come from the rollout's own timestamp, not the file's mtime, which
    // would be "now" for a fixture written a moment ago.
    assert.equal(projects[0].firstUsed, '2026-09-16');
    assert.equal(projects[0].lastUsed, '2026-09-18');

    const serialized = JSON.stringify(projects);
    assert.ok(!/AcmeCorp|Users|Other/.test(serialized), 'paths must not be captured');
    assert.ok(!/SECRET/.test(serialized), 'message content must never be read');
  } finally {
    process.env.HOME = realHome;
  }
});
