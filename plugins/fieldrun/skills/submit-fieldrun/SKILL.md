---
name: submit-fieldrun
description: Submit a reviewed Fieldrun run back to Fieldrun — the outcome, the notes and the environment fingerprint. Use when the user wants to send, submit, upload or finish a field run. Requires the job code, confirms exactly what will be sent, and only then posts to the API.
---

# Submit Fieldrun

Send one completed run back to Fieldrun.

This is the only skill of the three that transmits anything, so it asks before
it does, every time.

## Steps

### 1. Load the run

Read `~/fieldruns/<CODE>/` — `run.json` for the run id, `NOTES.md` for the
observations, `environment.json` for the fingerprint.

- No directory for that code: nothing to submit, point at `/start-fieldrun`.
- `run.json` missing a run id: the claim never completed; the run must be
  started again.
- Status already `submitted`, `accepted` or `rejected`: it has been sent. Say so
  and stop rather than sending a second time.

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
OS and release, runtime and shell, and a count of the MCP servers configured on
the machine. If they are not comfortable with a field, drop it and send the rest
— a run with a missing field is still useful; a run the user regrets is not.

If they have not run `/review-fieldrun`, suggest it before sending. Submission
cannot be undone from here.

### 4. Submit

```bash
node -e "import('./lib/fieldrun.mjs').then(async m => console.log(JSON.stringify(await m.submitRun('RUN_ID', payload), null, 2)))"
```

Then update `run.json` with the returned status, so a second invocation can tell
the run has already gone.

Handle the failures plainly:

- `409 INVALID_STATUS` — already submitted. Nothing was sent twice.
- `403 FORBIDDEN` — this run belongs to another account. Check the token.
- `400 INVALID_OUTCOME` — the outcome was not one of the three.
- `401` — the machine token is missing or revoked.

### 5. Report

Confirm what was sent and that the customer reviews it next. Leave the local
directory in place; the practitioner keeps their own record.

## Authentication

Every Fieldrun skill needs a machine token. If `readToken()` returns nothing,
stop and tell the user exactly this, then wait:

> You need a machine token first. Create one at
> https://fieldrun.io/settings/tokens, then run:
>
> ```
> mkdir -p ~/.fieldrun
> echo '{"token":"fr_..."}' > ~/.fieldrun/credentials.json
> ```

`FIELDRUN_TOKEN` overrides the file if it is set. A `401` from any call means the
token is wrong or has been revoked — say so plainly rather than retrying.

The token lives in `~/.fieldrun/`, never in `~/fieldruns/`. The latter is handed
back to Fieldrun, and a credential must never sit somewhere it can be uploaded
by accident.

## Never

- Never submit without showing the payload and getting a yes.
- Never submit a run the user has not been able to read first.
- Never rewrite the user's notes on the way out; submit what they wrote.
- Never resubmit a run that already has a terminal status.
