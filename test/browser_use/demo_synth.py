#!/usr/bin/env python3
"""
Freshell video demo: Moog synth built by Claude, played via browser-use.

Usage:
  . .venv/bin/activate
  python test/browser_use/demo_synth.py [--step N] [--cdp-url URL] [--debug]

Steps:
  1 - Create a Claude tab, prompt for Moog synth
  2 - Wait for Claude to finish building the project
  3 - Add Shell + Browser panes, start dev server, load synth, play Mr. Roboto
  4 - Ask Claude to create a git worktree
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
import traceback
import logging
from pathlib import Path

# Add the test/browser_use dir to path so we can import smoke_utils
sys.path.insert(0, str(Path(__file__).resolve().parent))

from smoke_utils import (
    JsonLogger,
    build_target_url,
    default_base_url,
    env_or,
    find_upwards,
    load_dotenv,
    monotonic_timer,
    redact_url,
    redact_text,
    require,
)


async def setup_browser(args, log, token, base_url):
    """Shared browser setup: launch, navigate to Freshell, wait for auth."""
    from browser_use import Browser

    target_url = build_target_url(base_url, token)
    redacted = redact_url(target_url)
    log.info("Setting up browser", event="browser_setup", targetUrl=redacted)

    browser = Browser(
        headless=args.headless,
        cdp_url=args.cdp_url,
        window_size={"width": args.width, "height": args.height},
        viewport={"width": args.width, "height": args.height},
        no_viewport=False,
    )
    await browser.start()

    # Reuse existing Freshell tab or open new one
    pages = []
    try:
        pages = await browser.get_pages()
    except Exception:
        pages = []

    page = None
    if pages:
        for p in reversed(pages):
            try:
                url = await p.get_url()
                title = await p.get_title()
                if (title and "freshell" in title.lower()) or (
                    url and url.startswith(base_url)
                ):
                    page = p
                    break
            except Exception:
                continue
        if page is None:
            page = pages[-1]
    else:
        page = await browser.new_page("about:blank")

    # Navigate to Freshell
    try:
        goto = getattr(page, "goto", None)
        if callable(goto):
            await goto(target_url)
        else:
            navigate = getattr(page, "navigate", None)
            if callable(navigate):
                await navigate(target_url)
            else:
                page = await browser.new_page(target_url)
    except Exception:
        page = await browser.new_page(target_url)

    # Wait for auth bootstrap
    deadline = time.monotonic() + 30.0
    ready = False
    while time.monotonic() < deadline:
        try:
            auth_present = await page.evaluate(
                "() => !!sessionStorage.getItem('auth-token')"
            )
            token_removed = await page.evaluate(
                "() => !new URLSearchParams(window.location.search).has('token')"
            )
            has_add_pane = await page.evaluate(
                '() => !!document.querySelector(\'button[aria-label="Add pane"]\')'
            )
            has_connected = await page.evaluate(
                "() => !!document.querySelector('[title=\"Connected\"]')"
            )
            if auth_present and token_removed and has_add_pane and has_connected:
                ready = True
                break
        except Exception:
            pass
        await asyncio.sleep(0.5)

    if not ready:
        raise RuntimeError("App did not bootstrap auth/render in time")

    log.info("Browser ready", event="browser_ready")
    return browser, page


def register_insert_text(tools):
    """Register the CDP insert_text action for reliable terminal typing."""
    from browser_use.agent.views import ActionResult
    from pydantic import BaseModel

    class InsertTextAction(BaseModel):
        text: str

    @tools.registry.action(
        "Insert text into the currently focused element (CDP Input.insertText).",
        param_model=InsertTextAction,
    )
    async def insert_text(params: InsertTextAction, browser_session):
        try:
            cdp_session = await browser_session.get_or_create_cdp_session(
                target_id=None, focus=True
            )
            await cdp_session.cdp_client.send.Input.insertText(
                params={"text": params.text},
                session_id=cdp_session.session_id,
            )
            memory = f"Inserted text: {params.text}"
            return ActionResult(extracted_content=memory, long_term_memory=memory)
        except Exception as e:
            return ActionResult(
                error=f"Failed to insert text: {type(e).__name__}: {e}"
            )


def register_dispatch_key(tools):
    """Register a CDP-level key dispatch action for pressing keys inside iframes."""
    from browser_use.agent.views import ActionResult
    from pydantic import BaseModel

    class DispatchKeyAction(BaseModel):
        key: str
        hold_ms: int = 100
        pause_after_ms: int = 300

    @tools.registry.action(
        "Press and release a key via CDP Input.dispatchKeyEvent (works inside iframes). "
        "key: single character like 'd' or 's'. hold_ms: how long to hold the key down (default 100ms). "
        "pause_after_ms: how long to wait AFTER releasing the key before returning (default 300ms). "
        "This is a self-contained note action - do NOT combine with a separate wait action.",
        param_model=DispatchKeyAction,
    )
    async def dispatch_key(params: DispatchKeyAction, browser_session):
        try:
            cdp_session = await browser_session.get_or_create_cdp_session(
                target_id=None, focus=True
            )
            key = params.key
            key_code = ord(key.upper())
            code = f"Key{key.upper()}" if key.isalpha() else key

            # keyDown
            await cdp_session.cdp_client.send.Input.dispatchKeyEvent(
                params={
                    "type": "keyDown",
                    "key": key,
                    "code": code,
                    "windowsVirtualKeyCode": key_code,
                    "nativeVirtualKeyCode": key_code,
                    "text": key,
                },
                session_id=cdp_session.session_id,
            )
            await asyncio.sleep(params.hold_ms / 1000.0)
            # keyUp
            await cdp_session.cdp_client.send.Input.dispatchKeyEvent(
                params={
                    "type": "keyUp",
                    "key": key,
                    "code": code,
                    "windowsVirtualKeyCode": key_code,
                    "nativeVirtualKeyCode": key_code,
                },
                session_id=cdp_session.session_id,
            )
            # Built-in pause after the note
            await asyncio.sleep(params.pause_after_ms / 1000.0)
            memory = f"Played key '{key}' (held {params.hold_ms}ms, paused {params.pause_after_ms}ms)"
            return ActionResult(extracted_content=memory, long_term_memory=memory)
        except Exception as e:
            return ActionResult(
                error=f"Failed to dispatch key: {type(e).__name__}: {e}"
            )


async def run_agent_task(browser, task, args, log, max_steps=None):
    """Run an LLM-driven browser-use agent with the given task."""
    from browser_use import Agent, ChatBrowserUse
    from browser_use.tools.service import Tools

    model = env_or(args.model, "BROWSER_USE_MODEL") or "bu-latest"
    llm = ChatBrowserUse(model=model)

    tools = Tools(
        exclude_actions=["write_file", "replace_file", "read_file", "extract"]
    )
    register_insert_text(tools)
    register_dispatch_key(tools)

    agent = Agent(
        task=task.strip(),
        llm=llm,
        browser=browser,
        tools=tools,
        use_vision=True,
        max_actions_per_step=3,
        directly_open_url=False,
    )

    steps = max_steps or args.max_steps
    log.info("Agent run start", event="agent_run_start", maxSteps=steps)
    history = await agent.run(max_steps=steps)
    log.info("Agent run done", event="agent_run_done")
    return history


# =============================================================================
# STEP 1: Create a Claude tab and ask for the synth
# =============================================================================
STEP1_TASK = """
You are controlling Freshell, a browser-based terminal multiplexer. The app is already open and authenticated.

Your task: Create a Claude Code tab and give it instructions to build a synthesizer.

Non-negotiable constraints:
- Stay in ONE browser window and ONE browser tab. Do not open new browser tabs/windows.
- Use insert_text for all terminal input, then send_keys with Enter.

Steps:
1) Look at the current tabs at the top. Click the "+" button (tooltip: "New shell tab") to create a new tab.
2) A pane picker will appear. Click "Claude" to create a Claude Code pane.
3) Wait for the Claude Code CLI to initialize (you should see the Claude prompt appear, with a ">" input area or a text like "Try..." prompt suggestion).
   - This may take 10-20 seconds. Use wait(seconds=10) if needed.
   - If it says "Starting terminal..." wait for it to finish.
4) Once Claude Code is ready, click inside the terminal to focus it, then use insert_text to type the following prompt EXACTLY (as one single insert_text call):

Build me a web-based synthesizer styled after a vintage Moog with extra walnut wood paneling. Use React with Vite and the Web Audio API. Include: a 2-octave piano keyboard (C3-B4) with clickable keys that play notes, analog-style knobs for cutoff frequency, resonance, attack, decay, sustain, release (ADSR), an oscillator type selector (saw, square, sine, triangle), a retro look with walnut wood texture cream/brown color scheme metal knobs, warm vintage font styling, mouse click AND keyboard input (use keys: a,w,s,e,d,f,t,g,y,h,u,j,k,o,l,p for the notes), each key should display its note name. Create this as a complete project in /tmp/moog-synth with all files ready to run via npm run dev. After writing all files run npm install and npm run build to verify it compiles.

5) After typing the prompt with insert_text, press Enter by using send_keys with the Enter key.
6) Wait about 5 seconds to confirm Claude has started processing.

When you see Claude actively working (generating code, showing "thinking", or outputting text), output exactly:
DEMO_STEP: DONE - Claude is generating the synth
"""


# =============================================================================
# STEP 2: Wait for Claude to finish
# =============================================================================
STEP2_TASK = """
You are monitoring Freshell where Claude Code is building a synthesizer project.

Your task: Wait for Claude Code to finish generating the project.

How to know Claude is done:
- The Claude Code CLI will return to its input prompt (showing ">" waiting for new input)
- You will see a summary of what it did or a message like "I've created the project"
- The terminal will stop scrolling with new output
- You might see cost information like "$X.XX spent"

Steps:
1) Watch the active Claude Code terminal pane. It should be generating code.
2) Wait patiently. Use wait(seconds=30) between screenshots. This WILL take several minutes.
3) Take a screenshot after each wait to check progress.
4) If you see Claude asking a YES/NO question or asking for permission, click the terminal and type 'y' then Enter.
5) Keep waiting and checking until Claude returns to its ">" prompt.
6) Once Claude is done (back at prompt), output:

DEMO_STEP: DONE - Claude finished generating code
"""


# =============================================================================
# STEP 3: Set up panes, start dev server, load synth, AND play Mr. Roboto
# =============================================================================
STEP3_TASK = """
You are controlling Freshell. Claude Code has finished building a Moog synthesizer in /tmp/moog-synth.

Your task has TWO PARTS:
PART A: Add a Shell pane, start the dev server, add a Browser pane, and load the synth.
PART B: Play "Domo Arigato, Mr. Roboto" intro on the synth.

Non-negotiable constraints:
- Stay in ONE browser window and ONE browser tab.
- Use insert_text for terminal input, then send_keys with Enter.

=== PART A: Set up the panes ===

1) Click the "Add pane" button (floating button in the bottom-right area, with a "+" icon) to add a new pane.
2) In the pane picker, click "Shell" (or "WSL" or "CMD" - whichever shell option is available).
3) Wait for the shell to be ready (you should see a command prompt).
4) Click inside the shell terminal to focus it, then:
   - insert_text("cd /tmp/moog-synth && npm run dev") then send_keys Enter
   - Wait 10 seconds for Vite to start
   - Look at the output for a URL like "http://localhost:5174" or similar port

5) Click "Add pane" again.
6) In the pane picker, click "Browser".
7) In the browser pane's URL input field:
   - Type the Vite URL you saw (e.g., http://localhost:5174) and press Enter
   - If you couldn't read the port, try http://localhost:5176 first
8) Wait 5 seconds for the synth to load. You should see "MOOG MINI SYNTHESIZER" and piano keys.

=== PART B: Play Mr. Roboto ===

The synth keyboard has these computer keyboard shortcuts:
  a=C3, w=C#3, s=D3, e=D#3, d=E3, f=F3, t=F#3, g=G3, y=G#3, h=A3, u=A#3, j=B3,
  k=C4, o=C#4, l=D4, p=D#4

The melody "Domo Arigato, Mr. Roboto" transposed to octave 3:
  Phrase 1: E3 E3 E3 D3 E3 -> keys: d d d s d
  Phrase 2: E3 E3 E3 D3 E3 F#3 E3 -> keys: d d d s d t d

9) Click INSIDE the browser pane's iframe area (where you see the synth keyboard) to focus it.
10) Wait 1 second.
11) Play Phrase 1 using dispatch_key (each call includes its own pause - do NOT add separate wait actions):
   - dispatch_key(key="d", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="d", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="d", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="s", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="d", hold_ms=400, pause_after_ms=800)

12) Play Phrase 2 using dispatch_key:
   - dispatch_key(key="d", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="d", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="d", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="s", hold_ms=200, pause_after_ms=300)
   - dispatch_key(key="d", hold_ms=200, pause_after_ms=200)
   - dispatch_key(key="t", hold_ms=200, pause_after_ms=200)
   - dispatch_key(key="d", hold_ms=500, pause_after_ms=1000)

IMPORTANT: Call dispatch_key ONE AT A TIME per step. Do NOT combine dispatch_key with wait.
Each dispatch_key already includes its own pause_after_ms.

13) Output exactly:
DEMO_STEP: DONE - Synth loaded and Mr. Roboto played
"""


# =============================================================================
# STEP 4: Create a worktree
# =============================================================================
STEP4_TASK = """
You are controlling Freshell, a browser-based terminal multiplexer.

Your task: Create a Claude Code tab and ask it to set up a git worktree for the synth project.

Non-negotiable constraints:
- Stay in ONE browser window and ONE browser tab.
- Use insert_text for terminal input, then send_keys with Enter.

Steps:
1) Look at the Freshell tab bar at the top.
   - If you see a tab with a Claude Code pane (look for the ">" prompt), click it to switch.
   - If NOT, create a new tab: click the "+" button, then pick "Claude" from the pane picker.
   - Wait for Claude Code to initialize (you should see the ">" prompt).
2) Click inside the Claude Code terminal to focus it.
3) Use insert_text to type:

Initialize a git repo in /tmp/moog-synth, commit everything, then create a worktree at /tmp/moog-synth-effects for a feature/effects branch

4) Press Enter with send_keys.
5) If Claude asks a yes/no question or for permission, click the terminal, use insert_text("y"), then send_keys Enter.
6) Wait for Claude to finish. Use wait(seconds=15) and take screenshots to check progress.
   Claude is done when you see the ">" prompt again.
7) Output exactly:
DEMO_STEP: DONE - Worktree created
"""


async def run_step(step_num, browser, args, log):
    """Run a single demo step."""
    tasks = {
        1: ("Create Claude tab + prompt", STEP1_TASK, 60),
        2: ("Wait for Claude to finish", STEP2_TASK, 300),
        3: ("Set up panes + load synth + play Mr. Roboto", STEP3_TASK, 200),
        4: ("Create worktree", STEP4_TASK, 120),
    }

    if step_num not in tasks:
        log.error(f"Unknown step: {step_num}", event="unknown_step")
        return 1

    name, task, max_steps = tasks[step_num]
    log.info(f"Starting step {step_num}: {name}", event="step_start", step=step_num)

    _start, elapsed = monotonic_timer()
    history = await run_agent_task(browser, task, args, log, max_steps=max_steps)
    log.info(
        f"Step {step_num} finished in {elapsed():.1f}s",
        event="step_done",
        step=step_num,
        elapsedS=round(elapsed(), 2),
    )

    # Check result
    final_result_fn = getattr(history, "final_result", None)
    final = final_result_fn() if callable(final_result_fn) else None
    final_text = str(final or "").strip()
    log.info(
        f"Step {step_num} result: {final_text}", event="step_result", step=step_num
    )

    if "DONE" in final_text:
        return 0
    return 1


async def _run(args):
    repo_root = Path(__file__).resolve().parents[2]
    dotenv_path = find_upwards(repo_root, ".env")
    dotenv = load_dotenv(dotenv_path) if dotenv_path else {}

    log = JsonLogger(min_level=("debug" if args.debug else "info"))

    # Resolve config
    base_url = args.base_url or default_base_url(dotenv)
    token = env_or(args.token, "AUTH_TOKEN") or dotenv.get("AUTH_TOKEN")
    try:
        token = require("AUTH_TOKEN", token)
    except ValueError as e:
        log.error(str(e), event="missing_auth_token")
        return 2

    if args.require_api_key and not os.environ.get("BROWSER_USE_API_KEY"):
        log.error("Missing BROWSER_USE_API_KEY", event="missing_browser_use_api_key")
        return 2

    # Suppress noisy logging and redact tokens
    class _RedactTokenFilter(logging.Filter):
        def filter(self, record):
            try:
                msg = record.getMessage()
                redacted = redact_text(msg)
                record.msg = redacted
                record.args = ()
            except Exception:
                pass
            return True

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG if args.debug else logging.INFO)
    for h in root_logger.handlers:
        h.addFilter(_RedactTokenFilter())
    if not root_logger.handlers:
        handler = logging.StreamHandler(stream=sys.stdout)
        handler.addFilter(_RedactTokenFilter())
        handler.setLevel(logging.INFO)
        root_logger.addHandler(handler)

    log.info(
        "Demo config",
        event="demo_config",
        baseUrl=base_url,
        step=args.step,
        headless=args.headless,
        width=args.width,
        height=args.height,
    )

    async def fresh_browser():
        """Create (or re-attach) a browser and navigate to Freshell."""
        return await setup_browser(args, log, token, base_url)

    browser, page = await fresh_browser()

    try:
        if args.step:
            return await run_step(args.step, browser, args, log)
        else:
            start = args.from_step or 1
            end = args.to_step or 4

            for step_num in range(start, end + 1):
                result = await run_step(step_num, browser, args, log)
                if result != 0:
                    log.error(
                        f"Step {step_num} failed",
                        event="step_failed",
                        step=step_num,
                    )
                    return result
                log.info(
                    f"Step {step_num} passed, continuing...",
                    event="step_passed",
                    step=step_num,
                )

                # Between steps: re-attach browser (CDP keeps Chrome state alive)
                if step_num < end:
                    await asyncio.sleep(3)
                    log.info(
                        "Re-attaching browser for next step",
                        event="browser_reattach",
                    )
                    browser, page = await fresh_browser()

            log.info("All demo steps completed!", event="demo_complete")
            return 0
    finally:
        stop = getattr(browser, "stop", None)
        if callable(stop):
            try:
                await stop()
            except Exception:
                pass


def main(argv):
    p = argparse.ArgumentParser(description="Freshell Moog synth demo via browser-use")
    p.add_argument("--step", type=int, default=None, help="Run only step N (1-5)")
    p.add_argument("--from-step", type=int, default=None, dest="from_step", help="Start from step N")
    p.add_argument("--to-step", type=int, default=None, dest="to_step", help="End at step N (inclusive)")
    p.add_argument(
        "--base-url",
        default=None,
        help="Freshell URL (default: http://localhost:$VITE_PORT)",
    )
    p.add_argument("--token", default=None, help="Auth token")
    p.add_argument("--model", default=None, help="Browser Use model")
    p.add_argument(
        "--cdp-url", default=None, help="Connect to existing Chrome via CDP"
    )
    p.add_argument("--headless", action="store_true", help="Run headless")
    p.add_argument("--width", type=int, default=1280, help="Browser width")
    p.add_argument(
        "--height", type=int, default=720, help="Browser height (720p for video)"
    )
    p.add_argument(
        "--max-steps", type=int, default=120, help="Default max agent steps per task"
    )
    p.add_argument("--debug", action="store_true", help="Debug logging")
    p.add_argument(
        "--no-require-api-key",
        dest="require_api_key",
        action="store_false",
        help="Skip BROWSER_USE_API_KEY check",
    )
    p.set_defaults(require_api_key=True)
    args = p.parse_args(argv)

    try:
        return asyncio.run(_run(args))
    except KeyboardInterrupt:
        return 130
    except Exception:
        sys.stderr.write(traceback.format_exc())
        sys.stderr.flush()
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
