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

*   [ ] **Item 1: Evaluate Implementation**
    *   Take a look at the implementation as a whole:
        *   [ ] Are modules named appropriately (e.g., `ChatService`, `EditorHandler`, `FileSystemService`, `OpenRouterService`, `SettingsTab`)?
        *   [ ] Is any code architected poorly or located in the wrong domain/namespace (e.g., should `EditorHandler` logic be closer to `main.ts` or specific commands)?
        *   [ ] Are there any general code smells (e.g., overly complex methods, large classes, magic strings/numbers in `constants.ts`)?
    *   *Important Context:* `./README.md`, `./src/`
    *   *Goal:* Make recommendations for any important changes needed for clarity, maintainability, or correctness.

*   [ ] **Item 2: Select Implementation Tasks**
    *   Review the recommendations from Item 1.
    *   Which changes are appropriate and important given the scope of this plugin (a focused chat tool, not a general AI framework)?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

**Obsidian Specific Validation**

*   [ ] **Item 1: Evaluate Obsidian API Usage**
    *   Review the codebase's interaction with the Obsidian API:
        *   [ ] Are we using the correct/most efficient API methods based on `obsidian.d.ts` (e.g., for editor manipulation, file system access, settings)?
        *   [ ] Does the implementation adhere to the guidelines in `obsidian-guidelines.md`?
        *   [ ] Is there anything implemented manually (e.g., file operations in `FileSystemService`) that could be delegated to or simplified by using Obsidian's built-in API functions?
    *   *Important Context:* `documentation/obsidian.d.ts`, `documentation/obsidian-guidelines.md`, `./src/`
    *   *Goal:* Make recommendations for aligning better with Obsidian best practices and leveraging the API effectively.

*   [ ] **Item 2: Select Obsidian API Tasks**
    *   Review the recommendations from Item 1.
    *   Which changes are appropriate and important for stability, performance, or future compatibility within the Obsidian ecosystem?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

**Variable Naming (`nn`, `cc`, `gg`, `dd`)**

*   [ ] **Item 1: Evaluate Variable Names**
    *   Consider the command variables/constants (`nn`, `cc`, `gg`, `dd`):
        *   [ ] Are these names clear enough, or do they hinder readability?
        *   [ ] Should they be replaced with more descriptive names like `CMD_NEW_NOTE`, `CMD_CHAT_CONTINUE`, `CMD_ARCHIVE_NOTE`, `CMD_DELETE_NOTE`?
        *   [ ] Or perhaps shorter, but still clearer, names like `CMD_NEW`, `CMD_CHAT`, `CMD_ARCHIVE`, `CMD_DELETE`?
        *   [ ] Where are these defined and used? Are they consistent?
    *   *Important Context:* `./src/constants.ts`, `./src/main.ts`, `./src/EditorHandler.ts`, `./README.md`
    *   *Goal:* Recommend a consistent and clear naming convention for these commands.

*   [ ] **Item 2: Select Variable Naming Tasks**
    *   Review the recommendations from Item 1.
    *   Is changing these names a worthwhile improvement for maintainability, considering the effort involved?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with the selected naming convention task, if any.

**Specification Adherence (README)**

*   [ ] **Item 1: Evaluate README Alignment**
    *   Compare the current implementation against the specifications and features described in `README.md`:
        *   [ ] Does the implemented behavior for `cc`, `gg`, `dd`, `nn` match the README descriptions exactly?
        *   [ ] Are all settings options mentioned in the README implemented and functioning as described?
        *   [ ] Does the error handling behavior match what's implied or stated?
        *   [ ] Are there any corner cases described in the README that are not handled, or any implemented behaviors not documented?
    *   *Important Context:* `./README.md`, `./src/`
    *   *Goal:* Identify discrepancies and recommend updates to either the code or the README.

*   [ ] **Item 2: Select README Alignment Tasks**
    *   Review the recommendations from Item 1.
    *   Which discrepancies are most critical to fix for user understanding and correct functionality?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks (code changes or README updates).

**OpenRouterService Standards**

*   [ ] **Item 1: Evaluate OpenRouterService Implementation**
    *   Review `src/OpenRouterService.ts` against the OpenRouter API documentation:
        *   [ ] Does the implementation correctly handle API requests (completions, streaming) as per `openrouter-api-completions.md` and `openrouter-api-streaming.md`?
        *   [ ] Does it follow error handling best practices described or implied in the documentation?
        *   [ ] Is prompt caching (`openrouter-prompt-caching.md`) relevant or implemented correctly if used?
        *   [ ] Are there any deviations from the general guidelines in `openrouter.md`?
    *   *Important Context:* `src/OpenRouterService.ts`, `documentation/openrouter-api-completions.md`, `documentation/openrouter-api-streaming.md`, `documentation/openrouter-prompt-caching.md`, `documentation/openrouter.md`
    *   *Goal:* Recommend changes to ensure compliance and robustness when interacting with the OpenRouter API.

*   [ ] **Item 2: Select OpenRouterService Tasks**
    *   Review the recommendations from Item 1.
    *   Which changes are most important for reliable API interaction and error handling?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

**Model Name Sorting/Formatting**

*   [ ] **Item 1: Evaluate Model Name Handling**
    *   Review how model names are fetched, sorted, and formatted in `src/OpenRouterService.ts` and potentially `src/SettingsTab.ts`:
        *   [ ] Does the sorting logic match the intended behavior defined in `documentation/openRouterService.ts` (e.g., sorting by name, provider, context length)?
        *   [ ] Does the formatting of model names (e.g., including provider) match the definitions or examples in `documentation/openRouterService.ts`?
        *   [ ] Is the list fetched and processed efficiently?
    *   *Important Context:* `src/OpenRouterService.ts`, `src/SettingsTab.ts`, `documentation/openRouterService.ts`
    *   *Goal:* Recommend changes to ensure model names are handled consistently and correctly according to the definitions.

*   [ ] **Item 2: Select Model Name Tasks**
    *   Review the recommendations from Item 1.
    *   Are any deviations significant enough to warrant correction for user experience or correctness?
    *   *Important Context:* `./README.md`
    *   *Goal:* Update the "Follow-up Development Tasks" section below with selected tasks.

## Follow-up Development Tasks

*   [ ] *Placeholder for tasks selected from the Validation Milestone above.*
