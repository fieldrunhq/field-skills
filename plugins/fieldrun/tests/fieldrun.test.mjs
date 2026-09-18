import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Point the library at a scratch root before importing it, so no test ever
// reads or writes a real practitioner's ~/fieldruns.
const ROOT = await mkdtemp(join(tmpdir(), 'fieldrun-test-'));
process.env.FIELDRUN_HOME = ROOT;

const m = await import('../lib/fieldrun.mjs');

test('every run lives under the one configured root', () => {
  assert.equal(m.fieldrunsRoot(), ROOT);
  assert.equal(m.runDir('hfdjqxpc5i'), join(ROOT, 'HFDJQXPC5I'));
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
