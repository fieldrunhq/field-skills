---
name: review-fieldrun
description: Review a completed Fieldrun run locally before it is submitted — read the notes, inspect the captured environment, and remove anything private. Use when the user wants to check, edit, clean up or inspect a field run, or asks what runs are on this machine. Operates on ~/.fieldruns/<CODE>/ and never uploads anything.
---

# Review Fieldrun

Read a run back to the user and let them fix it **before** it leaves the
machine. This skill never uploads. That is `submit-fieldrun`'s job, and keeping
the two apart is what makes this one safe to run at any time.

## Steps

### 1. Pick the run

With a code, use it. Without one, list what is on the machine with `listRuns()`
and let the user choose. If there are none, say so and point at
`/start-fieldrun`.

### 2. Show what is there

For the chosen run, show:

- the job title and brief from `job.json`,
- the run status from `run.json`,
- the captured fingerprint from `environment.json`, including the agent
  inventory: which agents are installed, session counts, and last-used dates,
- the notes from `NOTES.md`.

### 3. Check for anything private

This is the point of the skill. What a practitioner writes while debugging on
their own machine routinely contains things they would not choose to send:

- absolute paths carrying their real name (`/Users/jane.doe/...`),
- the captured agent inventory in `environment.json`, which **names** the
  plugins and skills installed on the machine. A plugin name can say what
  someone is working on or who they work for. Show the list and ask — naming is
  the default because an inventory of anonymous counts is worth little, but it
  is the user's call, not ours,
- API keys, tokens, connection strings pasted from a terminal,
- client or employer names, internal hostnames, ticket URLs,
- other people's names in copied output.

Read `NOTES.md` and `environment.json` and flag every candidate. Show the user
each one in context and ask what to do. **Do not edit silently** — a note that
has been quietly rewritten is no longer their observation.

Suggest replacements that keep the finding intact: `/Users/<me>/project` still
shows the shape of the problem, `<REDACTED_TOKEN>` still shows a token was
involved. The value is in what broke, not in whose machine it broke on.

### 4. Check the run is worth submitting

An accepted run needs an outcome and something a reader can act on. Before
declaring it ready, confirm:

- **outcome** is one of `pass`, `friction`, `blocker`;
- the notes say what actually happened, not just that it worked;
- if something failed, the notes say what the user did next.

"It worked" is a valid outcome and a poor observation. Ask what they expected,
where they hesitated, and what they had to look up. Those are the findings a
cloud VM cannot produce, and they are the reason the run is worth paying for.

### 5. Report

Tell the user whether the run is ready, what you changed at their direction, and
that `/submit-fieldrun <CODE>` sends it.

## Configuration

There is none. These skills need no account, no token and no credentials file —
if anything here asks the user to sign in, that is a bug.

`FIELDRUN_API_URL` overrides the API host (default: production) and
`FIELDRUN_HOME` overrides the run root; both exist for development.

## Never

- Never upload anything from this skill.
- Never edit the user's notes without showing them the change and getting a yes.
- Never invent an observation the user did not make.
