---
name: using-freshell
description: Use when operating Freshell itself from this repo, especially to open files in editor panes, create/split tabs and panes, launch parallel Claude or Codex panes, wait for runs to settle, and compare outcomes.
---

# Using Freshell

## Start State

Use the local CLI entrypoint from the repo so commands work without a build step:

```bash
FSH="npx tsx server/cli/index.ts"
```

Point commands at the running Freshell server:

```bash
export FRESHELL_URL="http://localhost:3001"
export FRESHELL_TOKEN="<auth-token>"
$FSH health
```

Use absolute paths for `--cwd` and `--editor`.

## Playbook: Open a File in an Editor Pane

Open in a new tab:

```bash
FILE="/absolute/path/to/file.ts"
$FSH new-tab -n "Edit $(basename "$FILE")" --editor "$FILE"
```

Open in the current tab while keeping another pane visible:

```bash
FILE="/absolute/path/to/file.ts"
$FSH split-pane --editor "$FILE"
```

Prefer `new-tab` for isolated tasks. Prefer `split-pane` when the user wants terminal + editor side by side.

## Playbook: Launch 4 Claudes in One Tab and Pick the Best Outcome

```bash
FSH="npx tsx server/cli/index.ts"
CWD="/absolute/path/to/repo"
PROMPT="Implement <task>. Run tests. Summarize tradeoffs."
```

Create the seed pane:

```bash
SEED_JSON="$($FSH new-tab -n 'Claude x4 Eval' --claude --cwd "$CWD")"
P0="$(printf '%s' "$SEED_JSON" | jq -r '.data.paneId')"
```

Split to 4 Claude panes (2x2):

```bash
J1="$($FSH split-pane -t "$P0" --mode claude --cwd "$CWD")"
P1="$(printf '%s' "$J1" | jq -r '.data.paneId')"
J2="$($FSH split-pane -t "$P0" -v --mode claude --cwd "$CWD")"
P2="$(printf '%s' "$J2" | jq -r '.data.paneId')"
J3="$($FSH split-pane -t "$P1" -v --mode claude --cwd "$CWD")"
P3="$(printf '%s' "$J3" | jq -r '.data.paneId')"
PANES=("$P0" "$P1" "$P2" "$P3")
```

Send the same prompt to all panes:

```bash
for p in "${PANES[@]}"; do
  $FSH send-keys -t "$p" -l "$PROMPT"
  $FSH send-keys -t "$p" ENTER
done
```

Wait for output to settle and capture each result:

```bash
for p in "${PANES[@]}"; do
  $FSH wait-for -t "$p" --stable 8 -T 1800
  $FSH capture-pane -t "$p" -S -120 > "/tmp/${p}.txt"
done
```

Choose the winner using this rubric:
- Correctness against the prompt
- Evidence of passing checks (tests/build/lint)
- Smallest safe diff
- Clearest reasoning and risk disclosure

## Gotchas

- Always use `send-keys -l` for natural-language prompts. Without `-l`, spaces are not preserved.
- Prefer `wait-for --stable` for cross-provider reliability; prompt detection can vary by CLI.
- If a target is not resolved, run `list-tabs` and `list-panes --json`, then retry with explicit pane IDs.
