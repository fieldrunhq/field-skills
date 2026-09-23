---
name: review-fieldrun
description: Review a completed Fieldrun run locally before it is submitted — read the notes, inspect the captured environment, and remove anything private. Use when the user wants to check, edit, clean up or inspect a field run, or asks what runs are on this machine. Operates on the saved local run and never uploads anything.
---

# Review Fieldrun

Help the user read and fix a saved run **before** it leaves the
machine. This skill never uploads. That is `submit-fieldrun`'s job, and keeping
the two apart is what makes this one safe to run at any time.

## Runtime

Resolve `lib/fieldrun.mjs` beside this skill in a standalone installation, or `../../lib/fieldrun.mjs` in the plugin, and import it by absolute path. Use `runFiles(code)` so `FIELDRUN_HOME` is respected. Normalize and validate the ten-character job code before opening files or calling the API. Preserve existing fields, including `consent.automaticSubmission`, when updating `run.json`. Use the user's language.

## Steps

### 1. Pick the run

With a code, use it. Without one, list what is on the machine with `listRuns()`
and let the user choose. If there are none, say so and point at
`/start-fieldrun`.

### 2. Show what is there

For the chosen run, show:

- the job title and brief from `job.json`,
- the run status from `run.json`,
- clickable links to `NOTES.md` and `environment.json`, inviting the user to read them.

Do not reproduce the notes, original job prompt, or raw environment data in the conversation. Write questions that need an answer directly in the conversation, with enough context to answer without opening the files.

### 3. Check for anything private

This is the point of the skill. What a practitioner writes while debugging on
their own machine routinely contains things they would not choose to send:

- absolute paths carrying their real name (`/Users/jane.doe/...`),
- the captured **subagent names** in `environment.json`. These are the single
  most telling field captured: a subagent is named after the job it does, so
  `support-triage` says the practitioner runs a support desk and `acme-billing`
  names a client outright. Descriptions and project paths are never captured,
  but the names alone can be enough,
- the captured agent inventory in `environment.json`, which **names** the
  plugins and skills installed on the machine. A plugin name can say what
  someone is working on or who they work for. Naming is
  the default because an inventory of anonymous counts is worth little, but it
  is the user's call, not ours,
- API keys, tokens, connection strings pasted from a terminal,
- client or employer names, internal hostnames, ticket URLs,
- other people's names in copied output.

Read `NOTES.md` and `environment.json` and flag every candidate. Never display raw secrets. Show masked examples. Apply privacy redactions covered by the recorded participation consent and explain the changes. Ask before edits that change a material finding or exceed that consent.

Suggest replacements that keep the finding intact: `/Users/<me>/project` still
shows the shape of the problem, `<REDACTED_TOKEN>` still shows a token was
involved. The value is in what broke, not in whose machine it broke on.

### 4. Check the run is worth submitting

Compare the notes with `PROMPT.md`. Missing required answers and placeholders block completion; ask for what evidence cannot answer, save the unresolved items with `stage: "review"`, and wait. Do not invent personal experience or erase unanswered questions. Explicit, reasoned unknowns may remain when the job permits them; a missing required deliverable is incomplete, not a pass.

An accepted run needs an outcome and something a reader can act on. Before
declaring it ready, confirm:

- **outcome** is one of `pass`, `friction`, `blocker`;
- the notes say what actually happened, not just that it worked;
- if something failed, the notes say what the user did next.

"It worked" is a valid outcome and a poor observation. Ask what they expected,
where they hesitated, and what they had to look up. Those are the findings a
cloud VM cannot produce, and they are the reason the run is worth paying for.

### 5. Show the output, report, and say what happens next

After any edits, link to the saved `NOTES.md` and invite the user to read it. Do not paste its contents into the conversation. Tell them whether it is ready and briefly explain what changed. Write any unresolved questions directly in the conversation.
For an unsubmitted run, when ready, save the outcome in `run.json` and set local `stage: "submit"` without changing server status. Preserve terminal stages for already-submitted runs. Stop after this review even if the saved automatic-submission flag is true: invoking review alone does not request an upload.
Then end with this block, with the real code substituted and the `→` on whichever
line is actually next:

```
  NEXT  ─────────────────────────────────────────────────────────

  →  /submit-fieldrun <CODE>     send it, and get your claim link

     ~/.fieldruns/<CODE>/NOTES.md    still missing an outcome or observations

  ────────────────────────────────────────────────────────────────
```

If the run is not ready — no outcome, or notes that say nothing a reader can
act on — put the arrow on the NOTES.md line instead and say what is missing.
Only ever one arrow.

## Configuration

There is none. These skills need no account, no token and no credentials file —
if anything here asks the user to sign in, that is a bug.

`FIELDRUN_API_URL` overrides the API host (default: production) and
`FIELDRUN_HOME` overrides the run root; both exist for development.

## Never

- Never upload anything from this skill.
- Never change a material finding without the user's agreement; explain consented privacy redactions.
- Never invent an observation the user did not make.
