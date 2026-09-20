// Shared helpers for the three Fieldrun skills.
//
// Every run lives under ONE well-known directory — ~/.fieldruns — with one
// folder per job code. A practitioner accumulates runs over time, and scattering
// them through whatever directory they happened to be in when they started is
// how work gets lost. One root, one folder per code, always the same shape.
//
// Dotted, because this is the plugin's own storage rather than something the
// user curates, and a visible ~/fieldruns in the home directory is clutter they
// never asked for.

import { homedir } from 'node:os';
import os from 'node:os';
import { join } from 'node:path';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const FIELDRUNS_DIRNAME = '.fieldruns';

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

/**
 * Every call these skills make is unauthenticated, deliberately.
 *
 * A practitioner should be able to install the plugin, run a job and see what
 * the work is like before deciding whether to have an account with us. The
 * account is needed only to be paid, so that is where the sign-in lives: the
 * claim URL handed back at submit time. Nothing here reads a credential, and
 * there is no token on disk for this plugin to leak.
 */
export async function api(method, path, body) {
  const response = await fetch(`${apiBase()}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  return { status: response.status, ok: response.ok, body: parsed };
}

/**
 * Begin a run and get back its id, the job, and the prompt.
 *
 * One call, because there is nothing to gate the prompt behind: no slot is
 * reserved and no commitment is made, so a practitioner who reads the brief and
 * walks away has cost the job nothing. Consent still happens before the work —
 * it is just the skill asking, not the server withholding.
 */
export const startRun = (code) =>
  api('POST', '/runs/pending/start', { code: normalizeJobCode(code) });

/// Upload the finished run. The response carries the claim URL — the only place
/// a practitioner is ever asked to sign in.
export const submitRun = (runId, payload) =>
  api('POST', `/runs/pending/${runId}/submit`, payload);

/// What the claim page shows. Useful for re-reading a submitted run's status.
export const getRun = (runId) => api('GET', `/runs/pending/${runId}`);

// ---- Agents on this machine -----------------------------------------------

/**
 * Where an agent keeps its state.
 *
 * `$HOME` first, then `~/Downloads`, which is where a restored backup lands —
 * a practitioner who has migrated machines still has the history, just not in
 * the live location.
 */
export function agentRoot(dotname) {
  for (const base of [homedir(), join(homedir(), 'Downloads')]) {
    const path = join(base, dotname);
    if (existsSync(path)) return path;
  }
  return null;
}

/// Agents worth looking for, and where each keeps its sessions. Adding one is a
/// row here; nothing else in the file knows the list.
const AGENTS = [
  { name: 'Claude Code', dot: '.claude', sessions: ['projects'], match: (n) => n.endsWith('.jsonl') },
  { name: 'Codex', dot: '.codex', sessions: ['sessions'], match: (n) => n.startsWith('rollout-') && n.endsWith('.jsonl') },
  { name: 'Cursor', dot: '.cursor', sessions: ['projects'], match: (n) => n.endsWith('.jsonl') },
  { name: 'Grok', dot: '.grok', sessions: [''], match: (n) => n.endsWith('.jsonl') },
  { name: 'Pi', dot: '.pi', sessions: [''], match: (n) => n.endsWith('.jsonl') },
  { name: 'OpenCode', dot: '.opencode', sessions: [''], match: (n) => n.endsWith('.jsonl') },
  { name: 'OpenClaw', dot: '.openclaw', sessions: [''], match: (n) => n.endsWith('.jsonl') },
  { name: 'Hermes', dot: '.hermes', sessions: [''], match: (n) => n.endsWith('.jsonl') },
];

/// Depth-limited so a symlink into a huge tree cannot turn environment capture
/// into a full-disk walk.
async function findFiles(dir, match, depth = 0, out = []) {
  if (depth > 4) return out;
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await findFiles(path, match, depth + 1, out);
    else if (match(entry.name)) out.push(path);
  }
  return out;
}

function newestMtime(files) {
  let newest = 0;
  for (const file of files) {
    try {
      const time = statSync(file).mtime.getTime();
      if (time > newest) newest = time;
    } catch {
      // A file that vanished between listing and stat is not worth failing over.
    }
  }
  return newest;
}

function readJsonSync(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * Claude Code's skills, from the three places they actually come from:
 * marketplace plugins, which of those are enabled, and configured MCP servers.
 */
function claudeSkills(root) {
  const installed = readJsonSync(join(root, 'plugins', 'installed_plugins.json'));
  const settings = readJsonSync(join(root, 'settings.json')) ?? {};
  const enabled = Object.keys(settings.enabledPlugins ?? {});
  return {
    plugins: Object.entries(installed?.plugins ?? {}).map(([id, versions]) => ({
      id,
      version: versions?.[0]?.version ?? null,
      installedAt: versions?.[0]?.installedAt ?? null,
      enabled: enabled.includes(id),
    })),
    mcpServers: Object.keys(readJsonSync(join(homedir(), '.claude.json'))?.mcpServers ?? {}).length,
  };
}

/**
 * Resolve one of Claude Code's project directory names back to a real path.
 *
 * The names are the cwd with every separator turned into a hyphen, which is
 * ambiguous the moment a directory name contains one. Walk it greedily,
 * preferring the longest segment that actually exists on disk — the same
 * approach askrealme's extractor takes.
 */
function decodeProjectDir(name) {
  const parts = name.replace(/^-+/, '').split('-');
  let acc = '/';
  let i = 0;
  while (i < parts.length) {
    let matched = false;
    for (let k = parts.length - i; k > 0; k--) {
      const trial = join(acc, parts.slice(i, i + k).join('-'));
      if (existsSync(trial)) { acc = trial; i += k; matched = true; break; }
    }
    if (!matched) return null;
  }
  return acc === '/' ? null : acc;
}

/**
 * Subagents configured on this machine.
 *
 * "Agent" means two different things and an inventory that reports only the
 * first is wrong: there is the host doing the work — Claude Code, Codex — and
 * there are the subagents a practitioner has defined inside it. The second set
 * says far more about how someone actually works, and is invisible to every
 * other kind of telemetry.
 *
 * Project-level agents are found through the host's own project list rather
 * than by sweeping the disk: scanning a home directory for `.claude/agents`
 * means walking places that have nothing to do with this job.
 *
 * Only the name, the scope and the declared tools are read. **Not the
 * description and not the project path** — a subagent's description routinely
 * names the mailbox, the customer or the internal system it exists to handle,
 * and that is the practitioner's business, not the fingerprint's.
 */
export async function detectSubagents() {
  const root = agentRoot('.claude');
  if (!root) return [];

  const dirs = [{ scope: 'user', dir: join(root, 'agents') }];
  try {
    for (const entry of await readdir(join(root, 'projects'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const project = decodeProjectDir(entry.name);
      if (project) dirs.push({ scope: 'project', dir: join(project, '.claude', 'agents') });
    }
  } catch {
    // No project list is simply no project-level agents to find.
  }

  const found = [];
  const seen = new Set();
  for (const { scope, dir } of dirs) {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const key = `${scope}:${entry.name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let name = entry.name.replace(/\.md$/, '');
      let tools = null;
      try {
        const head = readFileSync(join(dir, entry.name), 'utf8').slice(0, 2000);
        name = /^name:\s*(.+)$/m.exec(head)?.[1].trim() ?? name;
        tools = /^tools:\s*(.+)$/m.exec(head)?.[1].trim() ?? null;
      } catch {
        // An unreadable definition still counts as one that exists.
      }
      found.push({ name, scope, tools });
    }
  }
  return found;
}

/**
 * Which agents are installed, how heavily each is used, and when each was last
 * touched.
 *
 * This is the field a cloud VM cannot produce and the one a practitioner cannot
 * reliably report: people misremember which tools they still use, and "last
 * used" settles it from the agent's own session files. Only file names and
 * modification times are read — never the contents of a conversation.
 */
export async function detectAgents() {
  const found = [];
  for (const agent of AGENTS) {
    const root = agentRoot(agent.dot);
    if (!root) continue;

    const files = [];
    for (const sub of agent.sessions) {
      files.push(...await findFiles(sub ? join(root, sub) : root, agent.match));
    }
    const newest = newestMtime(files);

    found.push({
      agent: agent.name,
      sessions: files.length,
      lastUsed: newest ? new Date(newest).toISOString().slice(0, 10) : null,
      daysSinceLastUsed: newest ? Math.floor((Date.now() - newest) / 86_400_000) : null,
      ...(agent.dot === '.claude' ? { skills: claudeSkills(root) } : {}),
    });
  }
  return found;
}

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
 * that is running. The same goes double for which agents they still use — see
 * detectAgents, whose last-used dates settle what memory only guesses at.
 */
export async function captureEnvironment() {
  const [python, uv, git, npm, agents] = await Promise.all([
    version('python3', ['--version']),
    version('uv', ['--version']),
    version('git', ['--version']),
    version('npm', ['--version']),
    detectAgents(),
  ]);
  const subagents = await detectSubagents();

  return {
    os: `${os.type()} ${os.release()}`,
    runtime: `node ${process.versions.node}`,
    shell: process.env.SHELL || process.env.ComSpec || null,
    agent: detectAgent(),
    extra: {
      platform: process.platform,
      arch: process.arch,
      python, uv, git, npm,
      agents,
      subagents,
      mcpServers: agents.find((a) => a.agent === 'Claude Code')?.skills.mcpServers ?? 0,
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
