# Code review remediation: bug fixes and cruft removal

Address the findings from the 2026-07-09 code review. The plugin was originally written with an older AI agent, and the review found a handful of real bugs plus a layer of dead machinery, overly defensive code, and duplication. This plan tracks fixing the bugs and subtracting the cruft. The plugin is feature complete — no structural redesign is expected, and there are no backwards-compatibility requirements (single user, unpublished).

## Context

Simple Note Chat is an Obsidian plugin that turns any note into a chat with an LLM via OpenRouter. The user types a command phrase (e.g. `cc`) on its own line and presses Enter; the plugin parses the note into user/assistant messages (split on `CHAT_SEPARATOR`), streams the model's response into the note, and appends a separator. Other command phrases archive the note (`gg`, optionally LLM-generating a title), create a new chat note (`nn`), or open a model selector (`cm`).

Source layout (`src/`):
- `main.ts` — plugin entry; registers commands, a scoped keydown listener on the active MarkdownView, and the command-phrase map.
- `ChatService.ts` — orchestrates a chat turn: inserts a "Calling model..." status message, parses note content, streams chunks into the editor, tracks active streams per file path for cancellation (Escape).
- `OpenRouterService.ts` — model list fetch + 24h cache, streaming and non-streaming completions.
- `EditorHandler.ts` — the four `trigger*Command` handlers invoked when a command phrase is detected.
- `FileSystemService.ts` — archive/move logic, boundary-marker (`^^^`) splitting, LLM title generation.
- `SettingsTab.ts`, `ModelSelectorModal.ts` — UI.
- `utils/logger.ts` — level-gated console logger.

Explicitly **out of scope** (accepted as a known limitation for now): the fragility of tracking stream-insert positions as `{line, ch}` snapshots — typing elsewhere in the document during a stream can corrupt insert positions. This needs real design work and is deferred.

## Work items

Ordered by suggested priority: user-visible bug fixes first, then pure-subtraction cleanups, then duplication collapses, then judgment-call improvements.

### Phase 1: Completed
### Phase 2: Completed

### Phase 3: Remove overly defensive code

- [x] **3.1 Drop impossible service fallbacks** — `SettingsTab.ts:27` and `ModelSelectorModal.ts:13` fall back to `new OpenRouterService()` when `plugin.openRouterService` is unset; it never is, and a second instance would have its own empty cache (a bug if ever hit). Use the plugin's instance directly.
- [x] **3.2 Remove can't-fail dropdown validation** — three `onChange` handlers validate the value Obsidian's own dropdown just supplied (`SettingsTab.ts:78-88`, `363-372`, `476-484`).
- [x] **3.3 Simplify impossible-state branches** — `removeStatusMessageAtPos` `undefined` position guard (`ChatService.ts:268`, callers always pass positions); the four-way completion branching in `startChat` (`ChatService.ts:199-218`, two branches unreachable given the invariant enforced at line 187); dead "cancellation failed" branch in `handleEscapeKey` (`main.ts:356-359`, `cancelStream` returns true whenever a stream exists); redundant outer try/catch in the stream read loop (`OpenRouterService.ts:460-462`). Notes: the `undefined` position guard was already gone after the Phase 1 signature change (the remaining start>=end range check guards genuinely-possible stale positions and stays); `cancelStream` now returns `void` since its boolean had no remaining consumer.

### Phase 4: Collapse duplication

- [ ] **4.1 Extract `removeCommandLine` helper in EditorHandler** — the four `trigger*Command` methods each repeat the same ~15-line compute-range/remove-line/reposition block (`EditorHandler.ts:49-58`, `96-108`, `159-171`, `190-202`). Also drop the unused `commandLineEndPos` computations.
- [ ] **4.2 Deduplicate keydown registration** — `main.ts:61-72` vs `76-86` are the same block written twice. Extract a helper; prefer `this.registerDomEvent(...)` over raw `addEventListener` for automatic cleanup, which simplifies `unregisterScopedKeyDownHandler`.
- [ ] **4.3 Split `moveFileToArchive`** — `FileSystemService.ts:24-177` is three jobs (marker split, LLM title generation + sanitization, move/rename) in one ~150-line method under one catch-all. Extract the LLM title generation (lines 76-147) into its own function so title failures and move failures are distinguishable.

### Phase 5: Design/UX judgment calls (do last; each is optional, discuss if unsure)

- [ ] **5.1 Move notices out of the service layer** — `fetchModels` and `getChatCompletion` show `Notice`s and return `[]`/`null`, destroying error information (e.g. archive failures can only report "Failed to archive note"). Have services throw or return errors; callers decide how to notify.
- [ ] **5.2 New-chat command indirection** — `EditorHandler.ts:175` invokes the plugin's own command via `app.commands.executeCommandById` with `@ts-ignore`, plus a duplicate notice. Extract the note-creation logic in `main.ts` into a shared method both call.
- [ ] **5.3 Relocate `backgroundRefreshIfNeeded`** — currently called mid-`streamChatCompletion` (`OpenRouterService.ts:341`), a model-list side effect buried in the chat path. Move the periodic refresh trigger to plugin `onload` (or drop it — the settings tab already refreshes on open).
- [ ] **5.4 Preserve undo history on archive-with-marker** — `FileSystemService.ts:158` uses `editor.setValue(contentAboveMarker)`, which resets undo history and scroll. Use `editor.replaceRange` to delete just the region from the marker down.

### Repo hygiene

- [ ] **6.1 Gitignore and remove committed junk** — `.aider.chat.history.md`, `.aider.input.history`, `.aider.tags.cache.v4/`, `.DS_Store` files. Review whether `test-vault/` chat archives and the committed `main.js` build artifact should stay in the repo.

## Implementation Notes

- Obsidian API specifics: `Editor` positions are `{line, ch}` and do not track document edits; `requestUrl` bypasses CORS but cannot stream (hence raw `fetch` for streaming — keep it); `vault.getAbstractFileByPath` is synchronous; `Plugin.registerDomEvent` auto-removes listeners on unload.
- `CHAT_SEPARATOR` is `<hr message-from="chat">` and `CHAT_BOUNDARY_MARKER` is `^^^` (both in `constants.ts`).
- Build with `npm run build` (esbuild); `npm run dev` watches. There is a `test-vault/` for manual testing — `install.sh` copies the build there.
- No backwards-compatibility constraints: settings-schema changes (e.g. dropping `chatSeparator`) are fine; the sole user can re-save settings.

## Testing

The repo currently has no automated test suite; verification is primarily manual via `test-vault/`. If tests are added for any of this, follow the repo's test-writing guidelines:

Avoid introducing boilerplate tests; we do not want excessive pointless tests as these do not serve anyone.
It's extremely important that the tests are meaningful, clear, and validate core issues and behavior.
It's important to figure out tests that validate our business case, and that ensure healthy core architecture.
They can and should help engineers understand the intention behind the code.

Good candidates for meaningful tests: boundary-marker regex behavior (item 1.3) and note-content parsing, which are pure functions with real edge cases.

## Validation

After each phase: `npm run build` passes with no TypeScript errors, and a manual smoke test in `test-vault/` covers:
1. `cc` on Enter streams a response and appends separators correctly.
2. Escape during a stream cancels it and removes the status message.
3. Changing the API key in settings re-fetches the model list (validates 1.1).
4. With logging disabled, force an error (e.g. bad API key) and confirm it still appears in the console (validates 1.2).
5. Archive a note with and without a `^^^` marker, with LLM titling on and off.
6. `nn` creates a new note in the configured location; `cm` opens the model selector.

Check off items in this plan as they land; strike through any item we decide to skip, with a one-line reason.

## Documentation

- `CHANGELOG.md` is managed by release-please from conventional commits — use `fix:`/`refactor:`/`chore:` prefixes appropriately.
- README only if user-visible behavior changes (none expected except error-logging behavior, which is worth a line).
