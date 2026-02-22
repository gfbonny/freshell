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

## Supported Commands

This list reflects the commands currently implemented in `server/cli/index.ts`.

Tab commands:
- `new-tab`: Create a tab with a terminal (default), browser pane, or editor pane.
- `list-tabs`: List tabs and each tab's active pane.
- `select-tab`: Activate a tab by id/title/target.
- `kill-tab`: Close a tab.
- `rename-tab`: Rename a tab.
- `has-tab`: Check whether a tab target exists.
- `next-tab`: Select the next tab.
- `prev-tab`: Select the previous tab.

Pane/layout commands:
- `split-pane`: Split a pane horizontally/vertically and create a new terminal/browser/editor pane.
- `list-panes`: List panes globally or for one tab.
- `select-pane`: Focus a pane.
- `kill-pane`: Close a pane.
- `resize-pane`: Resize a pane (or its parent split) with `x`/`y` percentages.
- `swap-pane`: Swap two panes in the same tab layout.
- `respawn-pane`: Replace a pane with a freshly spawned terminal.
- `attach`: Attach an existing terminal id into a pane.

Terminal interaction commands:
- `send-keys`: Send key sequences or literal text to a pane's terminal.
- `capture-pane`: Read terminal buffer text with optional slicing/join/ANSI retention.
- `wait-for`: Poll until pattern match, prompt, exit, or stable output.
- `display`: Render a format string with tab/pane context tokens.
- `run`: Create a tab, run a command, optionally capture output, optionally detach.
- `summarize`: Request AI summary for the pane's terminal.
- `list-terminals`: List server-side terminals and status.

Browser/navigation commands:
- `open-browser`: Create a new browser tab and navigate to URL.
- `navigate`: Navigate an existing pane to URL (converts pane to browser content).

Session commands:
- `list-sessions`: Return indexed coding-CLI sessions.
- `search-sessions`: Search indexed sessions by query string.

Service/diagnostic commands:
- `health`: Check server health/readiness.
- `lan-info`: Show LAN binding and network access info.

tmux-style aliases supported by this CLI:
- `new-window`, `new-session` -> `new-tab`
- `list-windows` -> `list-tabs`
- `select-window` -> `select-tab`
- `kill-window` -> `kill-tab`
- `rename-window` -> `rename-tab`
- `next-window` -> `next-tab`
- `previous-window`, `prev-window` -> `prev-tab`
- `split-window` -> `split-pane`
- `display-message` -> `display`

Important command flags:
- `new-tab`: `--claude`, `--codex`, `--mode`, `--shell`, `--cwd`, `--browser`, `--editor`, `--resume`, `--prompt`
- `split-pane`: `-t/--target`, `-v/--vertical`, `--mode`, `--shell`, `--cwd`, `--browser`, `--editor`
- `send-keys`: `-t/--target`, `-l/--literal`
- `capture-pane`: `-t/--target`, `-S`, `-J`, `-e`
- `wait-for`: `-t/--target`, `-p/--pattern`, `--stable`, `--exit`, `--prompt`, `-T/--timeout`
- `run`: `-c/--capture`, `-d/--detach`, `-T/--timeout`, `-n/--name`, `--cwd`

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
