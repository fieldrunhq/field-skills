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
  assert.equal(m.runDir('4hgp6'), join(ROOT, '4HGP6'));
});

test('the run directory is named by the normalized code', () => {
  assert.equal(m.runDir('  4hgp6 '), join(ROOT, '4HGP6'));
});

test('run files all sit inside that one directory', () => {
  const files = m.runFiles('4HGP6');
  for (const [name, path] of Object.entries(files)) {
    if (name === 'dir') continue;
    assert.ok(path.startsWith(join(ROOT, '4HGP6')), `${name} escaped the run directory`);
  }
});

// The client refuses malformed codes locally so a typo never reaches the API,
// and so the alphabet cannot drift from the server's without a test failing.
test('the code alphabet matches the server and excludes ambiguous glyphs', () => {
  assert.equal(m.JOB_CODE_ALPHABET, '23456789ABCDEFGHJKMNPQRSTVWXYZ');
  assert.equal(m.JOB_CODE_LENGTH, 5);
  for (const ambiguous of ['0', '1', 'I', 'L', 'O', 'U']) {
    assert.ok(!m.JOB_CODE_ALPHABET.includes(ambiguous));
  }
});

test('code validation is case-insensitive and length-checked', () => {
  assert.ok(m.isValidJobCode('4hgp6'));
  assert.ok(m.isValidJobCode('4HGP6'));
  assert.ok(!m.isValidJobCode('4HGP'));
  assert.ok(!m.isValidJobCode('4HGP66'));
  assert.ok(!m.isValidJobCode('4HGPO'), 'O is not in the alphabet');
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
  await mkdir(join(ROOT, 'AB2CD'), { recursive: true });
  await writeFile(join(ROOT, 'AB2CD', 'job.json'), JSON.stringify({ code: 'AB2CD', title: 'A job' }));
  await writeFile(join(ROOT, 'AB2CD', 'run.json'), JSON.stringify({ id: 'r1', claimedAt: '2026-01-01T00:00:00Z' }));
  await mkdir(join(ROOT, 'not-a-code'), { recursive: true });

  const runs = await m.listRuns();
  assert.equal(runs.length, 1);
  assert.equal(runs[0].code, 'AB2CD');
  assert.equal(runs[0].job.title, 'A job');
});

test('the api base strips a trailing slash', () => {
  process.env.FIELDRUN_API_URL = 'http://localhost:4000/';
  assert.equal(m.apiBase(), 'http://localhost:4000');
  delete process.env.FIELDRUN_API_URL;
});
