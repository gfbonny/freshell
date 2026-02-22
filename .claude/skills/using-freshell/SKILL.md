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

## System Differences from tmux

- Transport/auth model: tmux commands talk to a local tmux server socket; Freshell CLI talks to an HTTP API (`FRESHELL_URL`) with token auth (`FRESHELL_TOKEN`).
- UI model: tmux panes are terminal-only; Freshell panes can be terminal, browser, or editor.
- Targeting model: tmux target syntax is session/window/pane style (for example `1:2.0`); Freshell primarily targets tab/pane IDs and resolves friendly forms via the layout API.
- Remote model: tmux is usually local TTY-first; Freshell is browser-first and designed for LAN/remote multi-device access.
- Semantics model: Freshell borrows tmux verbs, but many commands are higher-level workflows over HTTP state (layout store + terminal registry), not direct terminal multiplexer primitives.
- AI/session features: Freshell includes coding-session indexing/search and terminal summarization; tmux has no built-in equivalent.

## Command Deltas vs tmux

Each row shows the closest tmux equivalent and the key behavioral delta.

| Freshell command | Closest tmux command | Key differences from tmux |
|---|---|---|
| `new-tab` | `new-window` | Can create terminal, browser, or editor panes; supports `--claude`/`--codex` modes and `--resume`. |
| `list-tabs` | `list-windows` | Returns tab records from Freshell layout API, not tmux window objects. |
| `select-tab` | `select-window` | Selects by id/title through API resolution, not tmux target parsing. |
| `kill-tab` | `kill-window` | Closes Freshell tab state via API; behavior is coupled to pane/layout store. |
| `rename-tab` | `rename-window` | Renames tab metadata in layout store, not tmux window name metadata. |
| `has-tab` | none | Existence probe helper; no direct tmux built-in analog. |
| `next-tab` | `next-window` | Same intent, but operates on Freshell tab order. |
| `prev-tab` | `previous-window` | Same intent, but operates on Freshell tab order. |
| `split-pane` | `split-window` | Can spawn terminal/browser/editor panes; target resolution is API-based and defaults differ. |
| `list-panes` | `list-panes` | Lists pane records from layout store (including non-terminal panes). |
| `select-pane` | `select-pane` | Focuses pane via API, not direct tmux client focus command. |
| `kill-pane` | `kill-pane` | Closes pane through layout API; pane tree updates are explicit app-state mutations. |
| `resize-pane` | `resize-pane` | Uses `x/y` percentages and can resolve parent split from pane target. |
| `swap-pane` | `swap-pane` | Swaps pane nodes in layout tree rather than tmux pane slots. |
| `respawn-pane` | `respawn-pane` | Rebinds pane to a newly created terminal through registry + layout store. |
| `attach` | `join-pane` (closest) | Attaches an existing terminal id into a pane; this is terminal-to-pane rebinding, not pane migration between tmux windows. |
| `send-keys` | `send-keys` | Same intent; literal mode (`-l`) and key translation are implemented in CLI before API send. |
| `capture-pane` | `capture-pane` | Similar intent, but output comes from Freshell terminal buffer snapshots exposed by API. |
| `wait-for` | `wait-for` (name only) | Waits on terminal text/prompt/stability conditions; tmux `wait-for` is lock/signal oriented. |
| `display` | `display-message` | Token set is Freshell tab/pane fields, not tmux format variables. |
| `run` | none (composed from several tmux ops) | One-shot helper to create tab, run command, optionally capture and detach. |
| `summarize` | none | Requests AI summary for terminal output. |
| `list-terminals` | none | Lists Freshell terminal registry objects, independent of panes/tabs. |
| `open-browser` | none | Creates/navigates browser pane; tmux has no browser pane type. |
| `navigate` | none | Converts/updates a pane to browser content with URL navigation. |
| `list-sessions` | none | Lists indexed coding-CLI sessions (Claude/Codex session history). |
| `search-sessions` | none | Full-text-style search over indexed coding sessions. |
| `health` | none | HTTP health/readiness endpoint probe. |
| `lan-info` | none | Returns Freshell network exposure/LAN information. |

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
