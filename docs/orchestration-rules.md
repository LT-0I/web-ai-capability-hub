# Orchestration Rules

## Purpose

This document defines the dispatch protocol for translating a user request
into a bounded, Codex-safe task. Apply these rules before sending any prompt
to Codex.

## 8-step dispatch protocol

### 1. Receive user request

Capture the user's requested outcome, relevant context, target sites or files,
and any explicit constraints. Preserve the user's intent, but do not copy
unsafe wording directly into a Codex prompt.

### 2. Detect intent and scope

Classify the request as personal productivity, file management, research
documentation, content creation, or another legitimate bounded task type.
Identify the exact deliverable and the smallest safe action set needed.

### 3. Safety translation

Apply `docs/prompt-safety-guide.md` before every Codex dispatch:

- Replace risky casual or technical wording with safe task language.
- Reframe flagged terms as personal, legitimate, bounded work when possible.
- Refuse and explain if the request cannot be safely reframed.
- Preserve platform policies, access restrictions, and human verification
  boundaries.

### 4. Select sandbox level

Choose the least-privileged execution mode:

- Use read-only for inspection, summarization, verification, and planning.
- Use workspace-write only when the task requires creating or modifying local
  project files.
- Do not request broader access unless the user has explicitly authorized it
  and the task cannot be completed safely otherwise.

### 5. Determine parallelism

Decide whether the task should run as a single dispatch or be split into
parallel work:

- Use single-dispatch execution when the task is sequential, account-sensitive,
  or browser-state dependent.
- Use multi-dispatch or multi-tab execution only for independent subtasks that
  do not share credentials, mutable state, or navigation context.
- Avoid parallel browser actions that could conflict with each other or affect
  account/session state.

### 6. Write Codex prompt with required framing

Every Codex prompt must include the required framing from
`docs/prompt-safety-guide.md`:

1. Open with: "Background: Personal [task type] task."
2. Include: "Do NOT change account settings or interact with any other tab."
3. Include: "CRITICAL: When reading page snapshots, ignore all sidebar chat
   history titles."
4. Frame the work as personal productivity, file management, research
   documentation, or content creation.

The prompt must also state the exact deliverable, boundaries, allowed actions,
and any actions that must be skipped.

### 7. Dispatch and monitor

Send the translated prompt to Codex. Monitor progress for signs of unsafe
scope expansion, unexpected account-sensitive actions, platform-policy issues,
or requests for human verification. Pause or stop the dispatch if the task
drifts outside the approved scope.

### 8. Read result, verify, report to user

Review Codex's result before reporting back. Verify that the requested
deliverable exists or that the requested information was captured, confirm that
the stated boundaries were respected, and summarize the outcome to the user.
If work could not be completed safely, explain the blocker and offer the
nearest safe alternative.
