<p align="center">
  <img width="406" height="412" alt="image" src="https://github.com/user-attachments/assets/ea2e72cb-69a5-42d6-a853-e51fb1eb807f" />
</p>

> Your machine, your model, your browser — a ghost in the sidebar that works for you,
> on your hardware, on your terms.

*A ghost in the sidebar, a bridge to the wired.*

An AI assistant that lives in your browser sidebar, and a bridge that lets coding agents
use your browser too. Built for collaboration, not autonomy theater. You guide, it executes.

Sitegeist automates repetitive web tasks, extracts data from any website, navigates across
pages, fills out forms, compiles research, and turns what it finds into documents,
spreadsheets, or whatever you need. It works on any website through a Chromium side panel
(Chrome, Brave, Edge, Arc, Vivaldi, Opera, Chromium), using the AI provider of your choice.

Bring your own API key or log in with an existing subscription (Anthropic Claude,
OpenAI/ChatGPT, GitHub Copilot, Google Gemini). Or skip the cloud entirely and point
it at Ollama on your own machine — the model runs where you sit, and nothing ever
leaves the room. Your data stays on your machine. Nothing is collected or tracked.

0xSero's fork (0xSero/sitegeist) added four things to upstream (badlogic/sitegeist, by Mario Zechner):

1. **Background operation.** Every chat owns its own tab group. Tabs open inactive, the
   agent acts on its own current tab, and it never sees or touches your other tabs.
2. **Per-tab panels for parallel tasks.** The panel is bound to a tab, not a window (the
   Claude-in-Chrome model): each task lives on the tab you opened it on, and a tab shows
   the panel only when a task owns it. Run several tasks at once, one per tab, and put
   two tabs in two windows to watch both side by side.
3. **Dynamic model lists.** Models are fetched from the connected providers at runtime
   instead of a hardcoded table.
4. **A harness bridge.** Claude Code, Codex, omp, pi, or any MCP client can drive the
   browser through Sitegeist, in the background, with no configuration.

## What xvoidsx did with this fork

Sitegeist began as [badlogic/sitegeist](https://github.com/badlogic/sitegeist)
by Mario Zechner. 0xSero's fork ([0xSero/sitegeist](https://github.com/0xSero/sitegeist))
added the background tab groups, per-tab panels, runtime model lists, and the harness
bridge. This fork — [xvoidsx/sitegeist](https://github.com/xvoidsx/sitegeist) — builds
on both. It is AGPL-3.0, same as upstream — the source is shared back, as always.

We run our whole stack on this thing — pi on an old ThinkPad, a 1.7B model on local
Ollama, the browser as the hands — so our fork had to be local-first, legible in neon,
and built to survive slow hardware. That is what the changes below are: not a rebrand,
a rebuild around the way we actually use it.

- **Ollama-first.** Settings has an "Add Ollama (local)" one-click preset (base URL
  `http://localhost:11434/v1`) and a "Fetch models" button that lists the server's chat
  models. When a local model is configured, the panel defaults to it instead of
  silently falling back to Sonnet. Local use means nothing leaves your machine: no
  account, no credits, no cloud. The built-in providers (Anthropic, OpenAI, and the
  rest) still work exactly as before.
- **nightshadeNeon theme.** The panel, settings dialogs, welcome orb, and breathing
  Sitegeist wordmark use the xvoidsx palette: dark violet base, pink `#ff10f0`,
  cyan `#00ffff`, green `#39ff14`. While a run is live, a thin neon border cycles the
  palette around the panel edge instead of a "Thinking..." header.
- **Same-tab navigation by default.** A plain "go to <site>" navigates the tab you
  are looking at (falling back to the panel's home tab) and only opens a new tab when
  you explicitly asked for one.
- **Stop that always ends the run.** The composer Stop button is labeled, and pressing
  it ends the run and unlocks the composer — mid-stream, mid-tool, or after the stream
  already stopped. Tools are raced against a 300s timeout (a backstop for a genuinely
  hung tool; there is deliberately no 60s stall watchdog, because old hardware
  legitimately takes longer than that to produce its first events). A run that stays
  streaming with no response for 30s shows a "Still waiting for a response" notice
  with a Stop action — informational, never an abort.
- **Welcome screen on every new conversation**, with rotating provider-neutral
  taglines, a "model · provider" badge when a local provider is configured, and the
  loaded build version (read from the manifest at runtime). Your message appears in
  the chat immediately when you send it, and streamed reasoning stays visible while
  the run is live instead of vanishing when a tool starts.
- **About tab checks xvoidsx releases**, not upstream's version feed
  (which reported 0.6.x and whose Update button installed upstream over this fork).
  The comparison is a real newer-than check, so a local build ahead of the latest
  release is not flagged as an update.
- **Bridge status in Settings.** The Bridge tab shows whether the native host is
  reachable (with the connected harness names) or "not reachable" with the reason and
  the `sitegeist install` remedy. `sitegeist status` is honest the same way: it no
  longer reports "installed" when the CLI itself is gone.
- **Rebuildable from a bare clone.** `@mariozechner/mini-lit` is pinned to the
  published `0.2.1` and the pi packages to published `0.73.1` — no sibling checkouts
  needed. The nine `node_modules` patches (restored Agent mutators, `omitMaxTokens`,
  labeled Stop, optimistic messages, bounded tools, and more) are checked in as
  unified diffs under `patches/` and re-applied automatically after every
  `npm install` by the `postinstall` hook (`scripts/apply-patches.mjs`). See
  [PATCHES.md](PATCHES.md) for why each one exists, and [CHANGELOG.md](CHANGELOG.md)
  for the full list of changes.

Releases are cut on GitHub (see
[Releases](https://github.com/xvoidsx/sitegeist/releases)); the version is
effectively a build counter and rolls on every build, so prefer the latest release
over any version number written down elsewhere.

## Install the extension

On navi, the install path is `scripts/system/navi-lfm3-default-setup.sh` in the
[navi repo](https://github.com/xvoidsx/navi). (navi's `install.sh` itself does not set
sitegeist up — it ships omp and pi, not this.) The script clones (or pulls) this fork, builds
the extension, links the CLI, installs the native host, and writes the pi extension —
idempotently, so re-running it after an update only fixes what is missing. It prints
two manual steps it cannot do for you: load the unpacked extension in Brave (below),
and add the "Ollama (local)" preset in the side panel. That script is also how LFM3
becomes the default Ollama model and the default pi model on a navi machine.

Otherwise:

1. Download or build (`npm run build`) the unpacked extension in `dist-chrome/`.
2. Open `chrome://extensions` (or `brave://extensions`), enable Developer mode, click
   Load unpacked, select `dist-chrome/`.
3. Open the side panel with `Cmd+Shift+S` / `Ctrl+Shift+S` and connect a provider.

No toggles are required. In-page JavaScript runs through the `userScripts` API when the
browser exposes it (an isolated world whose CSP blocks network access from injected code)
and through the debugger's `Runtime.evaluate` otherwise (the page's main world; Chrome
shows its "is debugging this browser" bar). If you want the stricter sandbox, enable
**Allow user scripts** in the extension's details; everything works either way.

Requires Chrome 141+ or the equivalent Chromium release.

## Use it from a coding agent

The side panel is only half of it — the bridge lets your terminal agents drive the
same browser, in the background, while you keep using it.

```bash
cd cli && npm install && npm run build && npm link   # until published to npm
sitegeist install                                     # native-messaging manifest for every Chromium browser found
claude mcp add sitegeist -- sitegeist mcp             # Claude Code
sitegeist pi-extension                                # pi: writes ~/.pi/agent/extensions/sitegeist.ts
sitegeist pi-extension ~/.omp/agent/extensions        # omp: same file, omp's extensions dir
sitegeist status                                      # is the extension reachable?
```

Run the link from inside `cli/` — the repo root is also named `sitegeist` but has no
`bin` field, so a root `npm link` silently creates no binary and `sitegeist install`
then fails with "no such file or directory".

How the pi setup works: `sitegeist install` writes the native-messaging manifest for
every Chromium browser found (Brave included), so the browser can spawn the native
host. `sitegeist pi-extension` writes a self-contained pi extension to
`~/.pi/agent/extensions/sitegeist.ts` that registers the `browser_*` tools
(`browser_navigate`, `browser_find`, `browser_click`, and the rest) by talking to the
bridge socket directly — pi has no MCP client, so no MCP server is involved on the pi
path. `sitegeist status` reports whether the manifest is installed and whether the
extension is reachable. The shape, end to end:

```
pi ── unix socket ── native host ── native messaging ── extension ── browser tabs
```

Code execution stays local (the tools run in pi on your machine, the browser is your
browser); only the model calls leave the machine, to whichever provider you
configured — a local Ollama server by default in this fork.

Codex, in `~/.codex/config.toml`:

```toml
[mcp_servers.sitegeist]
command = "sitegeist"
args = ["mcp"]
```

omp: the same `sitegeist.ts` works there — omp is a fork of pi, it auto-discovers
`~/.omp/agent/extensions/`, and its legacy-pi-compat layer resolves this file's
`@mariozechner/pi-coding-agent` import and accepts its TypeBox tool parameters
(verified against omp's source; bench it on hardware like everything else). Run
`sitegeist pi-extension ~/.omp/agent/extensions` and restart omp. Alternatively, add
an MCP server entry that runs `sitegeist mcp`.

`sitegeist mcp` installs the manifest itself on first run, so the only manual step is
loading the extension once. Reload the extension after the first install.

How it is wired, and why it is safe:

```
harness ── stdio MCP ── sitegeist mcp ── unix socket ── native host ── native messaging ── extension
```

The browser spawns the native host. The host owns a socket in
`/tmp/sitegeist-bridge-<user>/` (0700 directory, 0600 socket) that only your user can
reach, and it only relays frames; all logic and all permission checks live in the
extension. Nothing listens on the network. Each harness gets its own tab group
("Sitegeist · claude", "Sitegeist · pi") and works in the background; `tabs_show` is the
only tool that changes what you see.

Site access: by default the extension asks before an agent opens a new site. Claude Code
and Codex show the prompt inline (MCP elicitation). Otherwise answer it in the side panel
under Settings > Bridge, run `sitegeist allow <host>`, or switch to "allow any site".

CLI commands: `mcp`, `install`, `status`, `allow <host>`, `reload`, `debug`,
`pi-extension`. See `cli/README.md`.

## What changed in this fork

This is the part that got rebuilt — the shape of the fork, not just its theme.

Extension:

- `src/browser/` is new and is the only code that touches tabs: `session.ts` (tab group
  per session, current tab, persistence in `chrome.storage.session`), `cdp.ts`
  (`chrome.debugger` screenshots, real input events, focus emulation so hidden tabs keep
  running `requestAnimationFrame` and lazy loading), `page.ts` (navigation with load
  wait, in-page scripts with `userScripts` → `scripting` → CDP fallbacks, snapshot with
  element refs), `foreground-guard.ts` (popups opened by agent tabs no longer steal
  focus).
- Every tool now acts on the session's current tab instead of the active tab:
  `navigate` (new `showTab`, `closeTab`, `back`/`forward`; `switchToTab` no longer
  focuses), `browserjs()`, native input events, debugger, skills, element picker,
  `extract_image` (CDP screenshot instead of `captureVisibleTab`).
- Opening the side panel puts the tab you opened it on into the session's tab group
  right away, so the group exists from the start. The side panel only reacts to URL
  changes on its own tabs. A link icon in the header shares further tabs with the agent.
- `src/models/`: runtime model discovery for Anthropic, OpenAI, ChatGPT/Codex, Gemini,
  GitHub Copilot, OpenRouter, Mistral, Groq, xAI, Cerebras, Hugging Face; metadata from
  the generated table and models.dev; cached in IndexedDB (`discovered-models` store).
  Providers without a list endpoint keep the static table. `registerModels` was added to
  `pi-ai` (`../pi-mono/packages/ai/src/models.ts` in the old sibling layout — now
  patch #1 in `patches/`, applied by postinstall; see PATCHES.md).
- `src/bridge/`: native messaging port, one browser session per connected harness,
  request routing, site permissions, diagnostics (`bridge.debug`, `bridge.bench`,
  `bridge.reload`). Settings gained a Bridge tab.
- Manifest: fixed `key` (stable id `bbkgpflnkggdfabgjhofdmdopgjopamc`), new permissions
  `tabGroups`, `nativeMessaging`, `alarms`.
- Fixed the type errors in the custom provider dialogs.

CLI (`cli/`, package `sitegeist`): native host, socket client, MCP server with 22 tools,
installer for all Chromium browser directories (macOS, Linux, Windows registry), pi
extension generator.

Design and evidence (reference implementations, experiments, protocol): see
`docs/agent-bridge-design.md`. Live task results and bridge latencies: `docs/benchmarks.md`.
Full list of changes: `CHANGELOG.md`.

## Development

Built to be rebuilt: a bare clone is enough — no sibling checkouts, no hand-edits
in `node_modules`.

```bash
git clone https://github.com/xvoidsx/sitegeist
npm install          # postinstall applies the 9 node_modules patches, see PATCHES.md
(cd cli && npm install)
```

`@mariozechner/mini-lit` is pinned to the published `0.2.1` and the pi packages
(`pi-ai`, `pi-agent-core`, `pi-web-ui`) to published `0.73.1`; `typescript` is a
direct devDependency, so a fresh clone typechecks with nothing next to it. (The old
`file:../mini-lit` sibling link broke fresh clones with
`ENOENT .../mini-lit/package.json`.) The build aliases in `scripts/build.mjs` point
at the installed packages, not at sibling source.

The `node_modules` patches are the one thing that used to be a hand-edit in a sibling
repo: the `registerModels` addition to pi-ai, the restored Agent mutators, the
composer tweaks (ArrowUp prompt recall via `historyProvider`, plain model-id button,
arrow send button), and the rest now live as unified diffs in `patches/`, applied
automatically after every `npm install` by `scripts/apply-patches.mjs` (the
`postinstall` hook). Do not hand-edit `node_modules` — edit the patch file and
re-run `node scripts/apply-patches.mjs`, and keep [PATCHES.md](PATCHES.md) in
agreement with it.

`./dev.sh` still expects the old sibling layout (`../pi-mono`, `../mini-lit`) and
exits without it; use a plain build for now:

```bash
npm run build && sitegeist reload
```

Note: a production build bumps the version in `static/manifest.chrome.json`.

## Checks

```bash
./check.sh        # biome + tsc for the extension and the site
(cd cli && npm run check)
```

The Husky pre-commit hook runs `./check.sh`.

## Website

The fork's home on the web is <https://xvoidsx.org/sitegeist.html> — the
xvoidsx.org sitegeist page, built next alongside this README, pointing at the latest
release here.

`site/` is upstream's marketing site, not ours — leave it alone. It used to deploy to
upstream's own domain; this fork doesn't send anyone there.

## Releasing

```bash
./release.sh patch   # 1.0.0 -> 1.0.1
./release.sh minor   # 1.0.0 -> 1.1.0
./release.sh major   # 1.0.0 -> 2.0.0
```

Bumps the version in `static/manifest.chrome.json`, commits, tags, and pushes. GitHub
Actions builds the extension and creates a release. Note: `.github/workflows/build.yml`
still clones the old `mini-lit`/`pi-mono` siblings before building; they are no longer
needed (the fork builds from published packages) and that step is flagged for removal.

## License

AGPL-3.0. See [LICENSE](LICENSE). Fork lineage:
[xvoidsx/sitegeist](https://github.com/xvoidsx/sitegeist) ←
[0xSero/sitegeist](https://github.com/0xSero/sitegeist) ←
[badlogic/sitegeist](https://github.com/badlogic/sitegeist) (original author Mario Zechner).

Take it, run it, make it yours — the source comes with it, as always.
