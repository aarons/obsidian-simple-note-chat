# Fix LLM title generation for reasoning models

**Status: implemented 2026-07-09** (manual validation via `test-vault/` still pending).

Archive-with-title (`gg`) silently fails to generate a title when the selected model is a reasoning model. Stop using `max_tokens` as a proxy for title word count, give users explicit control over reasoning behavior for title requests, enforce the word limit client-side, and improve diagnostics when a completion comes back empty.

## Context

Simple Note Chat is an Obsidian plugin that turns notes into LLM chats via OpenRouter. One feature: when archiving a note (`gg` command phrase), the plugin can ask an LLM to generate a short title for the archived note (`FileSystemService.generateLlmTitle`, which calls `OpenRouterService.getChatCompletion`).

### The bug

The title request caps the completion at `wordLimit * 5` tokens (default word limit is 5 → 25 tokens) as a hack to keep titles concise. Reasoning models (e.g. `openai/gpt-oss-120b`) spend completion tokens on internal reasoning **before** emitting any content, and those reasoning tokens count against `max_tokens`. Observed failure (2026-07-09, real response):

- `finish_reason: "length"` — the completion hit the 15–25 token cap
- `completion_tokens: 15`, of which `reasoning_tokens: 14`
- `message.content: null` — the model never got to emit the title

`getChatCompletion` finds no content, returns `null`, and the note archives under its current name with a generic "LLM title generation failed" notice. The user selected a reasoning model without any way to know it would break titling.

### Goals

1. Not to use tokens as a proxy for response word count. The returned title must be short regardless of reasoning level; enforce the word limit in code, not via `max_tokens`.
2. New User setting: reasoning effort for note titles. Valid options: `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`. Default `minimal`.
3. New User setting: max tokens for reasoning. Default `1000`.
4. New User setting: max word count for titles. Default `5`. (This setting already exists as `llmRenameWordLimit`, default 5 — it just needs to be actually enforced on the response.)
5. Log `finish_reason` when content is missing in `getChatCompletion`, so this class of failure is diagnosable from the console without capturing raw API traffic.

No backwards-compatibility constraints (single user, unpublished); adding settings fields is fine — `loadSettings` merges `DEFAULT_SETTINGS` with saved data, so new keys pick up defaults automatically.

## Implementation Notes

### Source map (all under `src/`)

- `FileSystemService.ts` — `generateLlmTitle(content, settings)` builds the title prompt, calls `getChatCompletion`, sanitizes (character whitelist, whitespace collapse, 100-char cap), and title-cases the result. This is where the `wordLimit * 5` hack lives and where client-side word-limit enforcement belongs.
- `OpenRouterService.ts` — `getChatCompletion(apiKey, model, messages, options?)` does a non-streaming POST to `${OPENROUTER_API_URL}/chat/completions` via Obsidian's `requestUrl` (with `throw: false`), reads `data.choices[0].message.content`, and **throws** on failure (plan-001 item 5.1 landed: notices moved out of the service layer; `generateLlmTitle` catches, notices, and returns `null`). Failed requests throw `ChatCompletionError` carrying the HTTP status.
- `SettingsTab.ts` — the archive/LLM-title settings live in the `llmSettingsContainer` div, which is shown only when `enableArchiveRenameLlm` is on. New title settings belong there, next to the existing "Note title model" dropdown and "Title word limit" text input.
- `types.ts` — `PluginSettings` interface + `DEFAULT_SETTINGS`. Existing related keys: `llmRenameModel`, `llmRenameWordLimit`, `llmRenameIncludeEmojis`, `enableArchiveRenameLlm`.

### OpenRouter reasoning API (verified against current docs, 2026-07-09)

OpenRouter accepts a unified `reasoning` object in the request body, normalized per provider:

```json
{
  "model": "...",
  "messages": [...],
  "reasoning": {
    // One of the following (NOT both — documented as mutually exclusive):
    "effort": "high",        // "max" | "xhigh" | "high" | "medium" | "low" | "minimal" | "none"
    "max_tokens": 2000,      // Anthropic/Gemini/Qwen-style thinking budget

    "exclude": false,        // true = model still reasons, but the trace is omitted from the response
    "enabled": true          // inferred from effort/max_tokens; effort "none" disables reasoning
  }
}
```

Facts confirmed from the current docs (these resolve the open questions an earlier draft left to the implementer):

- `effort` and `reasoning.max_tokens` are **mutually exclusive** — send one, not both. Sending only `effort` works across providers: effort-only models take it directly, and for budget-style models OpenRouter derives the thinking budget as a ratio of the request's **top-level `max_tokens`** (`max`/`xhigh` ≈ 95%, `high` ≈ 80%, `medium` ≈ 50%, `low` ≈ 20%, `minimal` ≈ 10%), clamped to [1024, 128000] on Anthropic. So effort only has defined meaning when we also send a completion cap, and that cap must be strictly greater than the derived budget so content has headroom.
- `effort: "none"` disables reasoning, but models whose reasoning is **mandatory** reject it (an error, not a silent coercion). The models endpoint tells us in advance: each model from `GET /api/v1/models` may carry a `reasoning` object — `supported_efforts` (null = all accepted), `default_effort`, `default_enabled`, `supports_max_tokens`, `mandatory`. `OpenRouterService.fetchModels` already retrieves and caches this endpoint, so the metadata is available without extra requests.
- For unsupported (non-`none`) effort levels, OpenRouter maps to the nearest supported level — out-of-range effort is not expected to produce a 400, so no client-side clamping is needed.
- `exclude: true` skips returning the reasoning trace. The title flow never reads it, so set it (smaller response; billing is unchanged).
- Reasoning tokens count toward the completion's token usage, which is exactly why the old tight `max_tokens` broke.

### The failure surface in `getChatCompletion`

On a 200 response with missing content, the current code logs the whole `data` object at error level and notices "Failed to parse LLM response from OpenRouter." The diagnostic gap: `choices[0].finish_reason` (and OpenRouter's `native_finish_reason`) is the single most useful field — `"length"` means token starvation, `"content_filter"` means refusal, etc.

## Suggested Approach

1. **Settings (`types.ts`)** — add:
   - `llmRenameReasoningEffort: 'max' | 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'` (default `'minimal'`, matching Goal 2; it also keeps the default away from `none`, which mandatory-reasoning models reject)
   - `llmRenameReasoningMaxTokens: number` (default `1000`) — the reasoning token budget. Because `effort` and `reasoning.max_tokens` are mutually exclusive (see above), this is **not** sent as `reasoning.max_tokens`; it sizes the top-level completion cap that the effort ratios are applied to, so it bounds reasoning spend approximately rather than exactly.

2. **Request construction** — extend `getChatCompletion` to accept an options object (replacing the bare `maxTokens` param) carrying `reasoning` and `max_tokens`, included in the request body. In `generateLlmTitle`:
   - Always send top-level `max_tokens: max(llmRenameReasoningMaxTokens + 500, 1600)` as the completion ceiling. The +500 headroom is what guarantees reasoning can never starve the content (the exact 2026-07-09 failure), and on budget-style providers the effort ratio of this cap becomes the thinking budget. The 1600 floor keeps the cap strictly above Anthropic's 1024-token minimum thinking budget with headroom to spare, so no UI minimum beyond ≥1 is needed on the budget setting.
   - effort `'none'` → send `reasoning: { effort: 'none' }`, **unless** the cached model metadata (`fetchModels`) marks the selected model's reasoning as `mandatory`, in which case omit the `reasoning` field entirely — `none` would be rejected and the archive title would fail outright. If metadata is unavailable for the model, a one-shot retry without `reasoning` on a 400 response covers it.
   - any other effort → send `reasoning: { effort, exclude: true }` (`exclude` because the title flow never displays the trace).
   - **Drop `wordLimit * 5` entirely.** Do not reintroduce any word-count-derived token math.

3. **Client-side word limit (`generateLlmTitle`)** — keep the "under N words" instruction in the prompt (it helps), but after sanitization truncate to the first `llmRenameWordLimit` words before title-casing. This is the actual guarantee that titles are short regardless of what the model returns.

4. **Diagnostics (`getChatCompletion`)** — when status is 200 but content is missing/empty, log `finish_reason` and `native_finish_reason` explicitly (not just the raw object), and make the user-facing notice actionable when `finish_reason === 'length'` (e.g. "Model ran out of tokens before answering — try raising the reasoning token limit or lowering reasoning effort").

5. **Settings UI (`SettingsTab.ts`)** — inside `llmSettingsContainer`:
   - "Title reasoning effort" dropdown with the seven options; description should say this only matters for reasoning-capable models and that `none` asks the model not to reason (skipped automatically for models that can't disable reasoning).
   - "Reasoning token limit" numeric text input (pattern-match the existing "Title word limit" input: `parseInt`, reject invalid with a notice and revert, set `type="number"`/`min` attributes). No high UI minimum is needed — the 1600 floor on the derived completion cap (step 2) already keeps requests valid for Anthropic-style providers regardless of the setting's value. The input is hidden when effort is `none`.

## Testing

Avoid introducing boilerplate tests; we do not want excessive pointless tests as these do not serve anyone.
It's extremely important that the tests are meaningful, clear, and validate core issues and behavior.
It's important to figure out tests that validate our business case, and that ensure healthy core architecture.
They can and should help engineers understand the intention behind the code.

Implemented: vitest (`npm test`) with the pure title post-processing extracted to `src/utils/llmTitle.ts` (`formatLlmTitle`: sanitize → 100-char cap → truncate to word limit → title-case) — it carries the business guarantee that titles are short. Covered: response longer than the word limit, response that sanitizes to empty, emoji handling on/off, and the 100-char cap interacting with the word cap.

## Validation

Manual, via `test-vault/` (build with `npm run build`; `install.sh` copies the build in):

1. With a reasoning model (e.g. `openai/gpt-oss-120b`) as the title model and effort `minimal` (default): archive a note with a `^^^` marker and brief content below it — the archived note gets a real generated title. This is the exact scenario that failed on 2026-07-09.
1a. Same model with effort `none`: still produces a title. If the model's metadata marks reasoning as mandatory, verify from the console/network log that the `reasoning` field was omitted rather than sent as `none`.
2. Same note with effort `high` and reasoning max tokens 1000: still produces a title (reasoning no longer starves content).
3. Set word limit to 3 and prompt content that invites a long title: archived filename contains at most 3 words.
4. With a non-reasoning model: titling still works with effort `none` and with a non-`none` effort (the reasoning param must not break models that ignore it).
5. Force a missing-content response (e.g. temporarily hardcode a tiny top-level `max_tokens` in a dev build — the shipped settings floor makes this hard to reach through the UI, which is the point): console shows the logged `finish_reason`, and the notice explains the token-starvation case; the note still archives under its current name.
6. Settings tab: new controls appear only when "Generate a title" is on; values persist across reload; invalid token-limit input is rejected with a notice.

## Documentation

- `CHANGELOG.md` is generated by release-please from conventional commits — use a `fix:` commit (this is a user-visible bug fix with settings additions).
- README: the archive/titling section should mention the new reasoning settings and that the title word limit is now strictly enforced.


## Dev Notes

https://openrouter.ai/docs/guides/best-practices/reasoning-tokens

The "OpenRouter reasoning API" section above was reconciled against the live reasoning-tokens doc on 2026-07-09 (mutual exclusivity of `effort`/`reasoning.max_tokens`, effort→budget ratios applied to top-level `max_tokens`, per-model `reasoning` metadata on `GET /api/v1/models`, `mandatory` models rejecting effort `none`). The earlier "implementer must verify" caveats are resolved and folded into the design.

