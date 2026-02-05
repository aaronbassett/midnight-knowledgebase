---
name: dapp-sdd:start
description: Clone a repo, create a draft PR, read the README spec, and post clarifying questions
argument-hint: owner/repo@branch
allowed-tools: Bash, Read, Write, Glob, Grep, Skill
---

# /dapp-sdd:start

Entry point for building a Midnight example dApp. Clones the repo, creates a draft PR, reads the spec from README.md, and posts clarifying questions.

## Usage

```
/dapp-sdd:start owner/repo@branch
```

**Example:**
```
/dapp-sdd:start aaronbassett/counter-example@main
```

## Process

### Step 1: Parse Arguments

Extract from `$ARGUMENTS`:
- `owner` - GitHub username or org
- `repo` - Repository name
- `branch` - Branch to checkout

Format: `owner/repo@branch`

### Step 2: Clone Repository

```bash
git clone git@github.com:{owner}/{repo}.git
cd {repo}
git checkout {branch}
```

### Step 3: Setup Plugin State

1. Create `.dapp-sdd/` directory
2. Add to `.gitignore`:
   ```bash
   echo ".dapp-sdd/" >> .gitignore
   git add .gitignore
   git commit -m "chore: ignore dapp-sdd state directory"
   git push
   ```

3. Create `pr-context.json`:
   ```json
   {
     "owner": "{owner}",
     "repo": "{repo}",
     "branch": "{branch}",
     "prNumber": null,
     "currentPhase": 0,
     "completedTasks": [],
     "status": "starting"
   }
   ```

### Step 4: Create Draft PR

```bash
gh pr create --draft \
  --title "feat: {repo} example dApp" \
  --body "Work in progress - implementing example dApp.

## Status
🔄 Gathering requirements

## Next Steps
- [ ] Clarifying questions posted
- [ ] Waiting for answers
- [ ] Implementation in progress
- [ ] Ready for review"
```

Save PR number to `pr-context.json`.

### Step 5: Read Specification

Read `README.md` as the user's dApp specification.

### Step 6: Run Specify Skill

Invoke `dapp-sdd:specify` with the README content to generate the full specification.

Save output to `.dapp-sdd/spec.md`.

### Step 7: Generate Clarifying Questions

Analyze the specification and generate exactly 5 clarifying questions:

**Question criteria:**
- Must materially impact implementation
- Answerable in 1-2 sentences
- Focus on: scope boundaries, privacy model, user interactions, edge cases, testing priorities

**Example questions:**
1. "Should the counter support negative values, or only non-negative integers?"
2. "Should there be a maximum value the counter can reach?"
3. "Do you want the increment/decrement amounts to be configurable or fixed at 1?"
4. "Should viewing the counter value require authentication or be public?"
5. "What error message should display if an operation fails?"

### Step 8: Post Questions to PR

```bash
gh pr comment {prNumber} --body "## Clarifying Questions

Please answer these questions to help refine the implementation:

1. {Question 1}
2. {Question 2}
3. {Question 3}
4. {Question 4}
5. {Question 5}

---
*Reply to this comment with your answers numbered 1-5, then run `/dapp-sdd:clarify --continue`*"
```

### Step 9: Update State

Update `pr-context.json`:
```json
{
  "status": "awaiting_answers"
}
```

## Output

Confirm completion:
```
✓ Cloned {owner}/{repo}
✓ Checked out branch: {branch}
✓ Created draft PR: #{prNumber}
✓ Generated specification
✓ Posted 5 clarifying questions

Next: Answer the questions on the PR, then run:
/dapp-sdd:clarify --continue
```
