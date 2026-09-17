# field-skills

Three Claude Code skills for running Fieldrun field jobs on your own machine.

| Skill | Does |
| --- | --- |
| `/start-fieldrun <CODE>` | Looks up a job, shows the brief, claims it on your say-so, captures the environment, writes the run directory |
| `/review-fieldrun [CODE]` | Reads a run back to you and strips anything private. Never uploads |
| `/submit-fieldrun <CODE>` | Shows exactly what will be sent, then submits it |

`start-fieldrun` **requires a job code** — five characters such as `4HGP6`.

## Every run lives in one place

```
~/fieldruns/
  4HGP6/
    job.json            title, brief, reward, claimed timestamp
    run.json            run id and status
    PROMPT.md           the task, verbatim
    environment.json    the captured fingerprint
    NOTES.md            what you observed
  DYG2R/
    …
```

One root, one folder per job code, always the same shape. A practitioner builds
up runs over months, and scattering them through whatever directory they
happened to be in is how work gets lost. `FIELDRUN_HOME` overrides the root.

## The order matters

```
GET  /run/:code        → title, brief, reward        (no prompt)
  ↓ the user reads the brief and says yes
POST /run/:code/claim  → the run, and the prompt
```

The prompt only arrives with the claim. Consent comes before instructions, and
the skill never claims on the user's behalf — claiming consumes a slot, is
one-per-person-per-job, and cannot be undone from here.

## Why the machine captures the environment

`captureEnvironment()` reads the OS and release, the Node version, the shell,
the host agent, and a **count** of the MCP servers already configured. It does
not ask the practitioner, because people report the version they believe they
are on, which is frequently not the one executing.

The MCP server count is the single field most likely to explain a result: a
tool-name collision only happens on a machine that already has other servers,
and that is exactly the machine nobody can reproduce in CI. Only the count is
read — never what those servers are or what they connect to.

## Configuration

| Variable | Meaning |
| --- | --- |
| `FIELDRUN_API_URL` | API host. Defaults to production — see below |
| `FIELDRUN_TOKEN` | Firebase ID token. `dev:<uid>` uses the development bypass against a non-production server |
| `FIELDRUN_HOME` | Overrides `~/fieldruns` |

The token is read from the environment on purpose: it must never be written into
the run directory, because that directory is what gets handed back to Fieldrun.

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
