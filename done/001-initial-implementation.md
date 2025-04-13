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
    *   [x] Set up Obsidian plugin dev environment (Node.js, npm/yarn, TypeScript).
    *   [x] Initialize project using Obsidian sample plugin template.
    *   [x] Configure `manifest.json` (ID, name, version, author, description, minAppVersion). Rename placeholder names (`MyPlugin` etc.) per guidelines.
    *   [x] Set up `tsconfig.json` and build scripts (`package.json`).
    *   [x] Implement basic `main.ts` (onload, onunload). Use `this.app` instead of global `app`.
    *   [x] Create `constants.ts` with initial defaults (command phrases, separator, API endpoint).
    *   [x] Create `types.ts` and define basic `PluginSettings` interface (apiKey, defaultModel).
    *   [x] Implement basic settings loading/saving in `main.ts` using `loadData`/`saveData`.
    *   [x] Set up `test-vault` directory.
    *   [x] Add basic development setup instructions to `developer-notes.md` or `CONTRIBUTING.md`.
*   **Essential Settings UI:**
    *   [x] Create `SettingsTab.ts` extending `PluginSettingTab`. Register it in `main.ts`.
    *   [x] Add settings UI component for OpenRouter API Key input (`addText`). *Consider security implications; OAuth is preferred long-term, but API key is acceptable for MVP.*
    *   [x] Add settings UI component for Default Chat Model selection (`addDropdown`).
    *   [x] Implement simplified version of `OpenRouterService.ts` for fetching models
    *   [x] Add button in settings to fetch/refresh model list from OpenRouter using `OpenRouterService.ts`. Handle potential API errors.
    *   [x] Populate the Default Chat Model dropdown with fetched models.
    *   [x] Implement model sorting and display; use sample OpenRouterService.ts in documentation for reference on how it should be done.
    *   [x] Ensure API key and selected model are saved correctly.
    *   [x] Ensure API key is obfuscated when saved
*   **Core Chat Implementation (`cc`):**
    *   [x] Implement `ChatService.ts`.
    *   [x] Add function in `ChatService.ts` to parse active note content based on separator (from `constants.ts` initially), alternating roles. Filter out command phrases.
    *   [x] Implement API call logic in `ChatService.ts` (using `OpenRouterService.ts` if created):
        *   [x] Use API key and default model from settings.
        *   [x] Handle authentication (Bearer token).
        *   [x] Implement streaming request using `fetch` or `requestUrl`.
    *   [x] Implement `EditorHandler.ts` to monitor editor changes (e.g., using `editorCallback` or listening to `editor-change` event).
    *   [x] Add logic in `EditorHandler.ts` to detect `cc` phrase on its own line at the end.
+ 54 |         *   [x] *Refinement:* Ensure detection explicitly checks for `cc` being on its *own line* and immediately followed by a *newline*, ignoring cases like `message cc` or `cc` without a trailing newline.
    *   [x] Implement logic in `EditorHandler.ts` or `main.ts` to:
        *   [x] Replace `cc` with "Calling {model name}..." status message using `editor.replaceRange`.
        *   [x] Trigger `ChatService.ts` to start the chat.
+ 57 |         *   [x] *Corner Case:* Handle potential race conditions if `cc` is triggered multiple times quickly for the same note (e.g., add a lock/flag per note).
    *   [x] Implement response handling in `ChatService.ts`:
        *   [x] Receive streamed response chunks.
        *   [x] Remove the "Calling..." message.
        *   [x] Append a new separator to the note.
        *   [x] Append response chunks to the note using `editor.replaceRange` or similar Editor API methods (prefer over `Vault.modify`).
        *   [x] Append a final separator after the response is complete.
        *   [x] Add trailing newlines for the user cursor.
    *   [x] Manage the state of the active stream (e.g., store the request object or a flag in `ChatService.ts`).
+ 65 |         *   [x] *Refinement:* Ensure active stream state is correctly mapped to the specific note/editor instance (e.g., using a `Map` keyed by file path).
    *   [x] Implement basic API error handling (show messages via `Notice`).
+ 66 |         *   [x] *Refinement:* If API call fails *before* streaming starts, replace 'Calling...' message with a user-friendly error `Notice`.
    *   [x] Ensure resources (event listeners, intervals) are cleaned up in `onunload` using `register...` methods.
+ 67 |     *   [x] *Note:* Current plan uses `editor.replaceRange` for streaming. Monitor during testing for potential conflicts if user edits near the insertion point simultaneously.

---

## Milestone 2: Stop Streaming & Basic File Operations (`gg`, `dd`)

**Goal:** Allow users to interrupt responses and implement basic archive and delete functionality.

*   **Stop Streaming:**
    *   [x] Add keyboard event listener in `main.ts` or `EditorHandler.ts` for the stop key (default `Escape`). Use `registerDomEvent` or `scope.register`.
    *   [x] Add logic in `EditorHandler.ts` to detect a stop sequence (default `stop`) typed during streaming.
    *   [x] When stop is triggered:
        *   [x] Check if a chat stream is active for the current note (using state from `ChatService.ts`).
        *   [x] If active, call a method in `ChatService.ts` to cancel the ongoing API request/stream (e.g., `AbortController.abort()`).
        *   [x] Ensure writing to the note stops cleanly.
        *   [x] (Optional) Add a "[Response Interrupted]" message.
+ 82 |         *   [x] *Refinement:* Change "(Optional)" to "Add a '[Response Interrupted]' message to the note when streaming is stopped."
    *   [x] Add Settings UI: Stop shortcut key input/selector, Stop typed sequence input.
*   **File System Service:**
    *   [x] Implement `FileSystemService.ts`.
    *   [x] Add function to move a file using `Vault.rename`. Use `normalizePath`. Create archive directory if needed using `Vault.createFolder`.
+ 86 |         *   [x] *Corner Case:* Handle potential file conflicts in the archive directory (e.g., if a file with the target name already exists). Recommend renaming the new file (e.g., appending `-1`, `-2`) rather than overwriting.
    *   [x] Add function to delete a file using `Vault.trash` (prefer over `Vault.delete`).
*   **Archive Chat (`gg` - Basic):**
    *   [x] Add logic in `EditorHandler.ts` to detect the `gg` phrase.
+ 89 |         *   [x] *Refinement:* Ensure detection explicitly checks for `gg` being on its *own line* and immediately followed by a *newline*.
    *   [x] Add logic to check for chat separators before archiving (fail silently or notify if none found).
    *   [x] Trigger `FileSystemService.ts` to move the note to the configured archive directory.
    *   [x] Remove the `gg` text from the note content before saving/moving.
    *   [x] Add Settings UI: Archive folder path input (`addText`).
*   **Delete Chat (`dd` - Basic):**
    *   [x] Add Settings UI: Enable delete command checkbox (`addToggle`, default off).
    *   [x] Add logic in `EditorHandler.ts` to detect the `dd` phrase *only if* enabled.
+ 96 |         *   [x] *Refinement:* Ensure detection explicitly checks for `dd` being on its *own line* and immediately followed by a *newline*.
    *   [x] Add logic to check for chat separators before deleting (fail silently or notify if none found).
    *   [x] Trigger `FileSystemService.ts` to delete the note.
+ 98 |     *   [x] Add confirmation prompt (`Modal` or simple `confirm()`) before deletion (Strongly Recommended).
+ 99 |     *   [x] *Defer:* Bypass separator check setting (moved to Milestone 4).

---

## Milestone 3: New Chat (`nn`) & Archive Refinements (`gg`)

**Goal:** Implement creating new chats and enhance the archive functionality with renaming.

*   **New Chat (`nn`):**
    *   [x] Add command in `main.ts` for creating a new note. Use `FileManager.getNewFileParent` to determine location.
    *   [x] Implement command logic:
        *   [x] Create a new note using `Vault.create`.
        *   [x] Generate default title (e.g., `YYYY-MM-DD-HH-mm` using `moment`).
        *   [x] Open the newly created note using `workspace.openLinkText` or leaf methods.
    *   [x] Add Settings UI: Enable `nn` phrase checkbox, Enable ribbon button checkbox, Enable keyboard shortcut checkbox.
    *   [x] Add logic in `EditorHandler.ts` to detect the `nn` phrase (if enabled).
    *   [x] Register ribbon icon in `main.ts` (if enabled) that triggers the command.
    *   [x] Register keyboard shortcut in `main.ts` (if enabled) that triggers the command.
*   **Archive Previous Note (`nn` option):**
    *   [x] Add Settings UI: Enable "archive previous note" checkbox for `nn`.
    *   [x] Modify `nn` command logic: If enabled, trigger the `gg` logic on the *current* note *before* creating the new one.
+ 120 |         *   [x] *Corner Case:* If the `gg` operation fails, notify the user via `Notice` but still proceed with creating the new note.
*   **Archive Renaming (`gg` - Date):**
    *   [x] Add Settings UI: Enable title renaming checkbox, Title format options (date format string input using `MomentFormatComponent`).
    *   [x] Modify `gg` logic:
        *   [x] If renaming enabled, get current date/time (`moment`).
        *   [x] Format using the setting.
        *   [x] Construct new path with formatted date/time.
        *   [x] Use `Vault.rename` (via `FileSystemService.ts`) with the new path.
*   **Archive Renaming (`gg` - LLM Title):**
    *   [x] Add Settings UI: LLM titling options (enable checkbox, word limit input, emojis checkbox, title model selection dropdown).
    *   [x] Modify `gg` logic:
        *   [x] If LLM titling enabled:
            *   [x] Send note content to `ChatService.ts` (using configured title model).
            *   [x] Construct prompt asking for a short title (respecting settings).
            *   [x] Make non-streaming API call.
            *   [x] Prepend/append generated title to the filename when constructing the new path. Handle potential API errors.

+ 135 |             *   [x] *Corner Case:* Specify fallback behavior if LLM title generation fails (e.g., use date format only, or move without renaming title, and notify user via `Notice`).
---

## Milestone 4: Settings Polish & Other Features

**Goal:** Implement remaining settings, refine existing features, and add quality-of-life improvements.

*   **Settings UI Completion:**
    *   [x] Add Settings UI: Customize command phrases (`cc`, `gg`, `dd`, `nn`) inputs.
    *   [x] Add Settings UI: Customize chat separator input.
    *   [x] Add Settings UI: Enable/disable viewport scrolling checkbox.
    *   [x] Add Settings UI: `dd` Bypass separator check checkbox (default off).
    *   [x] Implement model sorting options in settings (Alphabetical, Price Asc/Desc) based on `openRouterService.ts` example. Use `addDropdown` and call `OpenRouterService.sortModels`. Update dropdown display dynamically.
    *   [x] Ensure all settings are saved correctly and loaded on startup.
    *   [x] Add logic to inform the user if a plugin reload is needed for certain setting changes (e.g., command phrases). Use `Notice`.
*   **Feature Implementation:**
    *   [x] Implement optional viewport scrolling during `cc` response based on setting. Use `editor.scrollIntoView`.
    *   [x] Implement optional keyboard shortcut to trigger `cc` (register command and allow user assignment).
    *   [x] Add confirmation prompt (`Modal` or simple `confirm()`) before `dd` deletion (Strongly Recommended).
+ 153 |         *   [x] *Note:* Moved confirmation prompt requirement to Milestone 2. This task can be removed or marked as complete if done in M2.
*   **Refinements:**
    *   [x] Update `ChatService.ts` and `EditorHandler.ts` to use customizable command phrases and separator from settings.
    *   [x] Refine error handling across all features (API calls, file operations). Provide clear user feedback via `Notice`.
    *   [x] Review code against `obsidian-guidelines.md` (no global `app`, use `editorCallback`/`editorCheckCallback` where appropriate, clean up resources, use sentence case in UI, avoid hardcoded styles).

---

