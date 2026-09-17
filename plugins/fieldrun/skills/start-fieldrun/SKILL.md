---
name: start-fieldrun
description: Start a Fieldrun field job on this machine from its five-character job code. Use when the user wants to begin, claim, accept or run a Fieldrun job, or gives a job code such as 4HGP6. The job code is required — ask for it if the user did not provide one. Shows the brief and gets explicit consent before claiming, captures the environment fingerprint, and writes everything to ~/fieldruns/<CODE>/.
---

# Start Fieldrun

Claim one Fieldrun job and set it up to be run on this machine.

A job code is **required**. If the command arguments contain one, use it. If not,
ask the user for it with AskUserQuestion and stop until you have it — there is
nothing useful to do without a code.

## What a job code looks like

Five characters from `23456789ABCDEFGHJKMNPQRSTVWXYZ`, for example `4HGP6`.
`0`, `1`, `O`, `I`, `L` and `U` are never in a code. Input is case-insensitive.

If the code the user gave is not five valid characters, say so and ask again
rather than calling the API — a malformed code cannot match a job.

## Steps

### 1. Look up the job, before claiming anything

```bash
node -e "import('./lib/fieldrun.mjs').then(async m => console.log(JSON.stringify(await m.getJob('CODE'), null, 2)))"
```

This returns the title, the brief, the reward and the cap. **It deliberately
does not return the prompt.** The brief is what the user is consenting to.

- `404` — no such job, or it is not approved. Tell the user the code did not
  resolve. Do not retry variations of it.
- `400` — the code is malformed.

### 2. Get explicit consent

Show the user the title, the brief, and the reward. Then ask — with
AskUserQuestion — whether to accept the job. **Do not claim on their behalf.**

Claiming is a commitment: it consumes one of the job's slots, it is one run per
person per job, and it cannot be undone from here. A user who has not read the
brief has not consented to anything.

If they decline, stop. Do not claim, and do not create any directory.

### 3. Claim it

Only after the user has said yes:

```bash
node -e "import('./lib/fieldrun.mjs').then(async m => console.log(JSON.stringify(await m.claimJob('CODE'), null, 2)))"
```

The claim response carries the **prompt** — the actual work. This is the first
point at which the instructions exist locally, which is the intended order:
consent, then instructions.

Handle the failures plainly:

- `409 ALREADY_CLAIMED` — they already hold a run on this job. Point them at
  `/review-fieldrun` instead of claiming again.
- `409 JOB_FULL` — the job hit its cap. Nothing to do.
- `403 OWN_JOB` — this is their own job; a customer cannot run it themselves.
- `401` — not signed in. See **Authentication** below.

### 4. Write the run directory

Everything for every job lives under one root, `~/fieldruns`, one folder per
code. Create `~/fieldruns/<CODE>/` and write:

| File | Contents |
| --- | --- |
| `job.json` | code, title, brief, reward, claimed timestamp |
| `run.json` | the run id and status — `submit-fieldrun` needs the id |
| `PROMPT.md` | the prompt from the claim response, verbatim |
| `environment.json` | the captured fingerprint |
| `NOTES.md` | a template for the practitioner's observations |

Capture the environment with `captureEnvironment()` rather than asking the user
what they are running. People report the version they believe they are on, which
is often not the one that is actually executing.

### 5. Hand over

Tell the user:

- where the run directory is,
- that `PROMPT.md` holds the task,
- that they should record what happened in `NOTES.md` as they go — especially
  anything they had to guess, work around, or read twice,
- that `/submit-fieldrun <CODE>` sends it back when they are done.

Then **stop**. Do not run the prompt for them. The deliverable is what a
practitioner observes on their own machine; an agent executing the task instead
produces a result about this session, not about their environment.

## Authentication

Set `FIELDRUN_TOKEN` to a Firebase ID token. Against a non-production server a
value of `dev:<uid>` uses the development bypass instead.

`FIELDRUN_API_URL` overrides the API host (default `https://api.fieldrun.dev`).

## Never

- Never claim a job the user has not explicitly accepted.
- Never write the run directory anywhere but `~/fieldruns/<CODE>/`.
- Never put the auth token inside the run directory — that directory is handed
  back to Fieldrun.
- Never run the job's prompt yourself.
