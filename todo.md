
- [ ] manual eval and fixes
- [ ]

## Follow-up Development Tasks (Kanban Style)

---

### Task: Refactor Large Methods
- **Status:** `[ ]` To Do
- **User Context:** Improves long-term stability and makes it easier to add features without introducing bugs by making the code easier to understand and modify correctly.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Implementation (Item 1).
    - *Finding:* Methods `EditorHandler.handleEditorChange`, `FileSystemService.moveFileToArchive`, and `SettingsTab.display` are overly complex and handle too many responsibilities.
    - *Goal:* Reduce cognitive load, improve readability, and enhance testability.
- **Implementation Approach:**
    - Break down the specified methods into smaller, single-responsibility private helper functions within their respective files:
        - `src/EditorHandler.ts`
        - `src/FileSystemService.ts`
        - `src/SettingsTab.ts`

---

### Task: Centralize Constants
- **Status:** `[ ]` To Do
- **User Context:** Ensures consistent UI text (like status messages) and behavior across the plugin, leading to a more predictable user experience.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Implementation (Item 1).
    - *Finding:* Magic strings (e.g., `"Processing..."`) and numbers (e.g., `1000`) are scattered throughout the codebase.
    - *Goal:* Improve maintainability, reduce errors from typos, and make future text/behavior updates easier by centralizing definitions. Reference `src/constants.ts`.
- **Implementation Approach:**
    - Identify hardcoded strings and numbers (especially status messages, UI text, thresholds) in `src/*.ts` files.
    - Define corresponding constants in `src/constants.ts`.
    - Replace the original hardcoded values with references to the new constants.

---

### Task: Remove Debug Logging
- **Status:** `[ ]` To Do
- **User Context:** Prevents cluttering the Obsidian developer console for end-users, providing a cleaner experience especially when users need to debug other issues.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Implementation (Item 1), Evaluate Obsidian API Usage (Item 1).
    - *Finding:* Excessive `console.log`, `console.info`, etc., statements remain from development.
    - *Goal:* Improve code cleanliness and production readiness. Keep only essential error/warning logs.
- **Implementation Approach:**
    - Search for and remove all non-essential `console.*` statements (e.g., `console.log`, `console.info`, `console.debug`) across all `src/*.ts` files.
    - Retain necessary `console.warn` or `console.error` calls for significant issues.

---

### Task: Standardize Error Handling & Notifications
- **Status:** `[ ]` To Do
- **User Context:** Provides consistent, clear, and user-friendly feedback when errors occur (e.g., invalid API key, network issues), rather than potentially silent failures or inconsistent messages.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Implementation (Item 1).
    - *Finding:* Services (`ChatService`, `FileSystemService`, `OpenRouterService`) inconsistently handle errors, sometimes calling `new Notice()` directly, hindering centralized notification logic.
    - *Goal:* Improve separation of concerns (services handle logic, callers handle UI), enhance testability, and allow for consistent user notification strategy.
- **Implementation Approach:**
    - Refactor methods within `src/ChatService.ts`, `src/FileSystemService.ts`, `src/OpenRouterService.ts` that currently call `new Notice()` upon failure.
    - Modify these methods to return specific error objects, status indicators, or throw custom errors instead.
    - Update the calling code (primarily in `src/EditorHandler.ts`, `src/main.ts`) to check return values or use try/catch blocks.
    - Implement consistent `new Notice()` calls within the *calling* code based on the errors/status received from the services.

---

### Task: Resolve `@ts-ignore` Directives
- **Status:** `[ ]` To Do
- **User Context:** Improves the underlying code reliability and reduces the chance of unexpected runtime errors related to type mismatches.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Implementation (Item 1).
    - *Finding:* `@ts-ignore` comments are used, suppressing potentially important TypeScript type checks, notably around `app.commands.executeCommandById`.
    - *Goal:* Enhance type safety and code robustness by addressing the reasons for type errors.
- **Implementation Approach:**
    - Locate each `@ts-ignore` comment in `src/*.ts` files.
    - Investigate the underlying TypeScript error.
    - Attempt to resolve the error by adjusting types, code logic, or using type assertions if appropriate and safe.
    - Pay special attention to the usage near `app.commands.executeCommandById` in `src/EditorHandler.ts`.
    - If a `@ts-ignore` is truly unavoidable (e.g., due to limitations in Obsidian's declared types), add a comment immediately following it explaining *why* it's necessary.

---

### Task: Simplify `DEFAULT_SETTINGS` Initialization
- **Status:** `[ ]` To Do
- **User Context:** Minor internal improvement with no direct user impact, but contributes to overall code health and maintainability.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Implementation (Item 1).
    - *Finding:* Default command phrases and separator could be initialized more directly using constants.
    - *Goal:* Reduce redundancy and centralize default value definitions.
- **Implementation Approach:**
    - Modify the `DEFAULT_SETTINGS` object definition in `src/types.ts`.
    - Import necessary default value constants (e.g., `CC_COMMAND_DEFAULT`) from `src/constants.ts`.
    - Initialize the `COMMAND_PHRASES` and `COMMAND_SEPARATOR` properties directly within the `DEFAULT_SETTINGS` object using these imported constants.
    - Remove any separate logic elsewhere (e.g., potentially in `main.ts loadSettings`) that was previously assigning these defaults.

---

### Task: Remove Unused `_noteContent` Parameter
- **Status:** `[ ]` To Do
- **User Context:** Minor internal code cleanup, no direct user impact.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Implementation (Item 1).
    - *Finding:* The `_noteContent` parameter in the `ChatService.startChat` method is unused.
    - *Goal:* Improve code clarity and remove dead code.
- **Implementation Approach:**
    - Delete the `_noteContent` parameter from the `ChatService.startChat` method signature in `src/ChatService.ts`.
    - Find all places where `ChatService.startChat` is called and remove the corresponding argument being passed for `_noteContent`.

---

### Task: Use `getAbstractFileByPath` for Existence Checks
- **Status:** `[ ]` To Do
- **User Context:** Ensures the plugin uses Obsidian API methods according to best practices, potentially improving performance slightly and ensuring future compatibility.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Obsidian API Usage (Item 1).
    - *Finding:* `src/FileSystemService.ts` uses `app.vault.adapter.exists()` for checking file/folder existence.
    - *Goal:* Align with Obsidian API guidelines which recommend using `app.vault.getAbstractFileByPath()` for potentially better performance (caching) and consistency. Reference `documentation/obsidian-guidelines.md`.
- **Implementation Approach:**
    - In `src/FileSystemService.ts`, locate uses of `await this.app.vault.adapter.exists(path)`.
    - Replace them with checks like `this.app.vault.getAbstractFileByPath(path) !== null`.

---

### Task: Refactor Settings UI Headings
- **Status:** `[ ]` To Do
- **User Context:** Ensures the plugin's settings page has a consistent look and feel compared to other Obsidian plugins and core settings, improving usability.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Obsidian API Usage (Item 1).
    - *Finding:* `src/SettingsTab.ts` uses manually created `<h2>` and `<h3>` elements for the main title and section headings.
    - *Goal:* Adhere to Obsidian Settings UI guidelines by using the standard `Setting` component for headings. Reference `documentation/obsidian-settings.md`, `documentation/obsidian-guidelines.md`.
- **Implementation Approach:**
    - In `src/SettingsTab.ts` (`display` method):
        - Remove the line creating the top-level `<h2>`.
        - Replace instances like `containerEl.createEl('h3', { text: '...' });` with `new Setting(containerEl).setName('...').setHeading();`.

---

### Task: README: Clarify Command Phrase Removal
- **Status:** `[ ]` To Do
- **User Context:** Users need clear documentation on whether the command phrases (`gg`, `dd`, `nn`) they type will remain in the note after the command executes, affecting subsequent actions.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` is unclear on this behavior. Implementation: `gg`/`dd` remain, `nn` is removed.
    - *Goal:* Ensure documentation accurately reflects implementation.
- **Implementation Approach:**
    - Edit `README.md`.
    - In the descriptions for the `gg`, `dd`, and `nn` commands, explicitly state whether the command phrase text remains in the editor or is removed after successful execution.

---

### Task: README: Document `dd` Confirmation Prompt
- **Status:** `[ ]` To Do
- **User Context:** Users should be aware that deleting a note via the `dd` command requires an explicit confirmation step, preventing accidental data loss.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` omits mention of the implemented confirmation prompt for deletion.
    - *Goal:* Ensure documentation covers all significant user interaction steps.
- **Implementation Approach:**
    - Edit `README.md`.
    - Add a sentence to the `dd` command description mentioning that a confirmation prompt will appear before the note is deleted.

---

### Task: README: Document `gg` Archive Details
- **Status:** `[ ]` To Do
- **User Context:** Users need to understand how archived note filenames are generated, especially how conflicts are handled (appending numbers) and that titles suggested by the LLM might be sanitized for filesystem compatibility.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` omits implemented details about filename conflict handling and title sanitization during archiving (`gg`).
    - *Goal:* Provide complete documentation on the archiving process.
- **Implementation Approach:**
    - Edit `README.md`.
    - Update the `gg` command description to include details on:
        - How filename conflicts are resolved (e.g., appending `-1`, `-2`).
        - That generated titles are sanitized (e.g., removing characters invalid in filenames).

---

### Task: README: Document `cc` Status Line Ignoring
- **Status:** `[ ]` To Do
- **User Context:** Users should know that the "Calling..." status lines added by the plugin during processing won't be included in the conversation history sent to the LLM for subsequent `cc` commands.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` omits documenting that "Calling..." status lines are ignored during context parsing for `cc`.
    - *Goal:* Accurately describe the context parsing behavior.
- **Implementation Approach:**
    - Edit `README.md`.
    - Add a note to the `cc` command description explaining that status lines like "Calling..." are automatically excluded from the context sent to the language model.

---

### Task: README: Document Stop Sequence Behavior
- **Status:** `[ ]` To Do
- **User Context:** Users need to understand the visual feedback when they successfully use the stop sequence – the sequence itself disappears and is replaced by an interruption marker.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` omits documenting the implemented behavior (sequence removal, appending "[Response Interrupted]").
    - *Goal:* Clearly document the user experience of interrupting a response.
- **Implementation Approach:**
    - Edit `README.md`.
    - Update the description of the "Stop Sequence" feature to explain that when the sequence is typed during streaming, the sequence itself is removed from the note, and "[Response Interrupted]" is appended to the partial response.

---

### Task: README: Remove Mention of Stop Shortcut Key Setting
- **Status:** `[ ]` To Do
- **User Context:** Avoids user confusion by removing documentation for a feature (customizing the stop shortcut key) that doesn't actually exist in the settings.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` incorrectly mentions a setting for a "Stop Shortcut Key" which is not implemented.
    - *Goal:* Ensure documentation accurately reflects available settings.
- **Implementation Approach:**
    - Edit `README.md`.
    - Search for and remove any mention of a setting to customize the "Stop Shortcut Key". (Note: The *default* shortcut key should still be documented if it exists).

---

### Task: README: Document Model Sorting Setting
- **Status:** `[ ]` To Do
- **User Context:** Informs users about the available setting to control the sort order of the language model list in the settings dropdown, allowing them to find models more easily.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` omits documentation for the implemented "Sort Model Lists By" setting.
    - *Goal:* Ensure all implemented settings are documented.
- **Implementation Approach:**
    - Edit `README.md`.
    - Add documentation for the "Sort Model Lists By" setting within the "Settings" section, explaining the available sorting options.

---

### Task: README: Clarify `nn` Title Format Customization
- **Status:** `[ ]` To Do
- **User Context:** Prevents users from incorrectly expecting to customize the title format for *new* notes (`nn`) via settings, clarifying that customization only applies to *archived* notes (`gg`).
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate README Alignment (Item 1).
    - *Finding:* `README.md` might imply customization for `nn` titles, but only `gg` titles are customizable; `nn` uses a hardcoded default format.
    - *Goal:* Set accurate user expectations regarding title customization.
- **Implementation Approach:**
    - Edit `README.md`.
    - Review the sections describing the `nn` command and title format settings.
    - Explicitly state that the title format for notes created with `nn` uses a fixed default format and is *not* affected by the title format settings (which apply only to `gg`).

---

### Task: Add Identification Headers to OpenRouter API Calls
- **Status:** `[ ]` To Do
- **User Context:** No direct impact, but helps the OpenRouter service identify traffic from this plugin, potentially aiding their monitoring, analytics, and support if issues arise specific to this plugin.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate OpenRouterService Implementation (Item 1).
    - *Finding:* Optional but recommended identification headers (`HTTP-Referer`, `X-Title`) are missing from API requests.
    - *Goal:* Improve compliance with OpenRouter guidelines and be a "good citizen" of the API ecosystem. Reference `documentation/openrouter.md`.
- **Implementation Approach:**
    - In `src/OpenRouterService.ts`, modify the `fetch` calls within `streamChatCompletion` and `getChatCompletion`.
    - Add the following headers to the `headers` object:
        - `'HTTP-Referer': 'YOUR_PLUGIN_REPO_OR_WEBSITE_URL'` (Replace with actual URL)
        - `'X-Title': 'Obsidian Simple Chat'` (Or the final plugin name)

---

### Task: Standardize Error Throwing in OpenRouterService
- **Status:** `[ ]` To Do
- **User Context:** Contributes to more robust and predictable error handling within the plugin, leading to more consistent feedback when API calls fail.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate OpenRouterService Implementation (Item 1), Select OpenRouterService Tasks (Item 2).
    - *Finding:* Error handling is inconsistent; `getChatCompletion` and `fetchModels` return null/undefined on failure, while `streamChatCompletion` throws errors.
    - *Goal:* Make error handling uniform by having failing API service methods throw errors, simplifying upstream error management.
- **Implementation Approach:**
    - In `src/OpenRouterService.ts`:
        - Modify `getChatCompletion` to `throw new Error(...)` when `response.ok` is false or a network error occurs, instead of returning `undefined`.
        - Modify `fetchModels` to `throw new Error(...)` when the fetch fails or returns a non-OK status, instead of returning `null`.
    - Review code calling these methods (e.g., in `SettingsTab.ts`, `ChatService.ts`) and ensure they use `try...catch` blocks to handle potential errors thrown by these functions.

---

### Task: Implement OpenRouter Model List Caching
- **Status:** `[ ]` To Do
- **User Context:** Significantly improves the performance and responsiveness of the settings tab when opening it, as the list of available models doesn't need to be fetched from the internet every time. Reduces unnecessary API calls.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Model Name Handling (Item 1).
    - *Finding:* The model list is fetched via API every time the settings tab is opened, which is inefficient and wasn't aligned with documentation examples.
    - *Goal:* Improve performance and reduce API load by caching the model list locally. Reference `documentation/openRouterService.ts` for caching ideas.
- **Implementation Approach:**
    - **1. Update Settings:** Add fields to `PluginSettings` in `src/types.ts` for storing the cached model list and a timestamp, e.g., `modelListCache?: OpenRouterModel[]; modelListCacheTimestamp?: number;`.
    - **2. Modify Fetching Logic:** In `src/OpenRouterService.ts`, refactor `fetchModels` (or create a wrapper function like `getCachedModels`):
        - Check `this.settings.modelListCache` and `this.settings.modelListCacheTimestamp`.
        - If cache exists and is recent (e.g., less than 24 hours old: `Date.now() - timestamp < CACHE_DURATION`), return the cached list.
        - Otherwise, call the original API fetching logic.
        - On successful fetch, update `this.settings.modelListCache` and `this.settings.modelListCacheTimestamp` with the new data and current time.
        - Ensure `saveSettings()` is called after updating the cache.
    - **3. Update Settings Tab:** Modify `src/SettingsTab.ts` (`display` method) to call the new cached fetching logic instead of directly calling the raw `fetchModels`. Consider adding a manual refresh button in settings to clear the cache and force a refetch.

---

### Task: Align OpenRouter Model Sorting Logic
- **Status:** `[ ]` To Do
- **User Context:** Ensures the "Sort Model Lists By" setting works correctly and consistently according to user expectations, allowing them to organize the potentially long list of models effectively.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Model Name Handling (Item 1).
    - *Finding:* Implemented sorting logic in `OpenRouterService.sortModels` differs from documentation criteria (sorting by ID vs. name, price handling, `openrouter/auto` placement). Provider/context length sorting mentioned in `todo.md` wasn't implemented.
    - *Goal:* Implement sorting correctly as defined in documentation and required by settings. Reference `documentation/openRouterService.ts`.
- **Implementation Approach:**
    - **1. Refactor `sortModels`:** In `src/OpenRouterService.ts`:
        - Modify the `sortModels` function to accept the sort criteria (e.g., 'alphabetical', 'price_prompt', 'price_completion').
        - Implement sorting logic based on `model.id` for alphabetical.
        - Implement sorting based on `model.pricing.prompt` and `model.pricing.completion` for price sorts. Use `model.id` as a secondary sort key for ties.
        - Ensure `openrouter/auto` (if present) is handled specially (e.g., always sorted first).
        - Decide if provider/context length sorting is still needed. If so, add logic using `model.id` (splitting by '/') for provider and `model.context_length` for context.
    - **2. Update Settings Tab:** In `src/SettingsTab.ts`:
        - Update the dropdown options for "Sort Model Lists By" to match the implemented criteria in `sortModels`.
        - Ensure the correct sort criterion is passed to `sortModels` when populating the dropdown.

---

### Task: Align OpenRouter Model Name Formatting in Settings
- **Status:** `[ ]` To Do
- **User Context:** Provides users with useful context (like model ID and pricing) directly in the model selection dropdown menu within settings, helping them choose the most appropriate and cost-effective model.
- **Developer Context:**
    - *Origin:* Validation Milestone - Evaluate Model Name Handling (Item 1).
    - *Finding:* The display format of models in the settings dropdown (`SettingsTab.ts`) currently shows only name or ID, differing from the documentation's richer `ID | price in | price out` format.
    - *Goal:* Enhance the user experience in settings by providing more informative model labels. Reference `documentation/openRouterService.ts`.
- **Implementation Approach:**
    - **1. (Optional) Formatting Helper:** Consider creating a helper function in `src/OpenRouterService.ts`, e.g., `formatModelForDisplay(model: OpenRouterModel): string`. This function would take a model object and return a string like `"openai/gpt-4 | $0.03 | $0.06"`. It should handle formatting the prices (e.g., per 1M tokens).
    - **2. Update Settings Tab:** In `src/SettingsTab.ts`, modify the `populateModelDropdown` function.
        - Inside the loop that adds options to the dropdown (`modelDropdown.addOption(...)`), call the new formatting helper (or implement the formatting logic directly) to generate the display text for each model.
        - Use the model's `id` as the option *value* and the formatted string as the option *text* displayed to the user.
