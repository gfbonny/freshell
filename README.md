<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js Version">
  <img src="https://img.shields.io/badge/platform-windows%20%7C%20macos%20%7C%20linux-blue" alt="Platform Support">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

<h1 align="center">🐚🔥freshell</h1>

<p align="center">
  Claudes Code, terminals, and other CLI friends in your browser. Speak with the dead, jump to your phone, and lots more
</p>

<p align="center">
  <strong>Run multiple terminals in tabs | Detach & reattach sessions | Browse coding CLI history | What if tmux and Claude fell in love?</strong>
</p>

---

![freshell screenshot](docs/freshell-screenshot.jpg)

## Features

- **Multi-tab terminal sessions** — Run shell, Claude Code, Codex, and other coding CLIs in parallel tabs
- **Split panes** — Divide any tab into independent terminal, browser, or editor panes (horizontal/vertical)
- **Browser & editor panes** — Embedded browser (iframe) and Monaco code editor with 20+ languages, right inside your tabs
- **Detach/reattach** — Background terminals persist across browser sessions; reconnect from any device
- **Search & browse** — Three-tier search across coding CLI sessions: titles, user messages, and full transcript text
- **Speak with the dead** — Invoke the spirits of ancient Claudes and ask them what they were thinking
- **Keep it tidy** — AI-powered terminal summaries (via Gemini), custom session titles, archiving, and project color-coding
- **Overview dashboard** — See all running and exited terminals at a glance with status, idle time, and AI summaries
- **Dark/light themes** — 8 terminal themes (Dracula, One Dark, Solarized, GitHub, and more) plus system/light/dark app themes
- **Drag-and-drop tabs** — Reorder tabs by dragging, with keyboard and touch support
- **Context menus** — Right-click menus for tabs, terminals, sessions, projects, and messages with 40+ actions
- **Activity notifications** — Audio alert when a terminal finishes while the window is in the background
- **Mobile responsive** — Auto-collapsing sidebar and overlay navigation for phones and tablets
- **Auto-update** — Checks for new releases on startup and offers one-key upgrade

## Quick Start

```bash
# Clone the repository at the latest stable release
git clone --branch v0.3.1 https://github.com/danshapiro/freshell.git
cd freshell

# Install dependencies
npm install

# Build and run
npm run serve
```

On first run, freshell auto-generates a `.env` file with a secure random `AUTH_TOKEN`. The token is printed to the console at startup — open the URL shown to connect.

## Prerequisites

| Platform | Requirements |
|----------|-------------|
| **All** | Node.js 18+ (20+ recommended), npm |
| **Windows** | Build tools for native modules (see below) |
| **macOS** | Xcode Command Line Tools |
| **Linux** | build-essential, python3 |

> **Note:** On native Windows, terminals default to WSL. Set `WINDOWS_SHELL=cmd` or `WINDOWS_SHELL=powershell` to use a native Windows shell instead. When running inside WSL directly, the system shell (`$SHELL`) is used.

### Platform-Specific Setup

<details>
<summary><strong>Windows</strong></summary>

1. Install [Node.js](https://nodejs.org/) (LTS version)
2. Install build tools for native modules:
   ```powershell
   npm install -g windows-build-tools
   ```
3. **(Recommended)** Install [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) — freshell defaults to WSL for terminals on Windows:
   ```powershell
   wsl --install -d Ubuntu
   ```
   To use native Windows shells instead, set `WINDOWS_SHELL=cmd` or `WINDOWS_SHELL=powershell` in your `.env` file.

</details>

<details>
<summary><strong>macOS</strong></summary>

1. Install Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```
2. Install Node.js via Homebrew:
   ```bash
   brew install node
   ```

</details>

<details>
<summary><strong>Linux (Debian/Ubuntu)</strong></summary>

```bash
# Install build dependencies
sudo apt update
sudo apt install -y build-essential python3

# Install Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

</details>

## Installation

```bash
# Clone the latest stable release
git clone --branch v0.3.1 https://github.com/danshapiro/freshell.git
cd freshell

# Install dependencies
npm install
```

On first run, freshell auto-generates a `.env` file with a secure 64-character `AUTH_TOKEN` and detects your LAN IPs for `ALLOWED_ORIGINS`. You can also create it manually from the template:

```bash
cp .env.example .env
```

Common `.env` settings:

```bash
# Auto-generated on first run (min 16 characters)
AUTH_TOKEN=your-secure-random-token-here

# Optional: server port (default 3001)
PORT=3001

# Windows only: shell type (wsl, cmd, or powershell). Default: wsl
# WINDOWS_SHELL=wsl

# Windows/WSL: path to Claude home (use WSL path if using WSL)
# CLAUDE_HOME=\\wsl$\Ubuntu\home\your-user\.claude
# WSL_DISTRO=Ubuntu

# Optional: Gemini API key for AI summaries
# GOOGLE_GENERATIVE_AI_API_KEY=your-api-key
```

## Usage

### Development

Run the client and server with hot reload:

```bash
npm run dev
```

Or run them separately:

```bash
# Terminal 1 - Server
npm run dev:server

# Terminal 2 - Client
npm run dev:client
```

### Production

```bash
# Build and run (recommended)
npm run serve
```

Or build and run separately:

```bash
npm run build
npm start
```

Access the app at http://localhost:3001/?token=YOUR_AUTH_TOKEN

## Auto-Update

Freshell checks for new GitHub releases before starting `npm run serve` or `npm run dev`. When a new version is available, you'll see:

```
╭─────────────────────────────────────────────╮
│                                             │
│  There's a new Freshell waiting for you!    │
│                                             │
│    0.1.0 → 0.2.0                            │
│                                             │
╰─────────────────────────────────────────────╯

Upgrade now? [Y/n]
```

Press Enter (default Yes) to update, or 'n' to skip. If accepted, freshell runs `git pull`, `npm install`, and rebuilds automatically.

### Restart Behavior

After a successful update, freshell exits with code 0 and prints instructions to restart. How to restart depends on your setup:

- **Manual**: Re-run `npm run serve` after the process exits
- **pm2**: Automatic restart — the updated version runs immediately
- **systemd**: Automatic restart if configured with `Restart=always`

### Disabling Auto-Update

To skip the update check for `npm run serve`:

```bash
# Via environment variable
SKIP_UPDATE_CHECK=true npm run serve
```

> **Note:** The update check is automatically skipped during `npm run dev`.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+[` | Previous tab |
| `Ctrl+Shift+]` | Next tab |
| `Ctrl+Shift+ArrowLeft` | Move tab left |
| `Ctrl+Shift+ArrowRight` | Move tab right |
| `Ctrl+Shift+C` | Copy selection (in terminal) |
| `Ctrl+V` / `Ctrl+Shift+V` | Paste (in terminal) |
| `Right-click` / `Shift+F10` | Context menu |

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_TOKEN` | Auto | Authentication token (auto-generated on first run, min 16 chars) |
| `PORT` | No | Server port (default: 3001) |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed CORS origins (auto-detected from LAN) |
| `CLAUDE_HOME` | No | Path to Claude config directory (default: `~/.claude`) |
| `CODEX_HOME` | No | Path to Codex config directory (default: `~/.codex`) |
| `WINDOWS_SHELL` | No | Windows shell: `wsl` (default), `cmd`, or `powershell` |
| `WSL_DISTRO` | No | WSL distribution name (Windows only) |
| `CLAUDE_CMD` | No | Claude CLI command override |
| `CODEX_CMD` | No | Codex CLI command override |
| `OPENCODE_CMD` | No | OpenCode CLI command override |
| `GEMINI_CMD` | No | Gemini CLI command override |
| `KIMI_CMD` | No | Kimi CLI command override |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Gemini API key for AI-powered terminal summaries |

### Windows + WSL

Freshell defaults to WSL for terminals on Windows. If your Claude Code sessions live inside WSL at `~/.claude`, you may need to configure `CLAUDE_HOME` so the server can find them from Windows:

```bash
CLAUDE_HOME=\\wsl$\Ubuntu\home\your-username\.claude
WSL_DISTRO=Ubuntu
```

On WSL2, freshell automatically sets up port forwarding and firewall rules so you can access it from other devices on your LAN.

### Coding CLI Providers

Freshell indexes local session history and can launch terminals for these coding CLIs:

| Provider | Session history | Launch terminals | Home directory |
|----------|:-:|:-:|----------------|
| **Claude Code** | Yes | Yes | `~/.claude` |
| **Codex** | Yes | Yes | `~/.codex` |
| **OpenCode** | — | Yes | — |
| **Gemini** | — | Yes | — |
| **Kimi** | — | Yes | — |

You can enable/disable providers and set defaults in the Settings UI or via `~/.freshell/config.json`:

```json
{
  "settings": {
    "codingCli": {
      "enabledProviders": ["claude", "codex"],
      "providers": {
        "claude": { "permissionMode": "default" },
        "codex": { "sandbox": "read-only" }
      }
    }
  }
}
```

## Security

- **AUTH_TOKEN is mandatory** — Auto-generated on first run (64 hex chars); server refuses to start without one (min 16 chars, rejects known weak values)
- **API authentication** — All `/api/*` routes require `x-auth-token` header (except `/api/health`)
- **WebSocket handshake** — Connections must send a valid token in the `hello` message
- **Origin restriction** — WebSocket and CORS limited to allowed origins (auto-detected from LAN, configurable via `ALLOWED_ORIGINS`)
- **Rate limiting** — API routes are rate-limited to 300 requests per minute

## Testing

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:server        # Server tests only
npm run test:client        # Client tests only
npm run test:coverage      # With coverage report
```

## Tech Stack

- **Frontend**: React 18, Redux Toolkit, Tailwind CSS, xterm.js, Monaco Editor, Zod, lucide-react
- **Backend**: Express, WebSocket (ws), node-pty, Pino, Chokidar, Zod
- **Build**: Vite, TypeScript
- **Testing**: Vitest, Testing Library, supertest, superwstest
- **AI**: Vercel AI SDK with Google Gemini

## Project Structure

```
freshell/
├── src/                  # Frontend source
│   ├── components/       # React components (tabs, panes, sidebar, sessions, context menus)
│   ├── store/            # Redux store & slices
│   ├── lib/              # Utilities, API client, WebSocket client
│   └── hooks/            # Custom React hooks (theme, notifications, activity)
├── server/               # Backend source
│   ├── index.ts          # Server entry point & REST routes
│   ├── auth.ts           # Token validation & HTTP auth middleware
│   ├── bootstrap.ts      # First-run .env generation & LAN detection
│   ├── ws-handler.ts     # WebSocket protocol handler
│   ├── terminal-registry.ts # PTY lifecycle & shell resolution
│   ├── ai-prompts.ts     # Gemini prompt templates
│   ├── config-store.ts   # ~/.freshell/config.json persistence
│   ├── coding-cli/       # Multi-provider session support
│   │   ├── session-indexer.ts  # Session discovery & file watching
│   │   ├── session-manager.ts  # Live session event streaming
│   │   └── providers/    # Claude, Codex adapters
│   ├── session-scanner/  # Three-tier session search engine
│   └── updater/          # Auto-update from GitHub releases
├── test/                 # Test suites (unit, integration, e2e)
└── dist/                 # Build output
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with terminals and caffeine
</p>
