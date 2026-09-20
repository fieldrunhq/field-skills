---
name: start-fieldrun
description: Start a Fieldrun field job on this machine from its ten-character job code. Use when the user wants to begin, accept or run a Fieldrun job, or gives a job code such as HFDJQXPC5I. The job code is required — ask for it if the user did not provide one. No account or token is needed. Shows the brief and gets explicit consent before setting the job up, captures the environment fingerprint, and writes everything to ~/.fieldruns/<CODE>/.
---

# Start Fieldrun

Set one Fieldrun job up to be run on this machine.

**No sign-in, no token, nothing to configure.** If the user has just installed
the plugin, this works. The only moment an account is ever needed is after the
run is submitted, to be paid for it — and `submit-fieldrun` hands them that link
when the time comes.

A job code is **required**. If the command arguments contain one, use it. If not,
ask the user for it with AskUserQuestion and stop until you have it — there is
nothing useful to do without a code.

## What a job code looks like

Ten characters from `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`, for example
`HFDJQXPC5I`. Uppercase only, so there is no case to get wrong; input is
accepted in any case and uppercased.

If the id the user gave is not ten valid characters, say so and ask again
rather than calling the API — a malformed code cannot match a job.

## Steps

### 1. Start the run

```bash
node -e "import('./lib/fieldrun.mjs').then(async m => console.log(JSON.stringify(await m.startRun('CODE'), null, 2)))"
```

This returns the run id, the job (title, brief, reward, cap), the prompt and any
sample output, all at once.

- `404 JOB_NOT_FOUND` — no such job, or it is not approved. Tell the user the
  code did not resolve. Do not retry variations of it.
- `429 RATE_LIMITED` — too many starts from this address in the last hour.

Starting reserves nothing. No slot is consumed and no commitment is made, so a
user who reads the brief and walks away has cost the job nothing. **Keep the run
id** — `submit-fieldrun` needs it, and it is the only handle on this run.

### 2. Get explicit consent

Show the user the title, the brief and the reward. Then ask — with
AskUserQuestion — whether they want to do the job.

If they decline, stop. Do not write the run directory and do not show them the
prompt. The run id simply expires unused.

### 3. Write the run directory

Only after the user has said yes.

**Use the run id and prompt you already have from step 1. Do not call
`startRun` again.** A second call mints a second run, and the id you show the
user then disagrees with the one written to disk — the first thing this skill
got wrong in real use.

Everything for every job lives under one root,
`~/.fieldruns`, one folder per code. Create `~/.fieldruns/<CODE>/` and write:

| File | Contents |
| --- | --- |
| `job.json` | code, title, brief, reward, started timestamp |
| `run.json` | the **run id** and status — `submit-fieldrun` needs the id |
| `PROMPT.md` | the prompt from the start response, verbatim |
| `environment.json` | the captured fingerprint |
| `NOTES.md` | a template for the practitioner's observations |

Capture the environment with `captureEnvironment()` rather than asking the user
what they are running. People report the version they believe they are on, which
is often not the one that is actually executing.

### 4. Do the work the machine can do

Read what can be read. A practitioner asked to describe their own setup reports
what they believe is installed, which is frequently not what is; `captureEnvironment()`
already returns which agents are present, how many sessions each has and when
each was last used, and a job asking about the machine should be answered from
that rather than from memory.

**Never go looking for session history by hand.** `captureEnvironment()` already
returns it, per project, and two traps make a manual search reliably report
nothing on a machine that is full of it:

- `~/.claude/sessions/` is **not** the sessions. It holds session keys and
  metadata and contains no transcripts. The name is a decoy.
- The real transcripts are `~/.claude/projects/<launch-cwd>/*.jsonl`, and every
  one of those directory names begins with `-`. A shell `find projects/* -name
  '*.jsonl'` reads that as a flag and fails or returns nothing.

Codex is different again — it partitions by date, not by project, so its
projects can only come from inside each rollout file. `captureEnvironment()`
handles both.

Both Claude Code traps have already produced a run reporting "no session
history" for a machine with 31 sessions across 8 projects. If you find yourself about to write that
someone has no history, you have hit one of these — use the captured data.

A false negative is worse than a gap. "This practitioner had no sessions" reads
as a finding, and a customer will bank it.

So: gather every fact the machine can answer, write it into `NOTES.md` clearly
marked as captured, and leave the rest blank for the user. What stays theirs is
judgment, history and friction — which tools they have actually abandoned and
why, what they had to guess, where they hesitated. Those are the findings worth
paying for, and they cannot be read off a disk.

Never present a captured fact as something the user observed, and never fill in
their half. An invented observation is worse than a missing one: the customer
cannot tell the difference, and the whole product rests on them being able to
trust that a reported experience was someone's.

If the job asks for something to be **run** — install this, try that command —
run it here, on this machine. That is the point of Fieldrun: the agent working
in a real environment is the field test. Stop and ask before anything
destructive, anything that touches credentials, or anything that changes state
the user would not expect a job to change.

### 5. Show the output, then say what happens next

**Print `NOTES.md` in full.** Not a summary, not a path — the actual content, so
the user can see what was captured and what is still blank. A file they have not
read is a file they will not finish, and "it's in the run directory" is how a run
gets abandoned. Show what you captured and show the sections left for them.

Then end with this block, verbatim in shape, with the real code substituted. It
is fenced so it renders as one visually distinct unit rather than dissolving into
the paragraph above it:

```
  NEXT  ─────────────────────────────────────────────────────────

  →  /submit-fieldrun <CODE>     send it, and get your claim link

     Fill in the blank sections of NOTES.md first — that is the part
     worth paying for. /review-fieldrun <CODE> checks it over for
     anything private before it leaves the machine.

  ────────────────────────────────────────────────────────────────
```

Submit is the arrow. Review is worth doing and is worth mentioning, but it is an
optional safety step, and a run that never gets submitted is worth nothing to the
practitioner, the customer or us. Point at the thing that completes the loop and
let the careful step sit underneath it.

Only ever one arrow: three equally weighted options is the same as no guidance,
and the whole point of the block is that someone skimming knows what to type.

Never end this skill without showing the output and that block.

## Configuration

There is none, and there should be none. `FIELDRUN_API_URL` overrides the API
host (default: production) and `FIELDRUN_HOME` overrides the run root; both
exist for development and neither is something a practitioner needs to set.

If any call returns `401`, that is a bug in the service, not a missing login —
these endpoints are public. Say so rather than asking the user for a token.

## Never

- Never ask the user to sign in, create a token, or write a credentials file.
  None of these skills use one.
- Never show the prompt or write the run directory before the user has accepted.
- Never write the run directory anywhere but `~/.fieldruns/<CODE>/`.
- Never write an observation the user did not make, or fill in the judgment
  half of `NOTES.md` on their behalf.
- Never run anything destructive, credential-touching, or state-changing beyond
  what the job plainly asks for, without asking first.
