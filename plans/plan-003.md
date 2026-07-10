# Main-branch parity: port main's post-fork changes onto review

Bring the `review` branch to feature/chore parity with `main`, so that `review` can replace `main` wholesale. The two branches diverged at commit `68ddef6`; both refactored the same files, making a textual merge impractical (46 conflict hunks across 10 files). Instead, this plan documents every meaningful change `main` received after the fork point, as work items to re-implement on top of `review`'s code. Once all items are done and validated, `main` will be replaced with `review` outright — no merge.

## Context

Simple Note Chat is an Obsidian plugin that turns any note into a chat with an LLM via OpenRouter (see `plans/plan-001.md` for a source-layout guide). The `review` branch contains a higher-quality cleanup/refactor of the codebase plus a new LLM-titling feature, and is the intended future of the repo. `main` meanwhile received two kinds of changes we must not lose:

1. **Changes requested by an official Obsidian maintainers' review** (required for plugin directory compliance): sentence-case UI text, and replacing per-view keydown listeners with a single document-level listener. These are non-negotiable.
2. **Obsidian API corrections and a release** made after the fork.

There is exactly one user of this plugin (the author). No backwards-compatibility constraints; destructive operations on branches/settings are acceptable.

Re-implementation churn is expected and fine: some items below touch code that `review` already refactored differently. Implement the *intent* of each item against review's current code — do not try to apply main's diffs textually.

Where useful, the original main commits to consult (via `git show <sha>`):

| sha | what |
|---|---|
| `56bac9a` | sentence-case UI text (maintainer review) |
| `cb58f85` | single document keydown listener (maintainer review), README title, authorUrl |
| `78d0f3c` | `getFolderByPath` + `minAppVersion` 1.5.7 |
| `9cb219e` | vault API fixes + pass editor to archive command |
| `cd56e43` | synchronous `findAvailablePath` |
| `57f5c1b` | `external-docs/` removed, manifest description (also added CLAUDE.md — not ported) |
| `e72c555` | release-please 1.3.0 release commit |

## Work items

### Phase 1: Release/version parity (mechanical)

The latest release-please version on main is **1.3.0**. Review's files still say 1.2.8. Copy main's values:

- [x] **1.1** `.release-please-manifest.json` → `{ ".": "1.3.0" }`
- [x] **1.2** `manifest.json` → `"version": "1.3.0"`; also `"minAppVersion": "1.5.7"` (required by item 3.1), `"authorUrl": "https://github.com/aarons"`, and main's shorter description: `"Chat with AIs using keywords, which are a mobile friendly way to talk to LLMs without needing keyboard shortcuts."`
- [x] **1.3** `package.json` → `"version": "1.3.0"` (keep review's `vitest` devDependency and `test` script — those are review-only additions, do not lose them)
- [x] **1.4** `CHANGELOG.md` → add the 1.3.0 entry from main (`git show main:CHANGELOG.md`)

### Phase 2: Maintainer-review compliance (required)

- [x] **2.1 Sentence-case UI text** (`56bac9a`) — convert command names, notices, and modal text from Title Case to sentence case per Obsidian style guidelines. Known sites on review: `src/main.ts` command names (`Create New Chat Note`, `Trigger Chat Completion (cc)`, `Archive Current Note`, `Change Chat Model`), `src/ModelSelectorModal.ts` (`Select Default Chat Model` h2, `Default Model` setting, `API Key` in error text), `src/FileSystemService.ts` LLM-title-skipped notices. Sweep for any other Title Case strings review introduced (e.g. in `SettingsTab.ts` and the new llmTitle feature) — main's diff only covers strings that existed at the fork.
- [x] **2.2 Single document-level keydown listener** (`cb58f85`) — review still uses a scoped per-view handler (`registerScopedKeyDownHandler` / `unregisterScopedKeyDownHandler` in `src/main.ts`, wired to `active-leaf-change`, with `activeMarkdownView` / `activeEditorKeyDownTarget` / `boundKeyDownHandler` fields). Replace all of it with one listener registered once in `onload`:
  ```ts
  this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
          this.handleKeyDown(activeView, evt);
      }
  });
  ```
  Delete the fields, both register/unregister methods, and the `active-leaf-change` wiring; `onunload` then only needs to clear the spacebar timeouts (main renamed the helper `cleanupTimeouts`).
- [x] **2.3 README title** — change `# Obsidian - Simple Note Chat` to `# Simple Note Chat` (title format compliance).

### Phase 3: Obsidian API corrections

- [ ] **3.1 `getFolderByPath` for folder-existence checks** (`78d0f3c`) — where the code asks "does this *folder* exist", use `vault.getFolderByPath(path) !== null` instead of `getAbstractFileByPath`. Sites on review: `src/FileSystemService.ts:51` (archive folder) and `src/main.ts` in `createNewChatNote` (target folder). Keep `getAbstractFileByPath` inside `findAvailablePath` — there we need collision detection against ANY item, file or folder. This API needs Obsidian 1.5.7+, hence the `minAppVersion` bump in item 1.2.
- [ ] **3.2 Pass the active editor to the archive command** (`9cb219e`) — `moveFileToArchive` accepts `editor?: Editor` and review's editor path is *better* than the fallback (it preserves undo history via `replaceRange`, plan-001 item 5.4). But the `archive-current-note` command in `src/main.ts` never passes an editor, so palette-triggered archives always take the fallback path. Fix:
  ```ts
  const { activeEditor } = this.app.workspace;
  this.fileSystemService.moveFileToArchive(activeFile, this.settings.archiveFolderName, this.settings, activeEditor?.editor)
  ```
- [ ] **3.3 `vault.modify` in the no-editor archive path** (`9cb219e`) — main replaced `vault.process(file, (_data) => contentAboveMarker)` with `vault.modify(file, contentAboveMarker)` at what is now `src/FileSystemService.ts:102`. Rationale: the callback ignores the file's current data, so `process` (read-modify-write against *current* content) is the wrong tool; `modify` states the intent. Judgment call — verify against the Obsidian API before choosing (see Implementation Notes); either is functionally acceptable, but don't leave the data-ignoring `process` callback as-is.
- [ ] **3.4 Make `findAvailablePath` synchronous** (`cd56e43`) — `vault.getAbstractFileByPath` is synchronous, so the `async`/`await` on `findAvailablePath` (`src/FileSystemService.ts:224`) is noise. Change the signature to return `string`, and drop the `await` at its call sites (`src/FileSystemService.ts:86` and `src/main.ts` in `createNewChatNote`).

### Phase 4: Repo hygiene

- [ ] **4.1 Remove `external-docs/`** (`57f5c1b`) — delete the directory (three static OpenRouter API doc dumps; main removed them as redundant). Note: main's same commit added `CLAUDE.md` — that part is deliberately **not** ported, see "No action needed" below.
- [ ] **4.2 Merge `.gitignore` entries from main** — main anchored the generated-styles ignore as `/styles.css` (with a comment noting the source lives in `src/styles.css`) and added `.claude`. Review added `.DS_Store`. End state should contain all three.

### No action needed (documented so nobody hunts for them)

- Main's `fileManager.trashFile` fix — moot; review deleted `deleteFile` entirely in its cleanup.
- Main's comment-cleanup commits (`b261284`, `88d3f87`) — superseded by review's own phase 3/4 refactors.
- **Main's `CLAUDE.md` is deliberately not ported.** CLAUDE.md usage has been de-emphasized by Anthropic, its guidelines were written for less capable models, and it leans on the context7 MCP server, which is no longer available in the form the file describes. Do not copy it over or recreate it; its useful content (commands, architecture) is superseded by `plans/plan-001.md` and the repo itself.

## Implementation Notes

- Work happens on the `review` branch (or a branch off it). Do **not** merge or cherry-pick from main — re-implement against review's current code.
- Build with `npm run build` (runs `tsc -noEmit` then esbuild); `npm run test` runs vitest. `install.sh` + `test-vault/` for manual testing with hot-reload.
- Verify Obsidian API assumptions against the type definitions in `node_modules/obsidian/obsidian.d.ts` (doc comments included) or https://docs.obsidian.md, especially for items 3.1 and 3.3. The context7 MCP server previously used for this is no longer available.
- `Plugin.registerDomEvent` auto-removes listeners on unload — no manual cleanup needed for item 2.2.

## Testing

Most items are refactors of untested-by-design UI/plumbing code; manual validation in `test-vault/` is the primary check. If any item warrants a test (3.4's collision loop is a candidate now that vitest exists):

Avoid introducing boilerplate tests; we do not want excessive pointless tests as these do not serve anyone.
It's extremely important that the tests are meaningful, clear, and validate core issues and behavior.
It's important to figure out tests that validate our business case, and that ensure healthy core architecture.
They can and should help engineers understand the intention behind the code.

## Validation

- [ ] `npm run build` passes (TypeScript + esbuild)
- [ ] `npm run test` passes
- [ ] Manual pass in `test-vault/`: `cc` chat streaming, Escape cancel, `gg` archive (both with and without a `^^^` marker, via phrase and via command palette — the palette path exercises item 3.2), `nn` new note, `cm` model selector
- [ ] Command palette shows sentence-case names; keydown commands still trigger after switching between panes/notes (exercises item 2.2)
- [ ] `grep -ri "external-docs" .` returns nothing; version strings all read 1.3.0
- [ ] Final comparison: `git diff main review -- src/` reviewed once more to confirm nothing meaningful from main remains unported

### Endgame (after all items validated)

Replace main with review wholesale — e.g. `git checkout main && git reset --hard review && git push --force-with-lease origin main`. Destructive to main's history is acceptable (sole user). Release-please will resume from the 1.3.0 manifest state ported in Phase 1.

## Documentation

- `CHANGELOG.md` (item 1.4) — 1.3.0 entry ported
- `README.md` (item 2.3) — title only
