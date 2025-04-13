# Simple Note Chat - Obsidian Plugin Implementation Plan

This document outlines the steps required to build the Simple Note Chat plugin for Obsidian, based on the features described in `README.md` and `developer-notes.md`.

## 1. Architecture Overview

The plugin will follow a modular structure common in Obsidian plugin development:

*   **`main.ts`**: The main entry point for the plugin. It will handle loading/unloading, registering commands, settings tabs, and event listeners (like editor changes).
*   **`SettingsTab.ts`**: Manages the plugin's settings UI, allowing users to configure API keys, models, command phrases, behaviors, etc. It will save and load settings using Obsidian's data storage.
*   **`EditorHandler.ts`**: Listens for changes in the active editor view. It will be responsible for detecting the command phrases (`cc`, `gg`, `dd`, `nn`) at the end of a note and the `stop` sequence during streaming. It will trigger the appropriate actions based on detected commands.
*   **`ChatService.ts`**: Encapsulates the logic for interacting with the LLM provider (initially OpenRouter). This includes:
    *   Parsing the note content based on the configured separator to build the message history.
    *   Making API calls to the LLM.
    *   Handling streaming responses and updating the note content.
    *   Managing active streams to allow for interruption.
    *   Handling API authentication.
*   **`FileSystemService.ts`**: Handles interactions with the Obsidian vault filesystem, specifically:
    *   Moving notes to the archive folder (`gg`).
    *   Renaming notes during archival.
    *   Deleting notes (`dd`).
    *   Creating new notes (`nn`).
*   **`OpenRouterService.ts`**: (Optional but recommended) A dedicated service to handle the specifics of the OpenRouter API, like fetching available models and formatting requests/responses. This makes it easier to add other providers later.
*   **`constants.ts`**: Stores default values for settings, command phrases, API endpoints, etc.
*   **`types.ts`**: Defines TypeScript interfaces for settings objects, API responses, message structures, etc.

## 2. Development Setup & Core

This section covers the initial project setup and basic plugin scaffolding.

*   [ ] Set up the Obsidian plugin development environment (Node.js, npm/yarn, TypeScript).
*   [ ] Initialize the plugin project using the Obsidian sample plugin template or similar.
*   [ ] Configure `manifest.json` with plugin ID, name, version, etc.
*   [ ] Implement basic `main.ts` structure (onload, onunload).
*   [ ] Set up `tsconfig.json` and build scripts (`package.json`).
*   [ ] Create the `constants.ts` file with initial default values.
*   [ ] Create the `types.ts` file and define the basic `PluginSettings` interface.
*   [ ] Implement basic settings loading/saving in `main.ts`.
*   [ ] Set up the `test-vault` directory as described in the README.
*   [ ] Add basic development instructions to `developer-notes.md` or a new `CONTRIBUTING.md`.

## 3. Settings UI (`SettingsTab.ts`)

Implement the user interface for configuring the plugin.

*   [ ] Create `SettingsTab.ts` extending `PluginSettingTab`.
*   [ ] Add settings UI component for OpenRouter API Key input.
*   [ ] Add settings UI component for Default Chat Model selection (dropdown).
*   [ ] Implement button and logic to fetch/refresh model list from OpenRouter.
*   [ ] Add settings UI components for customizing command phrases (`cc`, `gg`, `dd`, `nn`).
*   [ ] Add settings UI component for customizing the chat separator.
*   [ ] Add settings UI component for enabling/disabling viewport scrolling.
*   [ ] Add settings UI components for Archive (`gg`) configuration:
    *   [ ] Archive folder path input.
    *   [ ] Enable/disable title renaming checkbox.
    *   [ ] Title format options (date format string, LLM subject).
    *   [ ] LLM titling options (word limit, emojis, model selection).
*   [ ] Add settings UI components for New Chat (`nn`) configuration:
    *   [ ] Enable phrase checkbox.
    *   [ ] Enable ribbon button checkbox.
    *   [ ] Enable keyboard shortcut checkbox/input.
    *   [ ] Enable "archive previous note" checkbox.
*   [ ] Add settings UI components for Delete (`dd`) configuration:
    *   [ ] Enable delete command checkbox (default off).
    *   [ ] Bypass separator check checkbox (default off).
*   [ ] Add settings UI components for Stop Streaming configuration:
    *   [ ] Stop shortcut key input/selector.
    *   [ ] Stop typed sequence input.
*   [ ] Ensure settings are saved correctly when changed.
*   [ ] Add logic to inform the user if a plugin reload is needed for certain setting changes.

## 4. Core Chat Functionality (`cc`)

Implement the primary feature of chatting with the LLM.

*   [ ] Implement `EditorHandler.ts` to monitor editor changes.
*   [ ] Add logic in `EditorHandler.ts` to detect the `cc` phrase on its own line at the end of the note, followed by a newline.
*   [ ] Implement `ChatService.ts`.
*   [ ] Add function in `ChatService.ts` to parse the active note content:
    *   [ ] Split content by the configured separator.
    *   [ ] Alternate assigning roles (user, assistant).
    *   [ ] Format messages according to the OpenRouter API schema.
*   [ ] Implement API call logic in `ChatService.ts` (or `OpenRouterService.ts`):
    *   [ ] Use API key from settings.
    *   [ ] Use selected default model from settings.
    *   [ ] Handle authentication.
    *   [ ] Implement streaming request.
*   [ ] Implement logic in `EditorHandler.ts` or `main.ts` to:
    *   [ ] Replace `cc` with "Calling {model name}..." status message.
    *   [ ] Trigger `ChatService.ts` to start the chat.
*   [ ] Implement response handling in `ChatService.ts`:
    *   [ ] Receive streamed response chunks.
    *   [ ] Remove the "Calling..." message.
    *   [ ] Append a new separator to the note.
    *   [ ] Append response chunks to the note as they arrive.
    *   [ ] Append a final separator after the response is complete.
    *   [ ] Add trailing newlines for the user cursor.
*   [ ] Implement optional viewport scrolling based on settings.
*   [ ] Implement optional keyboard shortcut to trigger `cc`.
*   [ ] Handle potential API errors gracefully (show messages to user).
*   [ ] Manage the state of the active stream (e.g., store the request object or a flag).

## 5. Stop Streaming Functionality

Allow users to interrupt the LLM response.

*   [ ] Add keyboard event listener in `main.ts` or `EditorHandler.ts` for the configured stop key (default `Escape`).
*   [ ] Add logic in `EditorHandler.ts` to detect the configured stop sequence (default `stop`) typed anywhere during streaming.
*   [ ] When stop is triggered:
    *   [ ] Check if a chat stream is active for the current note.
    *   [ ] If active, call a method in `ChatService.ts` to cancel the ongoing API request/stream.
    *   [ ] Ensure writing to the note stops cleanly.
    *   [ ] (Optional) Add a "[Response Interrupted]" message to the note.

## 6. Archive Chat Functionality (`gg`)

Implement moving chat notes to an archive folder.

*   [ ] Add logic in `EditorHandler.ts` to detect the `gg` phrase.
*   [ ] Implement `FileSystemService.ts`.
*   [ ] Add function in `FileSystemService.ts` to move a file to the configured archive directory. Create the directory if it doesn't exist.
*   [ ] Add logic to check for chat separators before archiving (if enabled by default, though README implies it is).
*   [ ] Implement optional note renaming:
    *   [ ] Get current date/time and format according to settings.
    *   [ ] If LLM titling is enabled:
        *   [ ] Send note content to `ChatService.ts` (using configured title model).
        *   [ ] Construct prompt asking for a short title (respecting word limit, emoji setting).
        *   [ ] Prepend/append generated title to the filename.
    *   [ ] Add function in `FileSystemService.ts` to rename the file before/after moving.
*   [ ] Remove the `gg` text from the note content before saving/moving.
*   [ ] Trigger the archive process from `EditorHandler.ts`.

## 7. New Chat Functionality (`nn`)

Implement ways to quickly create a new chat note.

*   [ ] Add logic in `EditorHandler.ts` to detect the `nn` phrase (if enabled).
*   [ ] Add command in `main.ts` for creating a new note.
*   [ ] Register ribbon icon in `main.ts` (if enabled) that triggers the new note command.
*   [ ] Register keyboard shortcut in `main.ts` (if enabled) that triggers the new note command.
*   [ ] Implement logic in `FileSystemService.ts` or `main.ts` command handler:
    *   [ ] If "archive previous note" is enabled, trigger the `gg` logic on the current note first.
    *   [ ] Create a new note using Obsidian API.
    *   [ ] Generate default title (e.g., `YYYY-MM-DD-HH-mm`).
    *   [ ] Open the newly created note.

## 8. Delete Chat Functionality (`dd`)

Implement the optional (and dangerous) note deletion feature.

*   [ ] Add logic in `EditorHandler.ts` to detect the `dd` phrase *only if* deletion is enabled in settings.
*   [ ] Add function in `FileSystemService.ts` to permanently delete a file using Obsidian API.
*   [ ] Before deleting:
    *   [ ] Check if the note contains chat separators *unless* the bypass check setting is enabled.
    *   [ ] If check fails (and bypass is off), do nothing or show a notification.
*   [ ] If checks pass, call the delete function in `FileSystemService.ts`.
*   [ ] Show a confirmation prompt before deletion (Strongly Recommended, though not explicitly mentioned).

## 9. Refinement & Testing

Final polish and ensuring stability.

*   [ ] Thoroughly test all command phrases (`cc`, `gg`, `dd`, `nn`) and edge cases (empty notes, notes without separators, incorrect phrase placement).
*   [ ] Test all settings options individually and in combination.
*   [ ] Test stop sequence and stop shortcut key during active streaming.
*   [ ] Test API error handling (e.g., invalid API key, network issues).
*   [ ] Test on different platforms if possible (Desktop Mac/Win/Linux, Mobile).
*   [ ] Review code for clarity, efficiency, and adherence to Obsidian API best practices.
*   [ ] Update `README.md` with final usage instructions and screenshots.
*   [ ] Ensure `test-vault` is up-to-date and useful for contributors.
*   [ ] Prepare for release (versioning, build process).