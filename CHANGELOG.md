# Changelog

## [Unreleased]

### Added
- `actions` bridge method and MCP tool: up to 40 input steps (press, click, drag, type, hover, scroll, wait) in one call with an optional closing screenshot. A canvas flowchart (two shapes, labels, bound arrow) is one call instead of 60 to 120 model turns.
- `sitegeist debug` lists the active tab per window and records foreground-guard decisions; `bridge.activate` puts a tab back in front (dev aid after a focus mishap).
- `tabs.context` flags tabs that sit outside the session's group (`inGroup: false`).
- `scripts/bench/`: omp-driven workflow benchmark (drawing in Excalidraw/tldraw sandboxes, multi-tab research, form round trips) with trace stats, post-run inspection (tabs, group membership, app-state verification) and a per-task focus-steal check; `scripts/probe/` for raw bridge calls.
- Browser sessions: every chat owns its own tab group and works in the background. Tabs open inactive, tools act on the session's current tab, and the agent never sees the user's other tabs. The tab the side panel is opened on becomes the session's first tab (the group appears immediately); a "share this tab" button hands over further tabs; `navigate { showTab }` is the only way the agent brings a tab forward.
- Screenshots and trusted input events go through `chrome.debugger` (works on hidden tabs; focus emulation keeps requestAnimationFrame and lazy loading alive off-screen).
- Foreground guard: popups opened by agent tabs no longer steal focus.
- Dynamic model discovery: provider model lists are fetched at runtime (Anthropic, OpenAI, ChatGPT/Codex, Gemini, GitHub Copilot, OpenRouter, Mistral, Groq, xAI, Cerebras, Hugging Face), enriched from the generated table and models.dev, cached in IndexedDB.
- Bridge for external agents: `cli/` ships the `sitegeist` command (`sitegeist mcp`, `install`, `status`, `allow`, `reload`, `debug`, `pi-extension`). Harnesses reach the browser through a native messaging host and a user-only unix socket; each harness gets its own tab group. Settings > Bridge controls site permissions.
- Custom Providers: "Add Ollama (local)" one-click preset (name "Ollama Local", OpenAI-compatible base URL `http://localhost:11434/v1`) and a "Fetch models" button in the provider editor that lists the server's chat models from `GET {baseUrl}/models`.
- nightshadeNeon theme: the side panel and settings dialogs use the xvoidsx palette — dark violet base, pink `#ff10f0` primary, cyan `#00ffff` secondary, green `#39ff14` for success/live states — via token overrides in `src/app.css`.
- Welcome screen: the tagline now rotates through provider-neutral lines ("your AI companion for the web / research / browsing / getting things done / the open web") with a fade, and shows a small "model · provider" badge only when a local custom provider is configured.
- nightshadeNeon orb: the welcome orb's dark-theme colors are pink/cyan/green with violet depth (light theme unchanged).
- New tutorial chip: "Summarize this page".
- Composer stop button is now a labeled "Stop" button (was a bare square icon).
- Your message appears in the chat immediately when you send it, instead of waiting on the first model event.
- A run that stays streaming with no response for 30s shows a "Still waiting for a response" notice with a Stop action.
- The "Sitegeist" wordmark breathes through the nightshadeNeon palette (pink → cyan → green glow, 6s cycle).
- The welcome screen shows the loaded build version (e.g. `v1.2.3`) under the driver badge, read from the manifest at runtime.
- Working-state glow: while the agent is streaming, a thin neon border cycles the nightshadeNeon palette (pink → cyan → green) around the panel edge, with a soft pulsing inner glow. The glow replaces the "Thinking..." header while the run is live; the reasoning content underneath still shows, and the header returns, collapsed, when the run ends.
- Bridge tab (Settings) shows native-host status: connected (with harness names) or "not reachable" with the reason and the `sitegeist install` remedy, sampled live from the service worker.
- `patches/` + `scripts/apply-patches.mjs` (postinstall): the eight node_modules patches (registerModels, omitMaxTokens, Agent mutators, labeled Stop, optimistic message, tool timeout, immutable messages, tool-progress thinking) are now checked in as unified diffs and re-applied automatically after every `npm install`, idempotently; see PATCHES.md.

### Changed
- `navigate` gained `showTab` and `closeTab`; `switchToTab` no longer focuses the tab.
- Composer: ArrowUp in an empty composer recalls the last prompt; the model picker is a plain model-id button and the send button is an arrow (pi-web-ui `MessageEditor`/`AgentInterface`, see README). The provider/auth label was removed from the header.
- Browser sessions persist in `chrome.storage.local` (they and their groups survive extension reloads), grouping retries when Chromium refuses a tab edit, and the panel adopts the tab it opens on even when that is a New Tab page.
- Side panel is bound to a tab, not a window (Claude-in-Chrome model): each task lives on the tab its panel was opened on via `sidepanel.html?tabId=<tab>`, and the manifest declares no default panel, so a tab shows the panel only when a task owns it. Two tasks = two tabs, each with its own panel; put them in two windows to see both at once. The window-session lock and the "locked" landing page are gone; `src/utils/port.ts` is now lifecycle-only. While a task is mid-run its panel stays on the window's active tab so switching tabs doesn't tear the agent down.
- Removed upstream working notes from the repository root (`db.md`, `gmail.md`, `plan.md`).
- Default model selection is Ollama-first: a saved custom-provider model wins, otherwise the first model of an "Ollama Local" custom provider is preferred over the built-in defaults, so the panel no longer silently falls back to Sonnet while Ollama is configured. The Anthropic/Sonnet fallback is kept as the last resort.
- Navigation reuses the current tab by default: a plain "go to <site>" navigates the tab the user is looking at (falling back to the panel's home tab when the session has no current tab yet) and only opens a new tab when the user explicitly asked for one. The tool description and parameter text say so.
- Per-tool timeout raised from 60s to 300s (5 minutes): a backstop for a genuinely hung tool only, long enough for old hardware and heavy pages.

### Fixed
- Hidden agent tabs render at a fixed 1280x800 viewport (CDP device-metrics override, dropped while the user looks at the tab and restored when the agent acts on it again), so screenshot pixels, DOM coordinates and click coordinates are the same numbers in every window; models mixed the two scales on wide windows and clicked the wrong spots.
- `actions` spaces steps by `settleMs` (default 80 ms) so a keystroke after Enter is not lost while the app opens its text editor, and accepts `key`, `text`, `doubleClick`, `move`, `sleep` and mid-list `screenshot` steps.
- Screenshot coordinates: x/y for click, drag, hover and scroll are pixels of the tab's latest screenshot and are mapped to the page in the extension (models no longer multiply by a scale factor, which they got wrong); default screenshots are CSS-pixel scale up to 1280 px wide (the DPR was double-counted before).
- `drag` reports the held button on moves (`buttons: 1`) and moves in 12 steps, so pointer-driven canvas apps register the drag.
- Popups from `target=_blank` links (noopener, no `openerTabId`) are adopted via `webNavigation.onCreatedNavigationTarget`; the guard restores the tab the user was on right before the popup, and tabs Chrome drops into an agent's group become that agent's.
- `navigate` reports `loading: true` only when the wait timed out, not whenever subresources are still loading (models spent a turn waiting after every navigation).
- Screenshots of background tabs took 30 to 75 s and could stall the bridge: captures are now scaled inside the renderer (`clip.scale`) as JPEG with `optimizeForSpeed`, and bounded at 20 s with an actionable error. Bridge screenshots default to 1024 px JPEG.
- Empty tabs: tools no longer open an `about:blank` tab when a session has none (they tell the model to navigate first); the first `navigate` opens the tab straight on its URL, and `newTab` / `tabs.create` no longer load the URL twice. Abandoned bridge sessions have their blank tabs closed.
- Tab groups: a new session could take over another agent's group whose title matched (all `mcp` clients shared one group); groups now belong to one session, labels are made unique (`omp`, `omp 2`), stray tabs are regrouped, tabs in another window are moved to the group's window, and a group that refuses a tab is replaced instead of leaving the tab loose. A tab belongs to exactly one session.
- Disconnections: `sitegeist mcp` always uses a stable session key, so reconnects keep their tabs, and the CLI client retries a call once after an extension reload, service-worker restart or host respawn (waiting up to 40 s for the bridge to come back).
- Stale sessions: the session table (130+ dead records here) is pruned on worker start and every 5 minutes; idle abandoned agent groups are collapsed.
- Navigation: waits start at commit (a load still finishing from the previous page no longer satisfies them), hash and pushState navigations return immediately instead of waiting out the timeout, network errors are reported (`net::ERR_NAME_NOT_RESOLVED`), and results say `loading: true` when the page is still loading. Prerendered pages that swap tab ids keep their session.
- Side panel: clicking the toolbar icon on a tab that already shows a panel (including a running task's panel kept up on another tab) opens it instead of re-pointing it, which reloaded the panel and killed the running agent; opening the panel on a tab an external agent is driving no longer steals that tab; the busy state names the running task, so the right panel is kept up; re-opening a session no longer yanks the agent back to its home tab.
- Foreground guard: a link the user opens from a tab they are looking at is no longer pulled back out of view.
- Custom OpenAI-compatible providers (Local Studio, vLLM, SGLang) no longer send `max_tokens` (the dialog default of 8192 cut thinking models off mid-answer); discovery reads `max_model_len` as the context window. Requires pi-ai's new `compat.omitMaxTokens`.
- Model switching works again: restored the `Agent` `setModel` / `setThinkingLevel` / `appendMessage` mutators that published pi-agent-core 0.73.1 no longer ships (removed upstream in pi-mono 0.65.0). Every model change threw `TypeError: setModel is not a function`, so the panel was stuck on its startup model (Sonnet) and model-selector clicks did nothing.
- Custom providers actually omit `max_tokens` now: the sidepanel flag above was set, but published pi-ai 0.73.1 ignores `compat.omitMaxTokens` (its `getCompat()` drops the field). A `node_modules` patch makes `buildParams()` skip max tokens when the flag is set; see `PATCHES.md` in the build tree. Drop the patch once a published pi-ai ships `omitMaxTokens`.
- MCP token use: `read_page` and `find` return one line per element instead of pretty JSON (roughly a quarter of the tokens), `read_page` text defaults to 3000 characters, snapshots list in-viewport elements first so long pages are not cut above the fold, and tool descriptions spell out the tab-group workflow.
- The side panel no longer requires the "Allow User Scripts" toggle: page injection (`browserjs()`, overlay, element picker, image extraction) runs through `userScripts` when available and through the debugger's `Runtime.evaluate` otherwise, with a CDP-binding shim standing in for `chrome.runtime.sendMessage` (`src/browser/inject.ts`). `userScripts` moved to `optional_permissions`.
- Type errors in `CustomProviderEditDialog` (missing i18n keys) and `CustomProvidersTab` (`remove` shadowed `HTMLElement.remove`).
- Manifest: fixed extension `key` (stable id `bbkgpflnkggdfabgjhofdmdopgjopamc`), new permissions `tabGroups`, `nativeMessaging`, `alarms`.
- Session restore for a tab is wrapped so a storage failure logs to the console instead of killing panel init.
- The service worker's `onTabReplaced` handler is guarded so a session/storage failure can't surface as an uncaught worker error.
- Stream failures are now also logged to the console (`[Agent] run failed`); they already surfaced as error messages in the transcript.
- A tool call that never returns no longer wedges the run: tool execution is raced against a 300s timeout and the run's abort signal, so Stop cancels a stuck tool and a timeout becomes an error tool result the model can answer instead of a spinning chip.
- Tool results and failure messages render immediately: completed messages replace the transcript array instead of pushing into it, so Lit re-renders the list the moment a tool returns. Previously the "Navigating to…" chip kept spinning after the tool had returned, because the re-render at `tool_execution_end` ran before the result arrived and the later result push changed no bound reference.
- The stuck-run notice now covers long tool calls: tool start/end events feed its timer, and it also fires when a single tool runs past 30s.
- Streamed reasoning no longer vanishes when a tool starts: the thinking block stays expanded while the run is live or one of the message's tool calls is still pending, then collapses to the "Thinking..." disclosure once done.
- Tutorial chips no longer throw: `selectTutorial` called `Agent.replaceMessages`, which does not exist at runtime (upstream removed the Agent mutators in pi-mono 0.65.0); it now assigns the filtered list to `agent.state.messages` directly.
- New conversation always shows the welcome again: the welcome append emits no agent event, so the message list is now explicitly re-rendered after it is added; and the "+" button forced a reload only when the URL changed — while a run is stuck before the first assistant message the URL is still `?new=true` (no save yet), so clicking "+" silently did nothing exactly when a fresh start was needed most. An identical target URL now forces `location.reload()` (same guard in session loading).
- About tab and the update check point at the xvoidsx/sitegeist GitHub releases instead of upstream's `sitegeist.ai` version feed (which reported 0.6.x and whose Update button installed upstream over this fork). No releases published yet means "up to date", never a false update; the version comparison is a real newer-than check, so a local build ahead of the latest release is not flagged. Footer links point at the repo; upstream Imprint/Privacy are gone. The CLI version now tracks the extension release (was `0.1.0`).
- `sitegeist status` no longer reports "installed" when the CLI itself is gone: `isInstalled()` now verifies the launcher's target script exists, so a deleted repo/link reads as missing instead of claiming the bridge is fine.
- A missing native host is visible now instead of silent: the worker logs a warning (was debug-only) and publishes host state, so Settings > Bridge shows "not reachable" with the reason instead of looking like "no harness connected".

### Removed
- The 60s stall watchdog in the agent lifecycle is gone: on old hardware the first loop events legitimately take over 60s (model loading into memory plus slow CPU inference), so the watchdog aborted healthy runs. No replacement watchdog — the 30s "Still waiting for a response" notice (informational, never aborts) and the user-controlled Stop are the controls now.

## [1.0.0] - 2026-03-15

### Added

- Browser-based OAuth login for Anthropic (Claude Pro/Max), OpenAI Codex (ChatGPT Plus/Pro), GitHub Copilot, and Google Gemini CLI
- Combined "API Keys & OAuth" settings tab with subscription login and API key entry
- Welcome setup dialog on first launch when no providers are configured
- Auto-select default model for the first provider with a key
- Provider and auth type indicator in the header bar
- Image extraction tool (`extract_image`) with selector and screenshot modes
- Subsequence-based fuzzy search in the model selector
- CORS proxy warning in OAuth sections (orange when enabled, red when disabled)
- GitHub Actions workflow for tagged releases
- `release.sh` script for version bumping and tagged releases

### Changed

- Default model changed to `claude-sonnet-4-6` with `medium` thinking level
- CORS proxy enabled by default
- Model selector only shows models from providers with configured keys
- API key prompt dialog now shows both OAuth login and API key entry for supported providers
- Tool execution set to sequential mode (parallel caused rendering issues in sidebar)
- Site converted to static (removed backend, admin, waitlist signups)
- Download links point to GitHub Releases
- License changed from MIT to AGPL-3.0

### Fixed

- Settings dialog tabs not responding to clicks (upstream `pi-web-ui` built with `tsgo` broke Lit decorator reactivity)
- CORS proxy toggle not updating (same root cause)
- Proxy not applied to API requests (esbuild bundled duplicate `streamSimple` references, breaking identity check)
- Model selector button not updating after picking a model (added `state_change` event to Agent)
- Duplicate tool component rendering during streaming (cleared streaming container on `message_end`)
- Screenshot tool capturing sidepanel instead of the webpage
