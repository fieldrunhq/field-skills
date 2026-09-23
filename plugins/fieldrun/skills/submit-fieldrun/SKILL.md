---
name: submit-fieldrun
description: Submit a reviewed Fieldrun run back to Fieldrun — the outcome, the notes and the environment fingerprint. Use when the user wants to send, submit, upload or finish a field run. Requires the job code, needs no account, confirms exactly what will be sent, and hands back a claim URL where the practitioner signs in to be paid.
---

# Submit Fieldrun

Send one completed run back to Fieldrun.

This is the separate submission command for manual runs. `start-fieldrun` also submits in Automatic mode. A completed start or review in Manual does not authorize submission; require the user's explicit submission request. Honor existing authorization for the same payload and scope instead of asking twice.

## Runtime

Resolve `lib/fieldrun.mjs` beside this skill in a standalone installation, or `../../lib/fieldrun.mjs` in the plugin, and import it by absolute path. Use `runFiles(code)` so `FIELDRUN_HOME` is respected. Normalize and validate the ten-character job code before opening files or calling the API. Preserve existing fields, including `consent.automaticSubmission`, when updating `run.json`. Use the user's language.

## Steps

### 1. Load the run

Read `~/.fieldruns/<CODE>/` — `run.json` for the run id, `NOTES.md` for the
observations, `environment.json` for the fingerprint.

- No directory for that code: nothing to submit, point at `/start-fieldrun`.
- `run.json` missing a run id: preserve the files and explain that setup is incomplete; do not mint a replacement silently.
- Call `getRun` before uploading. Require both `ok` and `body.success`. If status is `submitted` or `claimed`, reopen the existing claim link without uploading again. If the saved link is missing, recover the same run's claim route from the configured service's verified web origin.
- If server status cannot be checked, preserve the work and stop.
- Require the reviewed outcome, notes, and environment. If required answers are unresolved or the files changed after review, return to `/review-fieldrun` before uploading.

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

Print the full payload: the outcome, `NOTES.md` in full, and every field of the
environment fingerprint. In full — a summary is not something a user can consent
to, because the thing they would object to is exactly what a summary drops. Ask for confirmation only if the user has not already explicitly authorized submission of these results. Never print raw secrets; return to review if any remain.

The user must be able to see the fingerprint before it goes. It includes their
OS and release, runtime and shell, and the agent inventory — which agents are
installed, how many sessions each has, when each was last used, and the
**names** of the Claude Code plugins and of any subagents configured on the
machine. If they are not comfortable with a field, drop it and send the rest
— a run with a missing field is still useful; a run the user regrets is not.

If they have not completed `/review-fieldrun`, ask them to review before sending. Submission
cannot be undone from here.

### 4. Submit

Build `payload = { outcome, notes, environment }` from the reviewed saved files, then call `submitRun(runId, payload)` using the resolved helper.

`RUN_ID` is the id in `run.json`, not the job code. No account is needed to
send: the upload is anonymous, and it is the claim URL that comes back which
ties the work to a person.

Require both `ok` and `body.success`. Before uploading, set local `stage: "submit"`. On success, save `status: "submitted"`, `stage: "done"`, `submittedAt`, and the returned `url` and `expiresAt`. The response may omit status; never overwrite it with an undefined value.

Call `getRun(runId)` and verify the ID, job code, submitted/claimed status, outcome, notes, and environment. The server trims surrounding whitespace from notes; compare the readback with the saved notes after that normalization, without ignoring other differences. The server exposes `os`, `runtime`, `shell`, and `agent` at the top level and stores `environment.extra` as `run.environment`. Report submission and verification separately if readback fails; do not upload again merely because verification failed.

Handle failures without losing the local findings:

- `409 ALREADY_SUBMITTED` / `ALREADY_CLAIMED`: reconcile with `getRun` and reopen the same claim URL.
- `410 EXPIRED`: preserve the findings and explain that a new run requires the user's decision.
- `404 NOT_FOUND`: preserve the files and report that the saved run could not be found.
- `400 INVALID_OUTCOME` / `TOO_LONG`: correct the invalid value without dropping required findings before retrying.
- `429 RATE_LIMITED`: stop retrying and report the limit.
- Network interruption or uncertain response: check `getRun` first. Retry once only if it confirms the run is unsubmitted; stop if status remains unknown.

### 5. Report, and hand over the claim URL

The response carries a `url`. **Give it to the user and explain what it is**,
because this is the one thing they must act on. Write it into `run.json` as
well, so it survives the chat being lost.

End with this block, with the real URL substituted:

```
  NEXT  ─────────────────────────────────────────────────────────

  →  Claim your run:  <the claim URL>
     Signing in there attaches this run to your account so you can be paid.
     Claim it before <the server expiry as an absolute date and time with timezone>.

  ────────────────────────────────────────────────────────────────
```

Open the returned claim URL in a visible browser and inspect the page. Verify that it shows this run's claim or sign-in flow; if inspection is unavailable, report that limitation. Do not sign in or claim on the user's behalf.

Then confirm what was sent and that the customer reviews it next. Leave the
local directory in place; the practitioner keeps their own record.

## Configuration

There is none. These skills need no account, no token and no credentials file —
if anything here asks the user to sign in, that is a bug.

`FIELDRUN_API_URL` overrides the API host (default: production) and
`FIELDRUN_HOME` overrides the run root; both exist for development.

## Never

- Never submit without showing the reviewed payload and explicit user authorization for submission.
- Never submit a run the user has not been able to read first.
- Never rewrite the user's notes on the way out; submit what they wrote.
- Never resubmit a run that already has a terminal status.
- Never ask the user to sign in before submitting. The claim URL is where that
  happens, and only after the work is safely uploaded.
