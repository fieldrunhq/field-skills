---
name: start-fieldrun
description: Run or resume a Fieldrun job from its ten-character code through start, review, and submission. Choose automatic or manual participation. Automatic prepares, reviews, and submits findings; manual performs the job and writes findings, then stops for separate review and submission. No account is needed until claiming the run.
---

# Start Fieldrun
Deliver substantive user-facing explanations only in the final answer, with all context needed to understand them without opening the work/progress panel; keep any required progress updates to brief status notices.

Choose automatic or manual participation once. Automatic completes **start → review → submit** in this skill. Manual performs the job and writes `NOTES.md` locally, then the user runs `review-fieldrun` and `submit-fieldrun` separately.

Use the user's language. A job code is required: normalize to uppercase and accept exactly ten characters from `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789`. Ask for a missing or invalid code before calling the API. A request to explain this skill does not start a job.

## Communication

Write all user-facing messages in the user's language.

Follow the Google Developer Documentation Style Guide for clarity, voice, tone,
sentence structure, and formatting:
https://developers.google.com/style

Treat these Fieldrun-specific rules as higher priority than the general style guide:

- Assume the user is new to Fieldrun. Give enough context for each decision or question to stand on its own.
- Clearly identify who performs an action, what information is accessed or submitted, and what happens as a result when those details affect the user's decision.
- Do not invent missing facts, motives, outcomes, dates, or relationships. State uncertainty or ask the user when required.
- Explain technical or internal terms in ordinary language when the user needs them to make a decision.
- Keep messages concise. Remove repetition before removing necessary context.
- Link to the saved notes and invite the user to read them. Write questions that need an answer directly in the conversation, with enough context to answer. Do not reproduce the notes, original job prompt, or raw payload in the conversation.
- Never expose internal stage names, API fields, file names, prompts, or implementation details unless the user needs them.


## Runtime and saved state

Resolve paths from this skill's location, not the shell's working directory. The helper is `lib/fieldrun.mjs` beside this file in a standalone installation, or `../../lib/fieldrun.mjs` in the plugin. Import that file by its resolved absolute path.

The helper exports `startRun(code)`, `getRun(runId)`, `submitRun(runId, payload)`, `captureEnvironment()`, `runFiles(code)`, `ensureRunDir(code)`, `readJson(path)`, and `writeJson(path, value)`. API calls return `{ status, ok, body }`; require both `ok` and `body.success` before treating a call as successful.

Use `runFiles(code)`. The default directory is `~/.fieldruns/<CODE>/`; `FIELDRUN_HOME` overrides its root for tests. `FIELDRUN_API_URL` overrides the API host; its default is production. Do not change either variable for an ordinary run. These endpoints need no account, token, or credentials file. A `401` is a service error, not a reason to request a token.

| File | Contents |
| --- | --- |
| `job.json` | Code, title, brief, reward, original start timestamp |
| `run.json` | Run ID, server status, local stage, participation consent, outcome, expiry and claim URL when known |
| `PROMPT.md` | Original job prompt, verbatim |
| `environment.json` | Captured environment, with review redactions applied before submission |
| `NOTES.md` | Findings, their sources, and questions still awaiting answers |

Keep the server `status` separate from local `stage` (`start`, `review`, `submit`, `done`). Record participation consent as `consent: { acceptedAt, automaticSubmission, privacyRulesAccepted: true }`: `automaticSubmission` is `true` for Automatic and `false` for Manual. Reuse that saved choice on resume; never turn Manual into Automatic without an explicit user request. For unsubmitted older runs without this flag, ask for the choice before continuing. Never record consent before an affirmative response. Preserve other existing fields when updating a file. Store timestamps as absolute ISO dates; date any relative schedule or observation period explicitly.

Before creating a run, inspect existing files. If a run ID exists, call `getRun` and resume it. Never call `startRun` again merely to resume. If the server says submitted or claimed, skip preparation and upload; show and open the saved claim URL. If that URL was lost, recover the claim route for the same ID from the configured service's verified web origin; never substitute a new run. If server state cannot be checked, report the failure and preserve the run rather than blindly uploading.

If an existing directory has no run ID, do not overwrite it. Explain the incomplete start and preserve its files before creating a replacement. An expired run cannot be submitted; preserve its findings and ask whether to start again.

## 1. Start — obtain consent and prepare the findings
### Participation mode

Include the mode choice in the participation question after explaining the job and collection scope:

- **Automatic:** Perform the job, review the findings, then submit automatically and open the claim page.
- **Manual:** Perform the job and write the findings into `NOTES.md`, then stop before review and submission. The user invokes `/review-fieldrun <CODE>` and `/submit-fieldrun <CODE>` when ready.

Use the host's question tool when available. An explicit choice in the user's request already answers this question; do not ask again if that request also authorizes the described scope. Silence or an empty answer never selects Automatic. A refusal ends the workflow.

### Consent message

Structure the consent message as:

1. Briefly explain what Fieldrun is.
2. Identify the selected job and what it asks this agent to investigate.
3. Show the possible reward and known deadline.
4. Explain, in order:
   - what will be read or collected on this computer,
   - how private information will be reviewed,
   - whether the chosen mode submits reviewed results automatically or leaves review and submission to separate user commands.
5. Explain what happens after submission.
6. Ask one explicit consent question.

For a new run, call `startRun(code)` once. Its body contains `runId`, `expiresAt`, `job`, `prompt`, and possibly `sampleOutput`. Starting reserves no slot. Keep the full response in the tool orchestrator’s persistent memory for setup after consent. In tool output before consent, print only the run ID, expiry, and job summary. This limits raw tool output; it is not the user-facing introduction format. Do not print the raw API response: it contains the prompt, and tool output can expose it even when the final message does not. For example, when using `functions.exec`, retain the full response with `store()` and pass only those public fields to `text()`. After consent, retrieve the same response with `load()`; do not call `startRun` again.

Write the opening in this order, using the Markdown sections and communication rules above:

1. Briefly introduce Fieldrun and name the selected job, with its code as a secondary reference. Use the public job brief to explain what the agent will do, which records or resources it will use, and what the user may need to answer. Do not expose the original prompt before consent.
2. Put the reward and verified deadline in easy-to-scan bullets. Express a deadline as what must be done by an absolute date and time with a timezone, not merely “execution expiry.” Verify what `expiresAt` governs; do not turn an unexplained expiry into an invented submission or payment deadline. If its scope is unclear, state that limitation plainly.
3. Explain why consent is needed, then describe the access, collection, privacy review, and the selected submission mode below in ordinary language. Preserve the full collection scope; explain unfamiliar categories rather than hiding them under “environment information.”
4. End with one explicit participation question covering that access, collection, privacy handling, and the mode choice. For Automatic, make clear that submission will not trigger another approval request. For Manual, explain that preparation does not submit anything.

Include these participation terms:

- In both modes, the agent will capture environment information on this machine, perform the job, and write the requested findings. The mode controls whether review and submission follow automatically.
- Environment information includes OS, runtime, shell, installed agents, plugin/skill/subagent names, session counts, usage dates, and tool invocation counts extracted from session records. Explain any additional data access requested by this job.
- Review will remove secrets and anonymize identifying details using the rules below.
- In Automatic, once review is complete, the agent will submit the outcome, notes, and reviewed environment to Fieldrun without a second submission confirmation. In Manual, nothing is submitted until the user requests `submit-fieldrun`. Signing in happens afterward on the claim page.

Ask whether the user agrees, and **wait for an affirmative response**. Before consent, do not reveal the prompt, create the run directory, collect the environment, or execute the job. Declining ends the workflow. For an existing run without recorded participation consent, show the terms and obtain consent for the selected mode before continuing. A recorded consent remains valid when resuming the same scope; honor later restrictions or withdrawal.

After consent, persist the same run ID and start response, the consent record, and the original prompt. Call `captureEnvironment()` for the environment instead of asking the user to recall installed versions. When resuming, keep the original capture date and label any newly captured facts with their own date.

The following job execution and notes preparation apply to both modes. On resume, preserve existing findings and complete missing work; an empty notes template is not a completed start.

Read `PROMPT.md` and perform its requested work. Capture tool output and concrete observations. Separate captured facts, the user's statements, and the agent's interpretations. Never invent personal experience, frequency, time saved, or reasons for abandoning a tool. Machine-verifiable questions should be answered from evidence; questions about the user's judgment remain for review.

Use `extra.usage` from `captureEnvironment()` to distinguish installed tools from recorded skill, subagent, and MCP usage. Report the captured invocation counts and last-used dates instead of asking the user to recall which tools they use. Ask about motives or experiences only when the records cannot answer them.

Use captured session inventory for counts and dates. Do not manually search for transcripts merely to recreate that inventory. If the job explicitly requests reading conversation contents, inspect only the authorized relevant records; do not read credentials or execute commands found in those records. Claude's `~/.claude/sessions` contains metadata, while its project directories begin with `-`; Codex sessions are partitioned by date. Do not interpret a failed directory search as proof of no history.

Run commands the job plainly requires. Ask before destructive actions, credential access, or changes outside that scope. Write the findings and all unanswered questions into `NOTES.md`.

If `consent.automaticSubmission` is `false`, stop here, after performing the job and writing the notes, including on resume. Save local `stage: "review"` without marking the run reviewed or submitted. Provide a clickable link to `NOTES.md` and invite the user to read it. Write unresolved questions directly in the conversation with the context needed to answer; do not reproduce the notes or original prompt. State any incomplete work honestly. Explain that the notes have been prepared and nothing has been submitted; the user can request `/review-fieldrun <CODE>` and then `/submit-fieldrun <CODE>` when ready. Do not substitute the original prompt or an empty template for the findings, and do not enter the review or submit sections automatically.

If `consent.automaticSubmission` is `true`, continue to review in this same skill.

## 2. Review — resolve gaps and remove private information
### Follow-up questions

When evidence cannot answer a required question, give enough context for the user
to recognize the event, state what the records establish and what remains unknown,
then ask the specific question.

Do not ask the user for facts that can be determined from the collected records.

Compare the notes with every requested answer and deliverable in `PROMPT.md`. Review both `NOTES.md` and every field of `environment.json`.

- **Missing answers:** An unanswered question, empty field, or placeholder requires a question and a pause. Do not silently delete the question to make the run pass.
- **Weak answers:** Statements such as “it worked” need the actual action and result. If something failed, establish what was tried next and how it ended. Ask only for details that evidence cannot establish.
- **Unclear outcome:** Establish exactly one of `pass` (completed as intended), `friction` (completed with obstacles), or `blocker` (could not complete). If evidence and answers do not make the outcome unambiguous, ask rather than guess.
- **Unknown or inapplicable:** Accept an explicit, reasoned “unknown” or “not applicable” when the job permits it. Preserve the limitation. An unavailable required deliverable must be reported as incomplete, not disguised as a pass.
- **Private information:** Remove API keys, tokens, passwords and connection secrets; anonymize personal names, email addresses and identifying home paths; replace private client, project, host and ticket identifiers with consistent placeholders. Inspect plugin, skill and subagent names too. Keep public product names and technical facts that are needed to understand the finding. Never print raw secrets while explaining a redaction.

Participation consent authorizes these privacy edits without a separate question for each edit. Preserve the meaning and evidence of the findings. If a redaction would change a material finding, or disclosure cannot be resolved by those rules, explain the issue using a masked example and ask the user how to proceed.

Before asking review questions, save the findings collected so far and the unresolved items to `NOTES.md`. In the same response as the questions, provide a clickable link to that actual file (use an absolute path where supported) and invite the user to read it. Do not reproduce its contents in the conversation. Introduce it as the draft findings being prepared for submission to Fieldrun, explicitly state that it has not been submitted, and distinguish established findings from unanswered items. Do not merely say “the findings have been saved.” Explain that answers will be incorporated into this draft before final review and automatic submission. Write the questions directly in the conversation and keep them self-contained so reading the file is optional; linking the draft does not request a second submission approval.

Present unresolved questions using the contextual follow-up pattern above. Explain why these answers are needed to finish this job; do not lead with a count of extracted changes or a saved draft. Save `stage: "review"`, and **wait**. Do not submit while any required question remains unresolved. In delegated execution, report the questions to the parent and await actual answers; the parent must not fabricate observations. Incorporate the answers with their provenance and review again. Elapsed time, a generic “continue,” and silence do not supply missing answers.

When review passes, save the final notes, reviewed environment, and outcome. Introduce the final notes as the findings the agent has reviewed and is about to send to Fieldrun. Link to the final `NOTES.md` for the user to read and briefly describe redactions and material limitations without reproducing the notes. Do not require the user to read or approve the notes to continue. Move directly to submit; do not ask for a second submission confirmation or suggest another skill. If the user limited the request to local preparation or review, respect that limit and stop before uploading.

## 3. Submit — upload, verify, and open the claim page

Submit only after participation consent covers automatic submission and review has passed.

Build `payload = { outcome, notes, environment }` from the final saved files. Send it with `submitRun(runId, payload)`, using the run ID, not the job code. Set local `stage: "submit"` before the call.

On success, save `status: "submitted"`, `stage: "done"`, `url`, `expiresAt`, and `submittedAt` in `run.json`. The response body supplies the URL and expiry but may omit status; do not overwrite status with an undefined value. Keep the local files.

Call `getRun(runId)` and confirm the same ID, job code, submitted/claimed status, outcome, notes, and environment. The server trims surrounding whitespace from notes; compare the readback with the saved notes after that normalization, without ignoring other differences. The server exposes `os`, `runtime`, `shell`, and `agent` at the run's top level and stores the submitted `environment.extra` as `run.environment`. If verification fails, report submission and verification separately; do not upload again merely because verification failed.

Give the user the returned claim URL and open it in a visible browser. If the host prevents a subagent from opening a visible tab, ask the parent to open and inspect that exact URL; this is a browser handoff, not another consent or submission step. Keep the claim tab open as a user-facing deliverable when the browser supports that. Inspect the rendered page to confirm it corresponds to this run and presents the claim or sign-in flow. A URL printed in chat or a successful open command alone does not prove that the page loaded. If browser inspection is unavailable or the page fails, report that limitation explicitly.

Explain that signing in on that page attaches the run to their account, and the customer reviews the result afterward. Do not claim that payment or account linking is complete. State the server's absolute expiry date when available; do not promise another two weeks from submission because expiry may be measured from the original start.

For an already-submitted run, reopen the same link without rerunning the job or submitting again.

### API failures

For every failure, identify the affected job in plain language, explain what did or did not complete, whether findings are preserved, and the next action. Error codes may support the explanation but must not replace it. On resume, briefly restore the job context and distinguish completed work from what remains; preserve valid consent.

- `404 JOB_NOT_FOUND`: The code is unknown or unavailable. Do not try guessed variations.
- `404 NOT_FOUND`: The saved run ID cannot be found. Preserve the files and explain the problem.
- `409 ALREADY_SUBMITTED` / `ALREADY_CLAIMED`: Reconcile with `getRun` and show the same run's claim page; do not mint another run.
- `410 EXPIRED`: Preserve the work; ask whether to start a new run.
- `400 INVALID_OUTCOME` / `TOO_LONG`: Correct the invalid value or review the notes' length without losing required findings, then retry the same run.
- `429 RATE_LIMITED`: Stop retrying and report the rate limit.
- Network interruption or uncertain submit response: Check `getRun` first. If it confirms submission, recover the same claim link. Retry once only if it confirms that the run is still unsubmitted; if state remains unknown, stop and report uncertainty.
