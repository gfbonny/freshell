---
description: Review code, commit, and create PR for freshell
disable-model-invocation: true
---

# Commit Freshell Changes

Review, commit, push, and create a contributor PR for freshell.

**Reference:** `~/.claude/rules/commit-recipe.md`, `~/.claude/rules/review-triage.md`

**Usage:** `/commit`

**Current status:**

- **Current branch:** !`git branch --show-current`
- **Git status:** !`git status --short`

## Project Config

| Setting | Value |
|---------|-------|
| Role | Contributor (not maintainer) |
| Base branch | `main` |
| Linear prefix | `FRE` |
| Tests | `npm test` |
| Review levels | NONE, LIGHT only |
| Deploy | Contributor PR — maintainer reviews and merges |

## Workflow

### Step 1: Pre-flight

1. Verify on a feature branch (not main)
2. Verify there are changes to commit
3. Check for session file (`.claude-session/*.json`)

### Step 2: Run Tests

```bash
npm test
```

If tests fail, fix before committing.

### Step 3: Review Triage

Gather signals:
```bash
git diff --cached --name-only 2>/dev/null || git diff --name-only
```

Apply triage (NONE or LIGHT only — freshell has no custom review agents):

- **< 5 files, no sensitive paths** → NONE (skip review)
- **5+ files or sensitive paths** → LIGHT (superpowers code-reviewer)

### Step 4: Stage, Commit, Push

1. Stage all changes: `git add -A`
2. Generate conventional commit message referencing ticket if on ticket branch
3. Commit with HEREDOC format and Co-Authored-By line
4. Push with `-u` to set upstream

### Step 5: Create PR

Create a contributor PR targeting `main`:

```bash
gh pr create --title "title" --body "$(cat <<'EOF'
## Summary
[bullet points]

## Test plan
- [ ] `npm test` passes
- [ ] Manual verification

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Step 6: Update Linear (if on ticket branch)

If branch matches `feature/FRE-XXX-*`:
1. Extract ticket ID from branch name
2. Update status to "In Progress" (if not already further along)
3. Post progress comment with PR link

### Step 7: Report

```
Committed and PR created!

Branch: [branch]
PR: [url]
Tests: Passing
Linear: [updated/skipped]
```

## Guardrails

- **Never commit secrets**
- **Never push to main directly** — always create PR
- **Always run tests** before committing
- **Brad is a contributor** — PRs go to maintainer for review
