---
name: dapp-sdd:clarify
description: Fetch answers from PR comments and continue the implementation pipeline
argument-hint: --continue
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Skill, Task
---

# /dapp-sdd:clarify

Fetches answers to clarifying questions from PR comments, then runs the full implementation pipeline.

## Usage

```
/dapp-sdd:clarify --continue
```

## Prerequisites

- Must have run `/dapp-sdd:start` first
- `.dapp-sdd/pr-context.json` must exist with `status: "awaiting_answers"`
- User must have answered questions in PR comment

## Process

### Step 1: Load State

Read `.dapp-sdd/pr-context.json` to get:
- PR number
- Owner/repo
- Current status

Verify status is `awaiting_answers`.

### Step 2: Fetch PR Comments

```bash
gh pr view {prNumber} --comments --json comments
```

Parse comments to find the user's answers (look for numbered responses 1-5).

### Step 3: Integrate Answers

Update `.dapp-sdd/spec.md` with a new section:

```markdown
## Clarifications

**Session: {date}**

1. Q: {question 1}
   A: {answer 1}

2. Q: {question 2}
   A: {answer 2}

(etc.)
```

Update relevant sections of the spec based on answers.

### Step 4: Run Plan Skill

Invoke `dapp-sdd:plan` to generate the implementation plan.

Save output to `.dapp-sdd/plan.md`.

### Step 5: Run Tasks Skill

Invoke `dapp-sdd:tasks` to generate the task list.

Save output to `.dapp-sdd/tasks.md`.

### Step 6: Update PR

```bash
gh pr comment {prNumber} --body "## Implementation Starting

Answers received and integrated. Beginning implementation.

**Plan:** {number} phases
**Tasks:** {number} tasks

Will post updates as phases complete."
```

### Step 7: Run Implement Skill

Invoke `dapp-sdd:implement` to execute all tasks.

This will:
- Execute each task
- Commit and push after each task
- Run reviews after each phase
- Address review feedback
- Post completion summary when done
- Mark PR as ready

### Step 8: Completion

The implement skill handles posting the completion summary and marking the PR ready.

Update `pr-context.json`:
```json
{
  "status": "complete"
}
```

## Error Handling

If implementation fails:
1. Post error to PR
2. Update status to `blocked`
3. Provide instructions for manual intervention

```bash
gh pr comment {prNumber} --body "## Implementation Blocked

❌ Error during task {taskId}: {error}

**To resume:** Fix the issue manually, then run `/dapp-sdd:clarify --continue` again."
```
