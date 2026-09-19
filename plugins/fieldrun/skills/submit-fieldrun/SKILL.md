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
node -e "import('./lib/fieldrun.mjs').then(async m => console.log(JSON.stringify(await m.submitAnonymously('CODE', payload), null, 2)))"
```

**No sign-in is needed here, and that is deliberate.** The submission is recorded
unattributed and returns a URL. Write the URL and its expiry into `run.json`, so
a practitioner who closes the terminal can still find it.

Handle the failures plainly:

- `404 JOB_NOT_FOUND` — the code does not resolve, or the job is no longer open.
- `400 INVALID_OUTCOME` — the outcome was not one of the three.
- `429 RATE_LIMITED` — too many submissions from this machine in an hour.

### 5. Give them the link

Show the URL on its own line and say plainly what it does:

> Your run is recorded. Open this to add it to your account:
> https://fieldrun.io/submit/<token>
>
> Nothing is attached to anyone until you open it and sign in. The link is good
> for 7 days, and it is in `~/fieldruns/<CODE>/run.json` if you need it later.

That sentence matters. A practitioner has just handed over work and has no
account yet — telling them exactly when it becomes theirs is the difference
between a link that gets clicked and one that looks like a tracking pixel.

Leave the local directory in place; the practitioner keeps their own record.

## Never

- Never submit without showing the payload and getting a yes.
- Never submit a run the user has not been able to read first.
- Never rewrite the user's notes on the way out; submit what they wrote.
- Never resubmit a run that already has a submission URL in `run.json` — show
  them the existing link instead.
