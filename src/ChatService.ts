import { Notice, Plugin, Editor, TFile, EditorPosition } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import { PluginSettings, ChatMessage } from './types';
import { CompletionProvider } from './ModelProvider';
import { log } from './utils/logger';
import { CHAT_SEPARATOR, getChatContentStart } from './constants';
import { LinkedNoteContext, withLinkedNoteContext } from './LinkedNoteContext';
import { GeneratedImageService } from './GeneratedImageService';

interface ActiveStreamInfo {
    controller: AbortController;
    statusText: string;
    statusStartPos: EditorPosition;
    statusEndPos: EditorPosition;
}

export class ChatService {
    private plugin: Plugin;
    private provider: CompletionProvider;
    private activeStreams: Map<string, ActiveStreamInfo> = new Map(); // Key: note path

    constructor(plugin: Plugin, provider: CompletionProvider) {
        this.plugin = plugin;
        this.provider = provider;
    }

    /** Apply a background edit without asking Obsidian to reveal the cursor. */
    private replaceRange(editor: Editor, text: string, from: EditorPosition, to = from): void {
        // Obsidian's replaceRange AND transaction APIs request scrollIntoView.
        // The underlying CM6 view is not part of the public Editor type, so keep
        // access here and retain a fallback for editors without it.
        const cm = (editor as Editor & { cm?: EditorView }).cm;
        if (cm) {
            cm.dispatch({
                changes: { from: editor.posToOffset(from), to: editor.posToOffset(to), insert: text },
                scrollIntoView: false,
            });
            // Omitting selection lets CodeMirror map the user's current ranges
            // through the change without moving the caret to the response.
        } else {
            const { left, top } = editor.getScrollInfo();
            editor.replaceRange(text, from, to);
            // Capture each edit's viewport, never the position at stream start.
            editor.scrollTo(left, top);
        }
    }

    /**
     * Parses note content into ChatMessages, excluding content at or after a given position.
     * @param fullContent The raw string content of the note.
     * @param separator The separator used to divide messages.
     * @param parseUntilPos The position in the editor up to which content should be parsed.
     * @returns An array of ChatMessage objects.
     */
    private parseNoteContent(fullContent: string, separator: string, parseUntilOffset: number): ChatMessage[] {
        const start = getChatContentStart(fullContent, parseUntilOffset);
        const contentToParse = fullContent.slice(start, parseUntilOffset);

        // Proceed with splitting the correctly selected content
        const parts = contentToParse.split(separator)
                                    .map(part => part.trim())
                                    .filter(part => part.length > 0);

        const messages: ChatMessage[] = [];
        let currentRole: 'user' | 'assistant' = 'user';

        for (const part of parts) {
             messages.push({ role: currentRole, content: part });
            currentRole = currentRole === 'user' ? 'assistant' : 'user';
        }

        if (messages.length === 0) {
            log.debug("Parsing resulted in zero messages. Ensure note content before insertion point is structured correctly.");
        }
        return messages;
    }

    /**
     * Inserts text at a given position, ensuring it starts on a new line if necessary.
     * @returns A tuple containing the start and end positions of the inserted text.
     */
    private insertTextAtPos(editor: Editor, text: string, pos: EditorPosition): [EditorPosition, EditorPosition] {
        const currentOffset = editor.posToOffset(pos);
        const docValue = editor.getValue();
        let textToInsert = text;

        // Ensure the text starts on a new line unless it's at the very beginning
        // or the preceding character is already a newline.
        if (currentOffset > 0 && docValue[currentOffset - 1] !== '\n') {
            textToInsert = '\n' + textToInsert;
        }
        // Ensure it ends with a newline
        if (!textToInsert.endsWith('\n')) {
             textToInsert += '\n';
        }

        const startInsertOffset = currentOffset;
        const startInsertPos = editor.offsetToPos(startInsertOffset);

        this.replaceRange(editor, textToInsert, startInsertPos);

        const endInsertOffset = startInsertOffset + textToInsert.length;
        const endInsertPos = editor.offsetToPos(endInsertOffset);

        return [startInsertPos, endInsertPos];
    }


    /**
     * Handles the unified chat process. Inserts a status message, calls API, streams response.
     * @param editor The editor instance.
     * @param file The file associated with the editor.
     * @param settings The current plugin settings.
     * @param insertionPos The position in the editor where the chat should be initiated (e.g., cursor).
     */
    async startChat(
        editor: Editor,
        file: TFile,
        settings: PluginSettings,
        insertionPos: EditorPosition
    ): Promise<void> {
        const notePath = file.path;

        if (this.activeStreams.has(notePath)) {
            new Notice(`Chat stream already active for note: ${notePath}. Please wait or cancel.`);
            log.debug(`Chat stream already active for note: ${notePath}. Ignoring new request.`);
            return;
        }

        // 1. Insert Status Message
        const statusMessage = `Calling ${settings.defaultModel}...`;
        const [actualStatusStartPos, actualStatusEndPos] = this.insertTextAtPos(editor, statusMessage, insertionPos);
        log.debug(`Inserted status message from [${actualStatusStartPos.line}, ${actualStatusStartPos.ch}] to [${actualStatusEndPos.line}, ${actualStatusEndPos.ch}]`);

        // 2. Parse Content *before* the status message
        const parseUntilOffset = editor.posToOffset(actualStatusStartPos);
        const sourceContent = editor.getValue();
        let messages = this.parseNoteContent(sourceContent, CHAT_SEPARATOR, parseUntilOffset);

        if (messages.length === 0) {
            new Notice('No content found before the chat initiation point.');
            this.removeStatusMessageAtPos(editor, statusMessage, actualStatusStartPos, actualStatusEndPos, 'No content found.');
            return;
        }

        // 3. Set up AbortController and track stream
        const abortController = new AbortController();
        this.activeStreams.set(notePath, {
            controller: abortController,
            statusText: statusMessage,
            statusStartPos: actualStatusStartPos,
            statusEndPos: actualStatusEndPos
        });

        let isFirstChunk = true;
        let currentInsertPos: EditorPosition | null = null; // Position where the next chunk should be inserted
        let lastPosition: EditorPosition | null = null; // Tracks the end of the last inserted chunk

        try {
            if (settings.followNoteLinks) {
                const { notes, skipped } = await new LinkedNoteContext(this.plugin.app).collect(
                    file, sourceContent, parseUntilOffset, settings.noteLinkDepth, abortController.signal
                );
                if (skipped.length) {
                    new Notice(`Could not fully load ${skipped.length} linked note(s). Some linked context may be missing.`);
                }
                messages = withLinkedNoteContext(messages, notes);
            }
            if (abortController.signal.aborted) throw new DOMException('Chat cancelled', 'AbortError');

            // 4. Call API and Stream Response
            const streamGenerator = this.provider.streamChatCompletion(
                messages,
                settings,
                abortController.signal
            );

            const images = new GeneratedImageService(this.plugin.app);
            for await (const output of streamGenerator) {
                if (abortController.signal.aborted) throw new DOMException('Chat cancelled', 'AbortError');
                const chunk = typeof output === 'string' ? output : await images.save(output.url, file, abortController.signal);
                if (chunk) {
                    if (isFirstChunk) {
                        // 4a. Remove status message
                        this.removeStatusMessageAtPos(editor, statusMessage,
                            actualStatusStartPos, actualStatusEndPos, 'First chunk received.');

                        // 4b. Insert separator with normalized spacing
                        currentInsertPos = this.insertSeparatorWithSpacing(
                            editor,
                            actualStatusStartPos, // Insert where status message was
                            CHAT_SEPARATOR
                        );

                        // 4c. Insert the first chunk
                        this.replaceRange(editor, chunk, currentInsertPos);
                        lastPosition = editor.offsetToPos(
                            editor.posToOffset(currentInsertPos) + chunk.length
                        );
                        isFirstChunk = false;
                    } else {
                        // 4d. Insert subsequent chunks
                        if (!lastPosition) {
                            throw new Error("Internal state error: lastPosition not set after first chunk.");
                        }
                        this.replaceRange(editor, chunk, lastPosition);
                        lastPosition = editor.offsetToPos(
                            editor.posToOffset(lastPosition) + chunk.length
                        );
                    }

                }
            } // End for await loop

            // 5. Handle Stream Completion
            if (isFirstChunk) {
                // No chunks received - status message should still be there
                this.removeStatusMessageAtPos(editor, statusMessage, actualStatusStartPos, actualStatusEndPos, 'Stream ended with no content.');
                new Notice("Chat completed with no response.");
            } else if (lastPosition) {
                // Append the final separator without interrupting navigation.
                lastPosition = this.insertSeparatorWithSpacing(
                    editor,
                    lastPosition,
                    CHAT_SEPARATOR
                );
            }
        } catch (error: any) {
            // 6. Handle Errors
            log.error('Error during chat stream orchestration:', error);
            let reason = 'Unknown stream error';
            let noticeMessage = 'Chat error: Unknown error';

            if (error instanceof DOMException && error.name === 'AbortError') {
                reason = abortController.signal.reason || 'Chat cancelled by user';
                noticeMessage = `Chat request cancelled: ${reason}`;
            } else if (error instanceof Error) {
                reason = error.message;
                if (reason.includes("API key") || reason.includes("default model")) {
                    noticeMessage = `Configuration error: ${reason}. Please check plugin settings.`;
                } else {
                    noticeMessage = `Chat error: ${reason}`;
                }
            } else {
                 reason = String(error);
                 noticeMessage = `Chat error: ${reason}`;
            }
            new Notice(noticeMessage);

            // If the error occurred before the first chunk, status message should still be present
            if (isFirstChunk) {
                log.debug("Error occurred before first chunk, attempting status message cleanup.");
                this.removeStatusMessageAtPos(editor, statusMessage, actualStatusStartPos, actualStatusEndPos, `Error/Cancel occurred: ${reason}`);
            } else {
                 log.debug("Error occurred after first chunk, status message should already be removed.");
                 // Cursor might be somewhere in the partially inserted response
            }
        } finally {
            // 7. Final Cleanup
            if (this.activeStreams.get(notePath)?.controller === abortController) {
                this.activeStreams.delete(notePath);
            }
            log.debug(`Removed active stream tracker for note: ${notePath}`);
        }
    }


    /**
     * Attempts to remove the status message inserted by startChat.
     * @param editor The editor instance.
     * @param expectedStatusBase The exact status text that was inserted.
     * @param startPos The expected start position of the status message.
     * @param endPos The expected end position of the status message.
     * @param reason Optional reason for removal logging.
     * @returns True if the message was found and removed, false otherwise.
     */
    private removeStatusMessageAtPos(editor: Editor, expectedStatusBase: string, startPos: EditorPosition, endPos: EditorPosition, reason?: string): boolean {
        let removed = false;

        try {
            // Check range validity before getting text
             if (editor.posToOffset(startPos) >= editor.posToOffset(endPos)) {
                 log.warn("Invalid range for status message removal (start >= end).", { start: startPos, end: endPos, reason });
                 return false;
             }

            const currentText = editor.getRange(startPos, endPos).trim(); // Trim to handle potential extra newlines from insertTextAtPos

            if (currentText === expectedStatusBase) {
                this.replaceRange(editor, '', startPos, endPos);
                removed = true;
                log.debug(`Removed status message at [${startPos.line}, ${startPos.ch}]-[${endPos.line}, ${endPos.ch}]. Reason: ${reason || 'N/A'}`);
            } else {
                 log.warn(`Did not remove status message. Expected base "${expectedStatusBase}" but found "${currentText}"`, { start: startPos, end: endPos, reason: reason });
            }
        } catch (e) {
            log.error("Error removing status message range:", e, { start: startPos, end: endPos, reason: reason });
        }
        return removed;
    }

    /**
     * Inserts the separator with appropriate spacing.
     * @returns The position right after the inserted block.
     */
    private insertSeparatorWithSpacing(
        editor: Editor,
        pos: EditorPosition,
        separator: string
    ): EditorPosition {
        let currentOffset = editor.posToOffset(pos);
        const docLength = editor.getValue().length;
        const originalValue = editor.getValue();

        // Adjust position to be *after* any existing newlines at the target pos
        while (currentOffset < docLength && originalValue[currentOffset] === '\n') {
            currentOffset++;
        }
        const adjustedPos = editor.offsetToPos(currentOffset);

        // Determine prefix: Need two newlines unless at start or preceded by newline.
        let prefix = '\n\n';
        if (currentOffset === 0) {
            prefix = '';
        } else if (currentOffset > 0 && originalValue[currentOffset - 1] === '\n') {
             prefix = '\n';
        }

        const suffix = '\n\n'; // Always need two newlines after
        const block = `${prefix}${separator}${suffix}`;

        this.replaceRange(editor, block, adjustedPos);

        // Return the position *after* the entire inserted block
        return editor.offsetToPos(currentOffset + block.length);
    }


    /**
     * Checks if a stream is currently active for the given file path.
     */
    isStreamActive(filePath: string): boolean {
        return this.activeStreams.has(filePath);
    }

    /**
     * Cancels an active chat stream.
     */
    cancelStream(filePath: string, editor: Editor): void {
        const streamInfo = this.activeStreams.get(filePath);
        if (!streamInfo) {
            log.debug(`No active chat stream found to cancel for note: ${filePath}`);
            return;
        }

        const reason = "Chat cancelled by user action.";
        streamInfo.controller.abort(reason);

        // Attempt status message cleanup using stored positions
        this.removeStatusMessageAtPos(editor, streamInfo.statusText, streamInfo.statusStartPos, streamInfo.statusEndPos, reason);

        this.activeStreams.delete(filePath); // Ensure removal
        log.debug(`Stream cancelled and removed from active streams for: ${filePath}`);
        new Notice(reason);
    }
}
