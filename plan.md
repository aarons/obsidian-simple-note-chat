# Plan: Refactor Command Phrase Triggering

## Goal

Improve the responsiveness and feel of command phrase triggering (`cc`, `gg`, `nn`) by using the `keydown` event for `<phrase><Enter>`, while retaining the existing `<phrase><space>` trigger mechanism efficiently. Allow triggering from any line containing only the phrase.

## Trigger Mechanisms

1.  **`<phrase><Enter>` (Immediate Trigger):**
    *   **Event:** `keydown` listener in `main.ts`.
    *   **Condition:**
        *   Key pressed is `Enter`.
        *   No chat stream is currently active for the file.
        *   The text on the current line, when trimmed, exactly matches a configured command phrase (`settings.chatCommandPhrase`, `settings.archiveCommandPhrase`, or `settings.newChatCommandPhrase` if enabled).
        *   The cursor is positioned exactly at the end of the line's content (before any trailing whitespace, effectively `editor.getLine(cursor.line).length`).
    *   **Action:**
        *   Prevent the default `Enter` action (i.e., inserting a newline).
        *   Call the corresponding `trigger<CommandName>Command` method in `EditorHandler.ts`.

2.  **`<phrase><space>` (Delayed Trigger):**
    *   **Event:** `editor-change` listener in `EditorHandler.ts`.
    *   **Condition:**
        *   No chat stream is currently active for the file.
        *   The last line containing content ends exactly with `<phrase><space>` (e.g., `"cc "`).
    *   **Action:**
        *   Set a 500ms `setTimeout`.
        *   If the timeout completes and the line content hasn't changed, call the corresponding `trigger<CommandName>Command` method in `EditorHandler.ts`.
        *   If the content changes before the timeout, clear the timer.

3.  **Stop Sequence (`sss`) (Immediate Trigger):**
    *   **Event:** `editor-change` listener in `EditorHandler.ts`.
    *   **Condition:**
        *   A chat stream *is* active for the file.
        *   The `settings.stopCommandSequence` is found anywhere in the document content.
    *   **Action:**
        *   Cancel the active stream using `chatService.cancelStream`.
        *   Remove the stop sequence from the editor.
        *   Append an interruption message.

4.  **`Escape` Key (Immediate Trigger):**
    *   **Event:** `keydown` listener in `main.ts`.
    *   **Condition:**
        *   Key pressed is `Escape`.
        *   A chat stream *is* active for the file.
    *   **Action:**
        *   Cancel the active stream using `chatService.cancelStream`.
        *   Prevent default `Escape` action and stop propagation.

## Implementation Details

### `main.ts`

*   **Modify `handleKeyDown`:**
    *   Add logic to check for the `Enter` key.
    *   Inside the `Enter` check:
        *   Verify no active stream.
        *   Get current line text and cursor position.
        *   Check if `lineText.trim()` matches a command phrase.
        *   Check if `cursor.ch === lineText.length`.
        *   If all conditions met, call `evt.preventDefault()`, `evt.stopPropagation()`, and the appropriate `editorHandler.trigger...Command` method.
    *   Keep existing `Escape` key logic for stream cancellation.

### `EditorHandler.ts`

*   **Modify `handleEditorChange`:**
    *   This method will *no longer* handle the `<phrase><Enter>` detection.
    *   It *will* retain/restore the logic for detecting `<phrase><space>` at the end of the last content line and using `setTimeout` to trigger the command after 500ms if the line remains unchanged. (This logic existed in the original version of the file).
    *   It *will* retain the logic for detecting the `stopCommandSequence` during an active stream.
*   **Add `triggerChatCommand`, `triggerArchiveCommand`, `triggerNewChatCommand` methods:**
    *   These public methods will be called by `handleKeyDown` (for `Enter`) or the `setTimeout` callback (for `space`).
    *   Each method will receive `editor`, `markdownView`, `settings`, and `commandLineIndex`.
    *   **Common Action:** Remove the command phrase line.
        *   Calculate the range of the line (`commandLineStartPos`, `commandLineEndPos`).
        *   Determine the correct range to remove (including the newline character if it's not the last line).
        *   Use `editor.replaceRange('', startPos, endPosToRemove)`.
        *   Call `_setCursorBeforeCommand` to reposition the cursor appropriately *before* any async operations.
    *   **Specific Actions:**
        *   `triggerChatCommand`: Replace the (now removed) command line space with a status message (`\nCalling model...\n`), update cursor position, and call `chatService.startChat`, passing the range of the status message. Handle potential errors from `startChat`.
        *   `triggerArchiveCommand`: Perform the separator check *before* removing the line (checking content *excluding* the command line). If check passes, remove the line, then call `fileSystemService.moveFileToArchive` asynchronously.
        *   `triggerNewChatCommand`: Remove the line, then execute the `simple-note-chat:create-new-chat-note` command.
*   **Modify `_setCursorBeforeCommand`:** Ensure it handles the case where the command was on the first line (index 0) by moving the cursor to the start `{ line: 0, ch: 0 }`.

## Rationale

*   **Responsiveness:** Using `keydown` for `Enter` provides immediate feedback.
*   **Efficiency:** Keeping the `<phrase><space>` logic in `editor-change` with `setTimeout` avoids performance issues associated with checking every spacebar press in `keydown`.
*   **Clarity:** Separating trigger logic (`keydown` vs. `editor-change`) and keeping action logic (`trigger...Command` methods) distinct maintains readability.
*   **Flexibility:** Removing the "last line" constraint allows users to trigger commands more freely.
*   **Robustness:** Relies on editor state rather than fragile character buffers.

## Future Considerations

*   Could potentially add visual feedback (e.g., subtle line highlight) when a command phrase is typed on a line, even before Enter/Space. (Low priority).
*   Ensure error handling in trigger methods provides clear user feedback.
