# field-skills

Three Claude Code skills for running Fieldrun field jobs on your own machine.

| Skill | Does |
| --- | --- |
| `/start-fieldrun <CODE>` | Starts a job, shows the brief, sets it up on your say-so, captures the environment, writes the run directory |
| `/review-fieldrun [CODE]` | Reads a run back to you and strips anything private. Never uploads |
| `/submit-fieldrun <CODE>` | Shows exactly what will be sent, submits it, and hands back your claim link |

`start-fieldrun` **requires a job code** — ten characters such as `HFDJQXPC5I`.

## Every run lives in one place

```
~/.fieldruns/
  HFDJQXPC5I/
    job.json            title, brief, reward, started timestamp
    run.json            run id, status, and your claim URL once submitted
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
claim the run, and it expires after two weeks.

Starting a job reserves nothing. No slot is consumed and no commitment is made,
so reading a brief and walking away costs the job nothing. The skill still asks
before it writes anything or shows you the prompt.

## Why the machine captures the environment

`captureEnvironment()` reads the OS and release, the Node version, the shell,
the host agent, and an **inventory of the AI agents installed on the machine**:
which are present, how many sessions each has, when each was last used, and the
names and versions of the Claude Code plugins configured.

It does not ask the practitioner any of this. People report the tool they
believe they are on and the version they believe they have, which is frequently
not the one executing — and they are worse still at remembering what they have
stopped using. A last-used date settles that; memory does not.

Only file names, counts and modification times are read. No conversation
contents are ever opened, and the walk is depth-limited so a symlink cannot turn
environment capture into a full-disk scan.

The inventory **names** installed plugins, which is a real disclosure — a plugin
name can say what someone is working on. That is the default because an
inventory of anonymous counts is worth very little, but `review-fieldrun` shows
the list and lets the practitioner cut anything they would rather not send, and
`submit-fieldrun` shows the whole payload before it goes.

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
