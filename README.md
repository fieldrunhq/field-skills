# field-skills

Run Fieldrun field jobs on your own machine in automatic or manual mode.

Run `/start-fieldrun <CODE>` and choose a mode. **Automatic** proceeds through three stages:

1. **Start:** Show the brief, reward, collection scope and automatic submission terms. Wait for participation consent, then perform the job and prepare findings.
2. **Review:** Check missing answers, weak observations, unclear outcomes and private information. Ask for unresolved details and wait. Apply the privacy rules agreed at the start.
3. **Submit:** When review passes, upload without a second submission confirmation, verify the saved result, and open the claim page.

**Manual** performs the same job and writes the findings into `NOTES.md`, then stops before review and submission. Read the prepared notes, then run `/review-fieldrun <CODE>` to review locally and `/submit-fieldrun <CODE>` to submit explicitly. Review alone never uploads.

Use the same start command to resume with the saved mode. An already-submitted run opens its existing claim link without another upload.

`start-fieldrun` **requires a job code** — ten characters such as `HFDJQXPC5I`.

## Every run lives in one place

```
~/.fieldruns/
  HFDJQXPC5I/
    job.json            title, brief, reward, started timestamp
    run.json            run ID, server status, stage, consent, outcome and claim URL
    PROMPT.md           the task, verbatim
    environment.json    the captured fingerprint
    NOTES.md            what you observed
  K3M8PQRW2Z/
    …
```

One root, one folder per job code, always the same shape. A practitioner builds
up runs over months, and scattering them through whatever directory they
happened to be in is how work gets lost. `FIELDRUN_HOME` overrides the root.

## No account, no token, nothing to configure

Install the plugin and run a job. That is the whole setup.

```
POST /runs/pending/start        → run id, brief, prompt
  ↓ you read the brief and say yes; the run directory is written
POST /runs/pending/:id/submit   → your claim URL
  ↓ open it and sign in
```

None of that needs a credential. You should be able to do a job and see what
the work is like before deciding to have anything to do with us — the account
is only needed to be *paid*, so that is the one place it is asked for: the
claim link you get after submitting. Keep that link; it is the only way to
claim the run. The skill reports the absolute expiry returned by the server; the window starts when the run starts, not when it is submitted.

Starting a job reserves nothing. No slot is consumed and no commitment is made,
so reading a brief and walking away costs the job nothing. The skill still asks
before it writes anything or shows you the prompt.

## Why the machine captures the environment

`captureEnvironment()` reads the OS and release, the Node version, the shell,
the host agent, and an **inventory of the AI agents installed on the machine**:
which are present, how many sessions each has, when each was last used, and the
names and versions of the Claude Code plugins configured, and the **subagents**
defined on the machine — because "agent" means both the host doing the work and
the subagents a practitioner has built inside it, and an inventory reporting
only the first misses how someone actually works.

Subagents are found through the host's own project list rather than by sweeping
the disk, and only their name, scope and declared tools are read. Never their
description and never the project path: a subagent description routinely names
the mailbox, the customer or the internal system it exists to handle.

It does not ask the practitioner any of this. People report the tool they
believe they are on and the version they believe they have, which is frequently
not the one executing — and they are worse still at remembering what they have
stopped using. A last-used date settles that; memory does not.

It reports **what was actually used**, not only what is installed: every skill
invoked, every subagent spawned and every MCP server called, with counts and
last-used dates. The two are different questions, and the gap between them is
frequently the finding — installed-and-never-run is invisible to a practitioner
asked to describe their own setup.

Transcripts are read structurally for this: each line is parsed as JSON, and
only tool-use records are inspected — the tool's name, plus the single argument
naming which skill or subagent. Message text, tool results, Bash commands, file
contents and every other tool's arguments are never read. A test pins that with
a fixture full of markers.

For Claude Code and Codex it also reports **per-project session counts and date
ranges** —
how many projects someone has going, how the work is spread across them, and how
recently each was touched. Counts and dates only, never the directory names:
those decode back to real paths and name employers, clients and unreleased work.

The two agents store this completely differently, which is the argument for
doing it in one tested place rather than per job:

| | Claude Code | Codex |
| --- | --- | --- |
| Layout | `projects/<launch-cwd>/*.jsonl` | `sessions/YYYY/MM/DD/rollout-*.jsonl` |
| Project from | the directory name | the rollout's opening record |
| Dates from | file mtime | the session's own timestamp |

And Claude Code has two traps that have already produced a run reporting no
history for a machine with 31 sessions: `~/.claude/sessions/` is session keys
rather than transcripts, and every real transcript directory is the launch cwd
with separators hyphenated, so it begins with `-` and breaks shell globbing.

For Codex only the first line of a rollout is read — session metadata, carrying
the cwd, the start time and the CLI version. Never a message.

Only file names, counts and modification times are read. No conversation
contents are ever opened, and the walk is depth-limited so a symlink cannot turn
environment capture into a full-disk scan.

The inventory **names** installed plugins, which is a real disclosure — a plugin
name can say what someone is working on. That is the default because an
inventory of anonymous counts is worth very little, and the integrated review inspects every field before submission. Participation
consent covers removing secrets and anonymizing identifying details. Review
asks about cases where those rules cannot resolve disclosure without changing
a material finding. The final notes are linked for the user to read, with a brief description of redactions,
before automatic submission; manual runs use the separate review and submit commands.
Questions that need answers appear directly in the conversation; the notes and original
job prompt are not reproduced there.

## Configuration

| Variable | Meaning |
| --- | --- |
| `FIELDRUN_API_URL` | API host. Defaults to production — see below |
| `FIELDRUN_HOME` | Overrides `~/.fieldruns` |

There is no token and no credentials file. Both variables above exist for
development; a practitioner sets neither.

### Environments

| | URL |
| --- | --- |
| Production (default) | `https://fieldrun-backend-production.up.railway.app` |
| Development | `https://alluring-renewal-develop.up.railway.app` |

```bash
FIELDRUN_API_URL=https://alluring-renewal-develop.up.railway.app \
  node --test plugins/fieldrun/tests/*.test.mjs
```

## Layout

```
.claude-plugin/marketplace.json
plugins/fieldrun/
  .claude-plugin/plugin.json
  lib/fieldrun.mjs          paths, API client, environment capture
  skills/start-fieldrun/SKILL.md
  skills/review-fieldrun/SKILL.md
  skills/submit-fieldrun/SKILL.md
  tests/fieldrun.test.mjs
```

`node --test plugins/fieldrun/tests/*.test.mjs` runs the suite. The tests point
`FIELDRUN_HOME` at a scratch directory, so they never read or write a real
practitioner's runs.

The job-code alphabet is duplicated from the server
(`packages/shared/src/lib/jobs/job-code.ts`) so a typo fails locally instead of
becoming a request. A test pins the two copies together — if the server's
alphabet ever changes, that test fails.
