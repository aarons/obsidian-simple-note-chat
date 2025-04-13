# Simple Note Chat - Obsidian Plugin Implementation Plan (MVP Milestones)

This document outlines the steps required to build the Simple Note Chat plugin for Obsidian, reorganized into chronological MVP milestones.

## Architecture Overview (Remains Largely Unchanged)

The plugin will follow a modular structure:

*   **`main.ts`**: Entry point, handles loading/unloading, registering commands, settings tabs, event listeners.
*   **`SettingsTab.ts`**: Manages the plugin's settings UI. Saves/loads settings using Obsidian's data storage.
*   **`EditorHandler.ts`**: Listens for editor changes, detects command phrases (`cc`, `gg`, `dd`, `nn`) and `stop` sequence. Triggers actions.
*   **`ChatService.ts`**: Logic for interacting with the LLM provider (OpenRouter). Parses notes, makes API calls, handles streaming responses, manages interruption, handles authentication.
*   **`FileSystemService.ts`**: Handles vault filesystem interactions (moving, renaming, deleting, creating notes).
*   **`OpenRouterService.ts`**: (Recommended) Dedicated service for OpenRouter API specifics (fetching/sorting models, formatting requests). Makes adding other providers easier later.
*   **`constants.ts`**: Stores default values.
*   **`types.ts`**: Defines TypeScript interfaces.

---

## Milestone 1: Basic Setup & Core Chat (`cc`)

**Goal:** Establish the basic plugin structure and implement the core chat functionality using the `cc` command with streaming.

*   **Project Setup & Scaffolding:**
    *   [ ] Set up Obsidian plugin dev environment (Node.js, npm/yarn, TypeScript).
    *   [ ] Initialize project using Obsidian sample plugin template.
    *   [ ] Configure `manifest.json` (ID, name, version, author, description, minAppVersion). Rename placeholder names (`MyPlugin` etc.) per guidelines.
    *   [ ] Set up `tsconfig.json` and build scripts (`package.json`).
    *   [ ] Implement basic `main.ts` (onload, onunload). Use `this.app` instead of global `app`.
    *   [ ] Create `constants.ts` with initial defaults (command phrases, separator, API endpoint).
    *   [ ] Create `types.ts` and define basic `PluginSettings` interface (apiKey, defaultModel).
    *   [ ] Implement basic settings loading/saving in `main.ts` using `loadData`/`saveData`.
    *   [ ] Set up `test-vault` directory.
    *   [ ] Add basic development setup instructions to `developer-notes.md` or `CONTRIBUTING.md`.
*   **Essential Settings UI:**
    *   [ ] Create `SettingsTab.ts` extending `PluginSettingTab`. Register it in `main.ts`.
    *   [ ] Add settings UI component for OpenRouter API Key input (`addText`). *Consider security implications; OAuth is preferred long-term, but API key is acceptable for MVP.*
    *   [ ] Add settings UI component for Default Chat Model selection (`addDropdown`).
    *   [ ] Implement `OpenRouterService.ts` (or integrate into `ChatService.ts`).
    *   [ ] Add button in settings to fetch/refresh model list from OpenRouter using `OpenRouterService.ts`. Handle potential API errors.
    *   [ ] Populate the Default Chat Model dropdown with fetched models.
    *   [ ] Ensure API key and selected model are saved correctly.
*   **Core Chat Implementation (`cc`):**
    *   [ ] Implement `ChatService.ts`.
    *   [ ] Add function in `ChatService.ts` to parse active note content based on separator (from `constants.ts` initially), alternating roles. Filter out command phrases.
    *   [ ] Implement API call logic in `ChatService.ts` (using `OpenRouterService.ts` if created):
        *   [ ] Use API key and default model from settings.
        *   [ ] Handle authentication (Bearer token).
        *   [ ] Implement streaming request using `fetch` or `requestUrl`.
    *   [ ] Implement `EditorHandler.ts` to monitor editor changes (e.g., using `editorCallback` or listening to `editor-change` event).
    *   [ ] Add logic in `EditorHandler.ts` to detect `cc` phrase on its own line at the end.
    *   [ ] Implement logic in `EditorHandler.ts` or `main.ts` to:
        *   [ ] Replace `cc` with "Calling {model name}..." status message using `editor.replaceRange`.
        *   [ ] Trigger `ChatService.ts` to start the chat.
    *   [ ] Implement response handling in `ChatService.ts`:
        *   [ ] Receive streamed response chunks.
        *   [ ] Remove the "Calling..." message.
        *   [ ] Append a new separator to the note.
        *   [ ] Append response chunks to the note using `editor.replaceRange` or similar Editor API methods (prefer over `Vault.modify`).
        *   [ ] Append a final separator after the response is complete.
        *   [ ] Add trailing newlines for the user cursor.
    *   [ ] Manage the state of the active stream (e.g., store the request object or a flag in `ChatService.ts`).
    *   [ ] Implement basic API error handling (show messages via `Notice`).
    *   [ ] Ensure resources (event listeners, intervals) are cleaned up in `onunload` using `register...` methods.

---

## Milestone 2: Stop Streaming & Basic File Operations (`gg`, `dd`)

**Goal:** Allow users to interrupt responses and implement basic archive and delete functionality.

*   **Stop Streaming:**
    *   [ ] Add keyboard event listener in `main.ts` or `EditorHandler.ts` for the stop key (default `Escape`). Use `registerDomEvent` or `scope.register`.
    *   [ ] Add logic in `EditorHandler.ts` to detect a stop sequence (default `stop`) typed during streaming.
    *   [ ] When stop is triggered:
        *   [ ] Check if a chat stream is active for the current note (using state from `ChatService.ts`).
        *   [ ] If active, call a method in `ChatService.ts` to cancel the ongoing API request/stream (e.g., `AbortController.abort()`).
        *   [ ] Ensure writing to the note stops cleanly.
        *   [ ] (Optional) Add a "[Response Interrupted]" message.
    *   [ ] Add Settings UI: Stop shortcut key input/selector, Stop typed sequence input.
*   **File System Service:**
    *   [ ] Implement `FileSystemService.ts`.
    *   [ ] Add function to move a file using `Vault.rename`. Use `normalizePath`. Create archive directory if needed using `Vault.createFolder`.
    *   [ ] Add function to delete a file using `Vault.trash` (prefer over `Vault.delete`).
*   **Archive Chat (`gg` - Basic):**
    *   [ ] Add logic in `EditorHandler.ts` to detect the `gg` phrase.
    *   [ ] Add logic to check for chat separators before archiving (fail silently or notify if none found).
    *   [ ] Trigger `FileSystemService.ts` to move the note to the configured archive directory.
    *   [ ] Remove the `gg` text from the note content before saving/moving.
    *   [ ] Add Settings UI: Archive folder path input (`addText`).
*   **Delete Chat (`dd` - Basic):**
    *   [ ] Add Settings UI: Enable delete command checkbox (`addToggle`, default off).
    *   [ ] Add logic in `EditorHandler.ts` to detect the `dd` phrase *only if* enabled.
    *   [ ] Add logic to check for chat separators before deleting (fail silently or notify if none found).
    *   [ ] Trigger `FileSystemService.ts` to delete the note.
    *   [ ] *Defer:* Confirmation prompt, bypass separator check setting.

---

## Milestone 3: New Chat (`nn`) & Archive Refinements (`gg`)

**Goal:** Implement creating new chats and enhance the archive functionality with renaming.

*   **New Chat (`nn`):**
    *   [ ] Add command in `main.ts` for creating a new note. Use `FileManager.getNewFileParent` to determine location.
    *   [ ] Implement command logic:
        *   [ ] Create a new note using `Vault.create`.
        *   [ ] Generate default title (e.g., `YYYY-MM-DD-HH-mm` using `moment`).
        *   [ ] Open the newly created note using `workspace.openLinkText` or leaf methods.
    *   [ ] Add Settings UI: Enable `nn` phrase checkbox, Enable ribbon button checkbox, Enable keyboard shortcut checkbox.
    *   [ ] Add logic in `EditorHandler.ts` to detect the `nn` phrase (if enabled).
    *   [ ] Register ribbon icon in `main.ts` (if enabled) that triggers the command.
    *   [ ] Register keyboard shortcut in `main.ts` (if enabled) that triggers the command.
*   **Archive Previous Note (`nn` option):**
    *   [ ] Add Settings UI: Enable "archive previous note" checkbox for `nn`.
    *   [ ] Modify `nn` command logic: If enabled, trigger the `gg` logic on the *current* note *before* creating the new one.
*   **Archive Renaming (`gg` - Date):**
    *   [ ] Add Settings UI: Enable title renaming checkbox, Title format options (date format string input using `MomentFormatComponent`).
    *   [ ] Modify `gg` logic:
        *   [ ] If renaming enabled, get current date/time (`moment`).
        *   [ ] Format using the setting.
        *   [ ] Construct new path with formatted date/time.
        *   [ ] Use `Vault.rename` (via `FileSystemService.ts`) with the new path.
*   **Archive Renaming (`gg` - LLM Title):**
    *   [ ] Add Settings UI: LLM titling options (enable checkbox, word limit input, emojis checkbox, title model selection dropdown).
    *   [ ] Modify `gg` logic:
        *   [ ] If LLM titling enabled:
            *   [ ] Send note content to `ChatService.ts` (using configured title model).
            *   [ ] Construct prompt asking for a short title (respecting settings).
            *   [ ] Make non-streaming API call.
            *   [ ] Prepend/append generated title to the filename when constructing the new path. Handle potential API errors.

---

## Milestone 4: Settings Polish & Other Features

**Goal:** Implement remaining settings, refine existing features, and add quality-of-life improvements.

*   **Settings UI Completion:**
    *   [ ] Add Settings UI: Customize command phrases (`cc`, `gg`, `dd`, `nn`) inputs.
    *   [ ] Add Settings UI: Customize chat separator input.
    *   [ ] Add Settings UI: Enable/disable viewport scrolling checkbox.
    *   [ ] Add Settings UI: `dd` Bypass separator check checkbox (default off).
    *   [ ] Implement model sorting options in settings (Alphabetical, Price Asc/Desc) based on `openRouterService.ts` example. Use `addDropdown` and call `OpenRouterService.sortModels`. Update dropdown display dynamically.
    *   [ ] Ensure all settings are saved correctly and loaded on startup.
    *   [ ] Add logic to inform the user if a plugin reload is needed for certain setting changes (e.g., command phrases). Use `Notice`.
*   **Feature Implementation:**
    *   [ ] Implement optional viewport scrolling during `cc` response based on setting. Use `editor.scrollIntoView`.
    *   [ ] Implement optional keyboard shortcut to trigger `cc` (register command and allow user assignment).
    *   [ ] Add confirmation prompt (`Modal` or simple `confirm()`) before `dd` deletion (Strongly Recommended).
*   **Refinements:**
    *   [ ] Update `ChatService.ts` and `EditorHandler.ts` to use customizable command phrases and separator from settings.
    *   [ ] Refine error handling across all features (API calls, file operations). Provide clear user feedback via `Notice`.
    *   [ ] Review code against `obsidian-guidelines.md` (no global `app`, use `editorCallback`/`editorCheckCallback` where appropriate, clean up resources, use sentence case in UI, avoid hardcoded styles).

---

## Milestone 5: Testing & Release Prep

**Goal:** Ensure stability, polish the user experience, and prepare for release.

*   [ ] Thoroughly test all command phrases (`cc`, `gg`, `dd`, `nn`) and edge cases (empty notes, notes without separators, incorrect phrase placement, file conflicts).
*   [ ] Test all settings options individually and in combination (API keys, models, sorting, commands, separator, scrolling, archive options, new chat options, delete options, stop options).
*   [ ] Test stop sequence and stop shortcut key during active streaming.
*   [ ] Test API error handling (invalid API key, network issues, model errors).
*   [ ] Test file operation errors (permissions, non-existent folders).
*   [ ] Test on different platforms if possible (Desktop Mac/Win/Linux, Mobile - consider limitations like Node/Electron APIs). Check regex compatibility (lookbehind).
*   [ ] Review code for clarity, efficiency, and adherence to Obsidian API best practices. Minimize console logging.
*   [ ] Update `README.md` with final usage instructions, settings explanations, and screenshots.
*   [ ] Ensure `test-vault` is up-to-date and useful for testing/contributors.
*   [ ] Prepare for release (update `manifest.json` version, check `versions.json`, build process).