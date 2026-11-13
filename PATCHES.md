# node_modules patches for the sitegeist fork

`npm install` wipes `node_modules`, so these patches are re-applied
automatically: `patches/` holds one unified diff per fix, and
`scripts/apply-patches.mjs` (wired to the `postinstall` hook in
`package.json`) applies them in numeric order after every install. The patch
files are the executable truth; this document is the human-readable record of
why each one exists. Keep the two in agreement.

## 1. pi-ai: registerModels / resetProviderModels / getGeneratedModels

Source: 0xSero/sitegeist README (runtime model discovery).
File: `sitegeist/node_modules/@mariozechner/pi-ai/dist/models.js` (+ `.d.ts`)
Applied when: `grep -q registerModels` on models.js is false.

Appended to `models.js`:

```js
// --- sitegeist patch: runtime model discovery (from 0xSero/sitegeist README) ---
export function registerModels(provider, models) {
    const providerModels = new Map();
    for (const model of models) providerModels.set(model.id, model);
    modelRegistry.set(provider, providerModels);
}
export function resetProviderModels(provider) {
    const generated = MODELS[provider];
    if (!generated) {
        modelRegistry.delete(provider);
        return;
    }
    const providerModels = new Map();
    for (const [id, model] of Object.entries(generated)) providerModels.set(id, model);
    modelRegistry.set(provider, providerModels);
}
export function getGeneratedModels(provider) {
    const generated = MODELS[provider];
    return generated ? Object.values(generated) : [];
}
```

Appended to `models.d.ts`:

```ts
export declare function registerModels(provider: string, models: Model<Api>[]): void;
export declare function resetProviderModels(provider: string): void;
export declare function getGeneratedModels(provider: string): Model<Api>[];
```

## 2. pi-ai: honor compat.omitMaxTokens for custom providers

Why: `src/sidepanel.ts` sets `compat.omitMaxTokens: true` for custom
OpenAI-compatible providers so thinking models (e.g. LFM3) are not cut off
mid-answer by the dialog's 8192 maxTokens default. But published
`@mariozechner/pi-ai` 0.73.1 (latest on npm as of 2026-11-12) does not read
`omitMaxTokens` at all — `getCompat()` drops unknown compat fields and
`buildParams()` sends `max_completion_tokens` unconditionally. Without this
patch the sidepanel flag is dead code and the 8192 cap still applies.
Upstream pi-mono has since added `compat.omitMaxTokens`; drop this patch
once a published pi-ai ships it.

File: `sitegeist/node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js`
Change (in `buildParams`, the single place max tokens are sent):

```diff
-    if (options?.maxTokens) {
+    if (options?.maxTokens && !model.compat?.omitMaxTokens) {
         if (compat.maxTokensField === "max_tokens") {
```

Verify: `grep -n "omitMaxTokens" node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js`
should print line 401. After `npm run build`, verify it landed in the bundle:
`grep -o "omitMaxTokens" dist-chrome/sidepanel.js | wc -l` should be >= 1.

## 3. pi-agent-core: restore setModel / setThinkingLevel / appendMessage

Why: `src/sidepanel.ts` (startup default selection, ModelSelector onSelect,
welcome message) calls `agent.setModel(model)`,
`agent.setThinkingLevel(level)` and `agent.appendMessage(message)`, but
published `@mariozechner/pi-agent-core` 0.73.1 does not ship those methods.
Upstream removed the Agent mutators in pi-mono 0.65.0 (2026-04-03,
`packages/agent/CHANGELOG.md`: "Removed `Agent` mutator methods in favor of
direct property access" — `setModel` -> `agent.state.model = model`,
`setThinkingLevel` -> `agent.state.thinkingLevel = level`,
`appendMessage` -> `agent.state.messages.push(message)`). Every model change
therefore threw `TypeError: setModel is not a function`: the panel defaulted
to the stored `lastUsedModel` (Sonnet) and no selector click could ever move
off it. The implementations below are verbatim from pi-mono v0.64.0
(`packages/agent/src/agent.ts`, tag `v0.64.0`) — plain state assignment, no
extra side effects — and are compatible with 0.73.1's mutable state object
(`createMutableAgentState`). Drop this patch if the extension source is ever
migrated to direct state assignment (the upstream-endorsed form).

Files:
- `sitegeist/node_modules/@mariozechner/pi-agent-core/dist/agent.js`
- `sitegeist/node_modules/@mariozechner/pi-agent-core/dist/agent.d.ts`

Added to `agent.js`, inside `class Agent` after `hasQueuedMessages()`:

```js
// --- sitegeist patch: restore pre-0.65 Agent mutators (removed upstream in
// pi-mono 0.65.0 in favor of direct state assignment; implementations verbatim
// from pi-mono v0.64.0 packages/agent/src/agent.ts). ---
setModel(model) {
    this._state.model = model;
}
setThinkingLevel(level) {
    this._state.thinkingLevel = level;
}
appendMessage(message) {
    this._state.messages = [...this._state.messages, message];
}
```

Added to `agent.d.ts` (imports extended with `Model` from
`@mariozechner/pi-ai` and `ThinkingLevel` from `./types.js`; declarations
after `hasQueuedMessages(): boolean;`):

```ts
setModel(model: Model<any>): void;
setThinkingLevel(level: ThinkingLevel): void;
appendMessage(message: AgentMessage): void;
```

Verify: `node -e` smoke test importing the patched `agent.js` and calling all
three methods updates `agent.state` (model id/provider, thinkingLevel,
messages length). After `npm run build`, verify they landed in the bundle:
`grep -o "setModel(model) {" dist-chrome/sidepanel.js` should show the
method body `this._state.model = model` (and likewise for the other two).

## 4. pi-web-ui: labeled Stop button in the composer

Why: while a run is streaming the composer swaps the send button for a bare
Square icon, which reads as a mysterious checkbox. It is the stop/abort button.
File: `sitegeist/node_modules/@mariozechner/pi-web-ui/dist/components/MessageEditor.js`
Change (stop button only): size `"icon"` -> `"sm"`, children `icon(Square, "sm")`
-> icon + `"Stop"` text, `title: "Stop generating"`, class `h-8 w-8` -> `h-8`.
Verify: `grep -n "Stop" node_modules/@mariozechner/pi-web-ui/dist/components/MessageEditor.js`.

## 5. pi-web-ui + pi-agent-core: optimistic user message, stuck-run notice, failure log

Why: the typed message only rendered once the agent loop emitted events, so a
slow first response made the panel look dead; and a run that never settles spun
forever with no explanation.
Files:
- `sitegeist/node_modules/@mariozechner/pi-web-ui/dist/components/AgentInterface.js`
  - `sendMessage` builds the user message object once, appends it via
    `session.appendMessage` (restored in patch #3) before `prompt(message)`,
    and requests an update — the message shows instantly. If `prompt()` throws
    the optimistic message is removed again so no orphan stays behind.
  - Stuck-run notice: `_lastStreamActivity` / `_stuckTimer` /
    `_showStuckNotice`. Every stream event resets a 30s timer (armed in
    `sendMessage` before `prompt()`); firing while still streaming with no
    activity shows "Still waiting for a response — the model may still be
    loading. You can stop and try again." with a Stop button
    (`session.abort()`). Cleared on `agent_end`, disconnect, or session change.
- `sitegeist/node_modules/@mariozechner/pi-agent-core/dist/agent.js`
  - `processEvents` `message_end`: skip the push when the exact message object
    is already in `state.messages` (reference equality). This is what makes the
    optimistic append safe — `runAgentLoop` re-emits the same prompt object it
    received, so without the check the user message would appear twice.
  - `handleRunFailure`: `console.error("[Agent] run failed:", error)`. The
    failure already surfaces as an error message in the transcript; the log
    makes it visible in DevTools.
Verify: `grep -n "appendMessage(message)\|_showStuckNotice" node_modules/@mariozechner/pi-web-ui/dist/components/AgentInterface.js`;
`grep -n "includes(event.message)" node_modules/@mariozechner/pi-agent-core/dist/agent.js`.
After `npm run build`, verify the markers landed in the bundle:
`grep -o "Still waiting for a response\|appendMessage(message)\|includes(event.message)" dist-chrome/sidepanel.js | sort | uniq -c`.

## 6. pi-agent-core: bound tool execution (300s timeout + abort race)

Why: `runAgentLoop` awaited `tool.execute()` with no bound and no abort race.
A tool whose promise never settles (a page primitive that never resolves, a
stream that never closes) wedged the run forever with the composer locked and
Stop dead — abort only flips a signal the tool may not watch. The navigate
tool's own waits are already bounded (`navigateTab`/`waitForLoad`, 15s), but
nothing bounded the tool as a whole, and other tools (`runInPage`,
`cdpSend`) have no timeout at all.
File: `sitegeist/node_modules/@mariozechner/pi-agent-core/dist/agent-loop.js`
Change (`executePreparedToolCall`): the `tool.execute(...)` await is raced
against a 300s timer and the run's abort signal. On timeout the error is
`Tool <name> timed out after 300s`; on abort it is `Aborted`. Either way the
error becomes an error tool result (existing catch), so the run continues to
a clean ending instead of spinning. The underlying tool promise is left to
finish on its own; its outcome is discarded.
(Round 6, 2026-11-12: raised from 60s to 300s — Raven's T440p bench showed
old hardware legitimately needs longer; 300s is a backstop for a genuinely
hung tool only.)
Verify: `node /tmp/sg-round5-test.mjs` TEST1 — a never-settling tool ends the
run after ~300s with the timeout error tool result (`TEST1 PASS`).

## 7. pi-agent-core: immutable message completion

Why: a render gap found while tracing the stuck "Navigating to…" chip.
`processEvents` `message_end` did `state.messages.push(...)` — the same
array reference — and Lit lists bound to `state.messages` only re-render
on a reference change. The loop emits `tool_execution_end` BEFORE the tool
result message reaches state, so the re-render at `tool_execution_end` still
shows the loading chip, and the later `message_end` never re-renders the
list: the chip spins forever even though the tool returned.
Files: `sitegeist/node_modules/@mariozechner/pi-agent-core/dist/agent.js`
Changes:
- `processEvents` `message_end` (and `handleRunFailure`): assign a new array
  (`this._state.messages = [...this._state.messages, event.message]`) instead
  of push, so every completed message — tool results, failure messages —
  re-renders the list immediately. The optimistic-append dedupe (patch #5,
  reference equality) is preserved.
- (Round 6, 2026-11-12: this entry originally also added a 60s stall
  watchdog in `runWithLifecycle` that aborted a run with no loop event for
  60s. REMOVED in round 6 — Raven's T440p bench showed the first loop events
  legitimately take over 60s on old hardware (model load + slow CPU
  inference), so the watchdog fired on healthy runs. No replacement watchdog;
  the 30s stuck-run notice (informational, never aborts) and user Stop are
  the controls. The `_lastEventAt` field and all watchdog code are gone from
  `agent.js`.)
Verify: `grep -n "includes(event.message)" node_modules/@mariozechner/pi-agent-core/dist/agent.js`;
`grep -c "_lastEventAt\\|watchdog" node_modules/@mariozechner/pi-agent-core/dist/agent.js` must be 0.

## 8. pi-web-ui: stuck notice covers tool calls, thinking persists

Why: (a) the stuck-run notice (patch #5) never saw tool events — its
subscription had no `tool_execution_*` cases — so a single tool call running
past 30s showed no notice. (b) The model's streamed reasoning vanished when
the tool chip took over: the thinking block renders collapsed by default, so
live reasoning disappeared the moment the tool started.
Files:
- `sitegeist/node_modules/@mariozechner/pi-web-ui/dist/components/AgentInterface.js`
  - Subscription handles `tool_execution_start` (records `_toolStartAt`,
    re-arms the timer) and `tool_execution_update`/`tool_execution_end`
    (tool progress counts as activity). The timer callback also fires when a
    single tool has run 30s+.
  - `_clearStuckTimer` clears `_toolStartAt` too.
- `sitegeist/node_modules/@mariozechner/pi-web-ui/dist/components/Messages.js`
  - The assistant renderer passes `.isStreaming=${this.isStreaming || anyPending}`
    to the thinking block, where `anyPending` is true while one of the
    message's tool calls is still pending.
- `sitegeist/node_modules/@mariozechner/pi-web-ui/dist/components/ThinkingBlock.js`
  - The block renders its content while `isStreaming` is true (in addition to
    when manually expanded), so reasoning stays visible while the run is live
    or a tool is pending, and collapses to the tidy "Thinking..." disclosure
    once done.
Verify: `grep -n "_toolStartAt\\|tool_execution_start" node_modules/@mariozechner/pi-web-ui/dist/components/AgentInterface.js`;
`grep -n "anyPending" node_modules/@mariozechner/pi-web-ui/dist/components/Messages.js`;
`grep -n "isExpanded || this.isStreaming" node_modules/@mariozechner/pi-web-ui/dist/components/ThinkingBlock.js`.
After `npm run build`, verify the markers landed in the bundle:
`grep -o "_toolStartAt\\|anyPending\\|timed out after" dist-chrome/sidepanel.js | sort | uniq -c`.
