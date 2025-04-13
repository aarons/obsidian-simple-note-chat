## Testing & Release Prep

**Goal:** Ensure stability, polish the user experience, and prepare for release.

*   [ ] Thoroughly test all command phrases (`cc`, `gg`, `dd`, `nn`) and edge cases (empty notes, notes without separators, incorrect phrase placement, file conflicts).
*   [ ] Test all settings options individually and in combination (API keys, models, sorting, commands, separator, scrolling, archive options, new chat options, delete options, stop options).
*   [ ] Test stop sequence and stop shortcut key during active streaming.
+ 180 |     *   [ ] *Corner Case:* Test typing stop sequence slowly vs quickly.
*   [ ] Test API error handling (invalid API key, network issues, model errors).
*   [ ] Test file operation errors (permissions, non-existent folders).
+ 182 |     *   [ ] *Corner Case:* Test file conflict handling during archive (`gg`).
*   [ ] Test on different platforms if possible (Desktop Mac/Win/Linux, Mobile - consider limitations like Node/Electron APIs). Check regex compatibility (lookbehind).
+ 183 |     *   [ ] *Refinement:* Specifically test settings UI components for responsiveness and usability on mobile devices.
*   [ ] Review code for clarity, efficiency, and adherence to Obsidian API best practices. Minimize console logging.
*   [ ] Update `README.md` with final usage instructions, settings explanations, and screenshots.
*   [ ] Ensure `test-vault` is up-to-date and useful for testing/contributors.
*   [ ] Prepare for release (update `manifest.json` version, check `versions.json`, build process).
+ 187 | *   [ ] *Performance:* Test `cc` command with very long notes to check parsing performance (non-blocking for MVP, but good to know).
+ 188 | *   [ ] *Validation:* Test `cc`, `gg`, `dd`, `nn` detection logic against the specific incorrect examples provided in `README.md`.

## Validation Milestone

**Evaluate Overall Implementation**

*   [x] **Item 1: Evaluate Implementation**
    *   Take a look at the implementation as a whole:
        *   [ ] Are modules named appropriately (e.g., `ChatService`, `EditorHandler`, `FileSystemService`, `OpenRouterService`, `SettingsTab`)?
        *   [ ] Is any code architected poorly or located in the wrong domain/namespace (e.g., should `EditorHandler` logic be closer to `main.ts` or specific commands)?
        *   [ ] Are there any general code smells (e.g., overly complex methods, large classes, magic strings/numbers in `constants.ts`)?
    *   *Important Context:* `./README.md`, `./src/`
    *   *Goal:* Make recommendations for any important changes needed for clarity, maintainability, or correctness.

*   [x] **Item 2: Select Implementation Tasks**
    *   Review the recommendations from Item 1.
    *   Which changes are appropriate and important given the scope of this plugin (a focused chat tool, not a general AI framework)?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

**Obsidian Specific Validation**

*   [x] **Item 1: Evaluate Obsidian API Usage**
    *   Review the codebase's interaction with the Obsidian API:
        *   [ ] Are we using the correct/most efficient API methods based on `obsidian.d.ts` (e.g., for editor manipulation, file system access, settings)?
        *   [ ] Does the implementation adhere to the guidelines in `obsidian-guidelines.md`?
        *   [ ] Is there anything implemented manually (e.g., file operations in `FileSystemService`) that could be delegated to or simplified by using Obsidian's built-in API functions?
    *   *Important Context:* `documentation/obsidian.d.ts`, `documentation/obsidian-guidelines.md`, `./src/`
    *   *Goal:* Make recommendations for aligning better with Obsidian best practices and leveraging the API effectively.

*   [x] **Item 2: Select Obsidian API Tasks**
    *   Review the recommendations from Item 1.
    *   Which changes are appropriate and important for stability, performance, or future compatibility within the Obsidian ecosystem?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

**Variable Naming (`nn`, `cc`, `gg`, `dd`)**

*   [x] **Item 1: Evaluate Variable Names**
    *   Consider the command variables/constants (`nn`, `cc`, `gg`, `dd`):
        *   [ ] Are these names clear enough, or do they hinder readability?
        *   [ ] Should they be replaced with more descriptive names like `CMD_NEW_NOTE`, `CMD_CHAT_CONTINUE`, `CMD_ARCHIVE_NOTE`, `CMD_DELETE_NOTE`?
        *   [ ] Or perhaps shorter, but still clearer, names like `CMD_NEW`, `CMD_CHAT`, `CMD_ARCHIVE`, `CMD_DELETE`?
        *   [ ] Where are these defined and used? Are they consistent?
    *   *Important Context:* `./src/constants.ts`, `./src/main.ts`, `./src/EditorHandler.ts`, `./README.md`
    *   *Goal:* Recommend a consistent and clear naming convention for these commands.

*   [x] **Item 2: Select Variable Naming Tasks**
    *   Review the recommendations from Item 1.
    *   Is changing these names a worthwhile improvement for maintainability, considering the effort involved?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with the selected naming convention task, if any.

**Specification Adherence (README)**

*   [x] **Item 1: Evaluate README Alignment**
    *   Compare the current implementation against the specifications and features described in `README.md`:
        *   [ ] Does the implemented behavior for `cc`, `gg`, `dd`, `nn` match the README descriptions exactly?
        *   [ ] Are all settings options mentioned in the README implemented and functioning as described?
        *   [ ] Does the error handling behavior match what's implied or stated?
        *   [ ] Are there any corner cases described in the README that are not handled, or any implemented behaviors not documented?
    *   *Important Context:* `./README.md`, `./src/`
    *   *Goal:* Identify discrepancies and recommend updates to either the code or the README.

*   [x] **Item 2: Select README Alignment Tasks**
    *   Review the recommendations from Item 1.
    *   Which discrepancies are most critical to fix for user understanding and correct functionality?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks (code changes or README updates).

**OpenRouterService Standards**

*   [x] **Item 1: Evaluate OpenRouterService Implementation**
    *   Review `src/OpenRouterService.ts` against the OpenRouter API documentation:
        *   [ ] Does the implementation correctly handle API requests (completions, streaming) as per `openrouter-api-completions.md` and `openrouter-api-streaming.md`?
        *   [ ] Does it follow error handling best practices described or implied in the documentation?
        *   [ ] Is prompt caching (`openrouter-prompt-caching.md`) relevant or implemented correctly if used?
        *   [ ] Are there any deviations from the general guidelines in `openrouter.md`?
    *   *Important Context:* `src/OpenRouterService.ts`, `documentation/openrouter-api-completions.md`, `documentation/openrouter-api-streaming.md`, `documentation/openrouter-prompt-caching.md`, `documentation/openrouter.md`
    *   *Goal:* Recommend changes to ensure compliance and robustness when interacting with the OpenRouter API.

*   [x] **Item 2: Select OpenRouterService Tasks**
    *   Review the recommendations from Item 1.
    *   Which changes are most important for reliable API interaction and error handling?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

**Model Name Sorting/Formatting**

*   [x] **Item 1: Evaluate Model Name Handling**
    *   Review how model names are fetched, sorted, and formatted in `src/OpenRouterService.ts` and potentially `src/SettingsTab.ts`:
        *   [ ] Does the sorting logic match the intended behavior defined in `documentation/openRouterService.ts` (e.g., sorting by name, provider, context length)?
        *   [ ] Does the formatting of model names (e.g., including provider) match the definitions or examples in `documentation/openRouterService.ts`?
        *   [ ] Is the list fetched and processed efficiently?
    *   *Important Context:* `src/OpenRouterService.ts`, `src/SettingsTab.ts`, `documentation/openRouterService.ts`
    *   *Goal:* Recommend changes to ensure model names are handled consistently and correctly according to the definitions.

*   [x] **Item 2: Select Model Name Tasks**
    *   Review the recommendations from Item 1.
    *   Are any deviations significant enough to warrant correction for user experience or correctness?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

## Follow-up Development Tasks

### Implementation & Code Quality
- [ ] **Refactor Large Methods:** Break down `EditorHandler.handleEditorChange`, `FileSystemService.moveFileToArchive`, and `SettingsTab.display` into smaller, more manageable helper methods to improve readability and maintainability.
- [ ] **Centralize Constants:** Identify and move all magic strings and numbers (e.g., status messages, UI text, thresholds) currently hardcoded in the codebase to the central `src/constants.ts` file.
- [ ] **Remove Debug Logging / Code Cleanup:** Remove all temporary `console.log`, `console.error`, etc., statements from the production codebase.
- [ ] **Standardize Error Handling:** Refactor services (`ChatService`, `FileSystemService`, `OpenRouterService`) to return error objects or status indicators instead of directly calling `new Notice()`. Update calling code (e.g., `EditorHandler`, `main.ts`) to handle these return values and display user notifications consistently.
- [ ] **Address `@ts-ignore` Directives:** Investigate each use of `@ts-ignore`, particularly the one related to `app.commands.executeCommandById` in `EditorHandler.ts`. Resolve the underlying type issues or document the reason for the suppression if unavoidable.
- [ ] **Simplify `DEFAULT_SETTINGS` Initialization:** Modify `src/types.ts` to initialize `DEFAULT_SETTINGS.COMMAND_PHRASES` and `DEFAULT_SETTINGS.COMMAND_SEPARATOR` directly using values from `src/constants.ts`, removing the need for separate initialization logic in `main.ts` or elsewhere.
- [ ] **Remove Unused Parameter:** Delete the unused `_noteContent` parameter from the `ChatService.startChat` method signature and any corresponding arguments passed in calls to this method.

### Obsidian API & Settings UI
- [ ] **API Usage:** Replace `app.vault.adapter.exists()` with `app.vault.getAbstractFileByPath() !== null` in `src/FileSystemService.ts` for file/folder existence checks (Ref: Obsidian API best practices).
- [ ] **Settings UI:** Refactor `src/SettingsTab.ts` to use `new Setting(...).setHeading()` for section headings instead of manual `h3` elements (Ref: Obsidian Settings UI guidelines).

### README Documentation Alignment
- [ ] **README:** Clarify command phrase behavior (`gg`/`dd` remain, `nn` removed).
- [ ] **README:** Add mention of the deletion confirmation prompt for the `dd` command.
- [ ] **README:** Detail filename conflict handling and title sanitization for the `gg` command.
- [ ] **README:** Specify that "Calling..." status lines are ignored by the `cc` command.
- [ ] **README:** Describe stop sequence behavior (sequence removal, "[Response Interrupted]" appended).
- [ ] **README:** Remove mention of the non-existent "Stop Shortcut Key" setting.
- [ ] **README:** Add documentation for the implemented "Sort Model Lists By" setting.
- [ ] **README:** Clarify that the new note title format (`nn`) uses a default and is not customizable via settings, unlike the archive title format (`gg`).

### OpenRouter Service
- [ ] **Implement Identification Headers in OpenRouterService:** Add `HTTP-Referer` and `X-Title` headers to API requests in `OpenRouterService.ts` as per OpenRouter guidelines.
- [ ] **Improve Error Handling Consistency in OpenRouterService:** Modify `getChatCompletion` and `fetchModels` in `OpenRouterService.ts` to throw errors on failure instead of returning potentially ambiguous values (e.g., null, undefined).
- [ ] **Implement Model List Caching:** Add caching for the model list fetched by `OpenRouterService` to reduce API calls, using plugin settings for persistence. (See `src/OpenRouterService.ts`)
- [ ] **Align Model Sorting Logic:** Correct the model sorting in `OpenRouterService.sortModels` to match the documentation (alphabetical by ID, handle `openrouter/auto`, clarify/implement provider/context length sorting if needed). Update the `SettingsTab.ts` dropdown accordingly. (See `src/OpenRouterService.ts`, `src/SettingsTab.ts`, `documentation/openRouterService.ts`)
- [ ] **Align Model Name Formatting:** Update `SettingsTab.ts` (`populateModelDropdown`) to format model display names as `ID | price in | price out` as specified in the documentation. Consider centralizing formatting logic in `OpenRouterService.ts`. (See `src/SettingsTab.ts`, `documentation/openRouterService.ts`)
