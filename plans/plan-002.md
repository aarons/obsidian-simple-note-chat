# Fix LLM title generation for reasoning models

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

1. **Never use tokens as a proxy for response word count.** The returned title must be short regardless of reasoning level; enforce the word limit in code, not via `max_tokens`.
2. **User setting: reasoning effort for note titles.** Valid options: `max`, `xhigh`, `high`, `medium`, `low`, `minimal`, `none`. Default `none`.
3. **User setting: max tokens for reasoning.** Default `1000`.
4. **User setting: max word count for titles.** Default `5`. (This setting already exists as `llmRenameWordLimit`, default 5 — it just needs to be actually enforced on the response.)
5. **Log `finish_reason` when content is missing** in `getChatCompletion`, so this class of failure is diagnosable from the console without capturing raw API traffic.

No backwards-compatibility constraints (single user, unpublished); adding settings fields is fine — `loadSettings` merges `DEFAULT_SETTINGS` with saved data, so new keys pick up defaults automatically.

## Implementation Notes

### Source map (all under `src/`)

- `FileSystemService.ts` — `generateLlmTitle(content, settings)` builds the title prompt, calls `getChatCompletion`, sanitizes (character whitelist, whitespace collapse, 100-char cap), and title-cases the result. This is where the `wordLimit * 5` hack lives and where client-side word-limit enforcement belongs.
- `OpenRouterService.ts` — `getChatCompletion(apiKey, model, messages, maxTokens?)` does a non-streaming POST to `${OPENROUTER_API_URL}/chat/completions` via Obsidian's `requestUrl` (with `throw: false`), reads `data.choices[0].message.content`, shows a `Notice` and returns `null` on any failure. Note: plan-001 item 5.1 (move notices out of the service layer) is still open — if it lands first, adapt error handling to whatever shape it introduces, but don't couple this work to it.
- `SettingsTab.ts` — the archive/LLM-title settings live in the `llmSettingsContainer` div, which is shown only when `enableArchiveRenameLlm` is on. New title settings belong there, next to the existing "Note title model" dropdown and "Title word limit" text input.
- `types.ts` — `PluginSettings` interface + `DEFAULT_SETTINGS`. Existing related keys: `llmRenameModel`, `llmRenameWordLimit`, `llmRenameIncludeEmojis`, `enableArchiveRenameLlm`.

### OpenRouter reasoning API

OpenRouter accepts a unified `reasoning` object in the request body, normalized per provider:

```json
{
  "model": "...",
  "messages": [...],
  "reasoning": {
    "effort": "high",        // OpenAI-style effort level
    "max_tokens": 2000,      // Anthropic/Gemini-style thinking budget
    "enabled": true          // set false to request no reasoning
  }
}
```

Caveats the implementer must verify against the current OpenRouter docs (https://openrouter.ai/docs/use-cases/reasoning-tokens):

- `effort` and `max_tokens` are documented as alternative ways to size reasoning; check whether both may be sent together and which takes precedence. If they conflict, send only the one that expresses the user's choice (see Suggested Approach).
- Provider support for specific effort values varies (e.g. `minimal` is OpenAI-specific; `xhigh`/`max` are not universally supported). OpenRouter generally coerces or ignores unsupported values, but confirm that an out-of-range effort doesn't produce a 400 for common models — if it can, clamp to the nearest supported value rather than failing the archive.
- Some models cannot disable reasoning; `enabled: false` / effort `none` is best-effort. That's acceptable — the overall token headroom (below) must still leave room for content.
- Reasoning tokens count toward the completion's token usage, which is exactly why the old tight `max_tokens` broke.

### The failure surface in `getChatCompletion`

On a 200 response with missing content, the current code logs the whole `data` object at error level and notices "Failed to parse LLM response from OpenRouter." The diagnostic gap: `choices[0].finish_reason` (and OpenRouter's `native_finish_reason`) is the single most useful field — `"length"` means token starvation, `"content_filter"` means refusal, etc.

## Suggested Approach

1. **Settings (`types.ts`)** — add:
   - `llmRenameReasoningEffort: 'max' | 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'` (default `'none'`)
   - `llmRenameReasoningMaxTokens: number` (default `1000`)

2. **Request construction** — extend `getChatCompletion` to accept an optional `reasoning` config (or a small options object replacing the bare `maxTokens` param) and include it in the request body. In `generateLlmTitle`:
   - effort `'none'` → send `reasoning: { enabled: false }`
   - any other effort → send `reasoning: { effort, max_tokens: llmRenameReasoningMaxTokens }` (subject to the mutual-exclusivity check above; if only one may be sent, prefer `max_tokens` as the hard cost/latency cap and log the effort it was derived from — or per docs guidance at implementation time).
   - **Drop `wordLimit * 5` entirely.** For the overall completion cap, either omit `max_tokens` or set a generous safety ceiling that is independent of word count, e.g. `llmRenameReasoningMaxTokens + 500`, so reasoning can never starve the content. Do not reintroduce any word-count-derived token math.

3. **Client-side word limit (`generateLlmTitle`)** — keep the "under N words" instruction in the prompt (it helps), but after sanitization truncate to the first `llmRenameWordLimit` words before title-casing. This is the actual guarantee that titles are short regardless of what the model returns.

4. **Diagnostics (`getChatCompletion`)** — when status is 200 but content is missing/empty, log `finish_reason` and `native_finish_reason` explicitly (not just the raw object), and make the user-facing notice actionable when `finish_reason === 'length'` (e.g. "Model ran out of tokens before answering — try raising the reasoning token limit or lowering reasoning effort").

5. **Settings UI (`SettingsTab.ts`)** — inside `llmSettingsContainer`:
   - "Title reasoning effort" dropdown with the seven options; description should say this only matters for reasoning-capable models and that `none` asks the model not to reason (best-effort).
   - "Reasoning token limit" numeric text input (pattern-match the existing "Title word limit" input: `parseInt`, reject invalid with a notice and revert, set `type="number"`/`min` attributes). Consider hiding or de-emphasizing it when effort is `none`.

## Testing

Avoid introducing boilerplate tests; we do not want excessive pointless tests as these do not serve anyone.
It's extremely important that the tests are meaningful, clear, and validate core issues and behavior.
It's important to figure out tests that validate our business case, and that ensure healthy core architecture.
They can and should help engineers understand the intention behind the code.

The repo currently has no automated test suite; if adding one for this, the pure title post-processing (sanitize → truncate to word limit → title-case) is the meaningful candidate — it now carries the business guarantee that titles are short. Edge cases worth covering: response longer than the word limit, response that sanitizes to empty, emoji handling on/off, and the 100-char cap interacting with the word cap. Request-body construction (reasoning object shape per effort setting) is a reasonable second target if it's factored into a testable function.

## Validation

Manual, via `test-vault/` (build with `npm run build`; `install.sh` copies the build in):

1. With a reasoning model (e.g. `openai/gpt-oss-120b`) as the title model and effort `none` (default): archive a note with a `^^^` marker and brief content below it — the archived note gets a real generated title. This is the exact scenario that failed on 2026-07-09.
2. Same note with effort `high` and reasoning max tokens 1000: still produces a title (reasoning no longer starves content).
3. Set word limit to 3 and prompt content that invites a long title: archived filename contains at most 3 words.
4. With a non-reasoning model: titling still works with effort `none` and with a non-`none` effort (the reasoning param must not break models that ignore it).
5. Force a missing-content response (e.g. set reasoning max tokens absurdly low with a high effort, if the provider honors it): console shows the logged `finish_reason`, and the notice explains the token-starvation case; the note still archives under its current name.
6. Settings tab: new controls appear only when "Generate a title" is on; values persist across reload; invalid token-limit input is rejected with a notice.

## Documentation

- `CHANGELOG.md` is generated by release-please from conventional commits — use a `fix:` commit (this is a user-visible bug fix with settings additions).
- README: the archive/titling section should mention the new reasoning settings and that the title word limit is now strictly enforced.
