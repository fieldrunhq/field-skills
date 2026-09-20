---
name: submit-fieldrun
description: Submit a reviewed Fieldrun run back to Fieldrun — the outcome, the notes and the environment fingerprint. Use when the user wants to send, submit, upload or finish a field run. Requires the job code, needs no account, confirms exactly what will be sent, and hands back a claim URL where the practitioner signs in to be paid.
---

# Submit Fieldrun

Send one completed run back to Fieldrun.

This is the only skill of the three that transmits anything, so it asks before
it does, every time.

## Steps

### 1. Load the run

Read `~/.fieldruns/<CODE>/` — `run.json` for the run id, `NOTES.md` for the
observations, `environment.json` for the fingerprint.

- No directory for that code: nothing to submit, point at `/start-fieldrun`.
- `run.json` missing a run id: the start never completed; run `/start-fieldrun`
  again to get a new run id.
- Status already `submitted`: it has been sent. Show the claim URL stored in
  `run.json` and stop rather than sending a second time.

### 2. Establish the outcome

The outcome is required and must be exactly one of:

| Outcome | Means |
| --- | --- |
| `pass` | Finished as the job intended |
| `friction` | Finished, but something got in the way |
| `blocker` | Could not finish |

If the notes do not make the outcome unambiguous, ask with AskUserQuestion. Do
not infer it — the outcome is the field the findings report ranks by, and a
guess here becomes a wrong number in front of a customer.

### 3. Show exactly what will be sent, then ask

Print the full payload: outcome, notes, and every field of the environment
fingerprint. Then ask for explicit confirmation.

The user must be able to see the fingerprint before it goes. It includes their
OS and release, runtime and shell, and the agent inventory — which agents are
installed, how many sessions each has, when each was last used, and the
**names** of the Claude Code plugins on the machine. If they are not comfortable with a field, drop it and send the rest
— a run with a missing field is still useful; a run the user regrets is not.

If they have not run `/review-fieldrun`, suggest it before sending. Submission
cannot be undone from here.

### 4. Submit

```bash
node -e "import('./lib/fieldrun.mjs').then(async m => console.log(JSON.stringify(await m.submitRun('RUN_ID', payload), null, 2)))"
```

`RUN_ID` is the id in `run.json`, not the job code. No account is needed to
send: the upload is anonymous, and it is the claim URL that comes back which
ties the work to a person.

Then update `run.json` with the returned status and the returned `url`, so a
second invocation can tell the run has already gone and can show the link again.

Handle the failures plainly:

- `409 ALREADY_SUBMITTED` — already sent. Nothing was sent twice; show the
  claim URL from `run.json`.
- `409 ALREADY_CLAIMED` — already submitted and already claimed by an account.
- `410 EXPIRED` — the run sat unsubmitted past its two-week window. The work
  cannot be sent; starting the job again is the only option.
- `404 NOT_FOUND` — the run id does not resolve.
- `400 INVALID_OUTCOME` — the outcome was not one of the three.
- `429 RATE_LIMITED` — too many submissions from this address in the last hour.

### 5. Report and hand over the claim URL

The response carries a `url`. **Give it to the user and explain what it is**,
because this is the one thing they must act on:

> Submitted. Claim it at <the URL> — opening that link and signing in attaches
> this run to your account so you can be paid for it. The link is the only way
> to claim this run, so keep it; it expires in two weeks.

Write the URL into `run.json` as well, so it is recoverable from the run
directory if the chat is lost.

Then confirm what was sent and that the customer reviews it next. Leave the
local directory in place; the practitioner keeps their own record.

## Configuration

There is none. These skills need no account, no token and no credentials file —
if anything here asks the user to sign in, that is a bug.

`FIELDRUN_API_URL` overrides the API host (default: production) and
`FIELDRUN_HOME` overrides the run root; both exist for development.

## Never

- Never submit without showing the payload and getting a yes.
- Never submit a run the user has not been able to read first.
- Never rewrite the user's notes on the way out; submit what they wrote.
- Never resubmit a run that already has a terminal status.
- Never ask the user to sign in before submitting. The claim URL is where that
  happens, and only after the work is safely uploaded.
