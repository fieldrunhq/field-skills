// Shared helpers for the three Fieldrun skills.
//
// Every run lives under ONE well-known directory — ~/fieldruns — with one
// folder per job code. A practitioner accumulates runs over time, and scattering
// them through whatever directory they happened to be in when they started is
// how work gets lost. One root, one folder per code, always the same shape.

import { homedir } from 'node:os';
import os from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const FIELDRUNS_DIRNAME = 'fieldruns';

/// The single root every run is stored under. FIELDRUN_HOME overrides it, which
/// is what the tests use so they never touch a real practitioner's directory.
export function fieldrunsRoot() {
  return process.env.FIELDRUN_HOME || join(homedir(), FIELDRUNS_DIRNAME);
}

export function runDir(code) {
  return join(fieldrunsRoot(), normalizeJobCode(code));
}

export const runFiles = (code) => ({
  dir: runDir(code),
  job: join(runDir(code), 'job.json'),
  run: join(runDir(code), 'run.json'),
  environment: join(runDir(code), 'environment.json'),
  notes: join(runDir(code), 'NOTES.md'),
  prompt: join(runDir(code), 'PROMPT.md'),
});

// ---- Job codes ------------------------------------------------------------
// Mirrors packages/shared/src/lib/jobs/job-code.ts on the server. Kept in sync
// by the test below, which fails if the two alphabets ever diverge.

export const JOB_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const JOB_CODE_LENGTH = 10;
const JOB_CODE_RE = new RegExp(`^[${JOB_CODE_ALPHABET}]{${JOB_CODE_LENGTH}}$`);

export function normalizeJobCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function isValidJobCode(value) {
  return JOB_CODE_RE.test(normalizeJobCode(value));
}

// ---- API ------------------------------------------------------------------

/// Where the skill sends everything. Defaults to production; point
/// FIELDRUN_API_URL at the development service (or a localhost port) to work
/// against anything else.
export const PRODUCTION_API_URL = 'https://fieldrun-backend-production.up.railway.app';
export const DEVELOPMENT_API_URL = 'https://alluring-renewal-develop.up.railway.app';

export function apiBase() {
  return (process.env.FIELDRUN_API_URL || PRODUCTION_API_URL).replace(/\/+$/, '');
}

/// Where the machine token lives. Deliberately NOT inside ~/fieldruns: that
/// directory is the one handed back to Fieldrun, and a credential must never be
/// somewhere it can be uploaded by accident.
export const CREDENTIALS_PATH = join(homedir(), '.fieldrun', 'credentials.json');

/**
 * The machine token, from the environment or from disk.
 *
 * Created at fieldrun.dev/settings/tokens and pasted here once. It is a Fieldrun
 * token rather than a Firebase one because those expire hourly and refreshing
 * one needs a live browser session, which a terminal does not have.
 */
export function readToken() {
  if (process.env.FIELDRUN_TOKEN) return process.env.FIELDRUN_TOKEN;
  try {
    const parsed = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));
    return typeof parsed.token === 'string' ? parsed.token : null;
  } catch {
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(readToken());
}

function authHeaders() {
  const token = readToken();
  if (!token) return {};
  // The dev bypass is only honoured by a non-production server; sending it
  // costs nothing against production, which ignores the header.
  if (token.startsWith('dev:')) return { 'x-dev-auth-uid': token.slice(4) };
  return { authorization: `Bearer ${token}` };
}

export async function api(method, path, body) {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: response.status, ok: response.ok, body: parsed };
}

/**
 * Where to send someone who has no token.
 *
 * Asked of the API rather than hardcoded here. This plugin is published and
 * most installed copies will never be updated; the service is deployed
 * continuously. Letting the server name its own sign-in page means a domain
 * change fixes every copy at once, including the stale ones.
 */
export async function tokensUrl() {
  try {
    const probe = await fetch(`${apiBase()}/me`, { signal: AbortSignal.timeout(8000) });
    const body = await probe.json();
    if (typeof body?.tokensUrl === 'string') return body.tokensUrl;
  } catch {
    // Offline, or an older API that does not say. Fall through.
  }
  return `${apiBase().replace(/\/\/api\./, '//')}/settings/tokens`;
}

export const getJob = (code) => api('GET', `/run/${normalizeJobCode(code)}`);
export const claimJob = (code) => api('POST', `/run/${normalizeJobCode(code)}/claim`);
export const submitRun = (runId, payload) => api('POST', `/runs/${runId}/submit`, payload);


// ---- Environment ----------------------------------------------------------

async function version(command, args) {
  try {
    const { stdout } = await run(command, args, { timeout: 4000 });
    return stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

/**
 * The environment fingerprint.
 *
 * This is the part a cloud VM cannot give you, so it is captured by the machine
 * rather than typed by the person: a practitioner asked to describe their setup
 * reports the version they believe they are on, which is frequently not the one
 * that is running.
 */
export async function captureEnvironment() {
  const [python, uv, git, npm] = await Promise.all([
    version('python3', ['--version']),
    version('uv', ['--version']),
    version('git', ['--version']),
    version('npm', ['--version']),
  ]);

  return {
    os: `${os.type()} ${os.release()}`,
    runtime: `node ${process.versions.node}`,
    shell: process.env.SHELL || process.env.ComSpec || null,
    agent: detectAgent(),
    extra: {
      platform: process.platform,
      arch: process.arch,
      python, uv, git, npm,
      mcpServers: await countMcpServers(),
      capturedAt: new Date().toISOString(),
    },
  };
}

/// Which agent is running the skill. Best-effort: the point is to distinguish
/// the common hosts, not to identify every possible one.
function detectAgent() {
  if (process.env.CLAUDE_CODE || process.env.CLAUDECODE) return 'claude-code';
  if (process.env.CURSOR_TRACE_ID) return 'cursor';
  if (process.env.TERM_PROGRAM) return process.env.TERM_PROGRAM;
  return null;
}

/**
 * How many MCP servers are already registered.
 *
 * This single number is the one most likely to explain a result: a tool-name
 * collision only happens on a machine that already has other servers, and that
 * is precisely the machine we cannot reproduce in CI. Counting is enough — we
 * never read what those servers are or what they connect to.
 */
async function countMcpServers() {
  const candidates = [
    join(homedir(), '.claude.json'),
    join(homedir(), '.claude', 'settings.json'),
    join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  ];
  let total = 0;
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8'));
      total += Object.keys(parsed.mcpServers ?? {}).length;
    } catch {
      // A config we cannot parse is not a failure worth stopping the run over.
    }
  }
  return total;
}

// ---- Run directory --------------------------------------------------------

export async function ensureRunDir(code) {
  const dir = runDir(code);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/// Every run currently on this machine, newest first — what review-fieldrun
/// lists when it is invoked with no code.
export async function listRuns() {
  const root = fieldrunsRoot();
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const runs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidJobCode(entry.name)) continue;
    const files = runFiles(entry.name);
    runs.push({
      code: entry.name,
      job: await readJson(files.job),
      run: await readJson(files.run),
    });
  }
  return runs.sort((a, b) =>
    String(b.run?.claimedAt ?? '').localeCompare(String(a.run?.claimedAt ?? '')));
}
