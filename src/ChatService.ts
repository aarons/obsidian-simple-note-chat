import { Notice, Plugin, Editor, TFile, EditorPosition } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';
import { EncryptionService } from './EncryptionService'; // Added for type hint
import SimpleNoteChatPlugin from './main'; // Added for type hint
import { log } from './utils/logger';
import { CHAT_BOUNDARY_MARKER } from './constants';

interface ActiveStreamInfo {
    controller: AbortController;
    statusStartPos: EditorPosition;
    statusEndPos: EditorPosition;
}

export class ChatService {
    private plugin: Plugin;
    private openRouterService: OpenRouterService;
    private activeStreams: Map<string, ActiveStreamInfo> = new Map(); // Key: note path

    constructor(plugin: Plugin, openRouterService: OpenRouterService) {
        this.plugin = plugin;
        this.openRouterService = openRouterService;
    }

    /**
     * Parses note content into ChatMessages, excluding content at or after a given position.
     * @param fullContent The raw string content of the note.
     * @param separator The separator used to divide messages.
     * @param parseUntilPos The position in the editor up to which content should be parsed.
     * @returns An array of ChatMessage objects.
     */
    private parseNoteContent(fullContent: string, separator: string, parseUntilOffset: number): ChatMessage[] {
        const relevantContent = fullContent.substring(0, parseUntilOffset); // Content before the insertion point

        // Regex to find the marker on its own line, allowing whitespace
        // Needs to escape potential regex characters in the marker itself
        const escapedMarker = CHAT_BOUNDARY_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const boundaryRegex = new RegExp('(?:^|\\n)\\s*' + escapedMarker + '\\s*(?=\\n|$)', 'g');

        // Find the *last* occurrence of the marker pattern within the relevant content
        let lastMatch: RegExpExecArray | null = null;
        let currentMatch: RegExpExecArray | null;
        while ((currentMatch = boundaryRegex.exec(relevantContent)) !== null) {
            lastMatch = currentMatch;
        }

        let contentToParse: string;
        if (lastMatch) {
            // If marker found, parse only the content *after* the full match
            const startIndex = lastMatch.index + lastMatch[0].length;
            contentToParse = relevantContent.substring(startIndex);
            log.debug(`Found last chat boundary marker "${CHAT_BOUNDARY_MARKER}" ending at index ${startIndex -1}. Parsing content after marker up to offset ${parseUntilOffset}.`);
        } else {
            // If no marker found, parse all relevant content
            contentToParse = relevantContent;
        }

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

        editor.replaceRange(textToInsert, startInsertPos, startInsertPos);

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
        editor.setCursor(actualStatusEndPos); // Move cursor after status message

        // 2. Parse Content *before* the status message
        const parseUntilOffset = editor.posToOffset(actualStatusStartPos);
        const messages = this.parseNoteContent(editor.getValue(), settings.chatSeparator, parseUntilOffset);

        if (messages.length === 0) {
            new Notice('No content found before the chat initiation point.');
            this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, 'No content found.');
            editor.setCursor(actualStatusStartPos); // Move cursor back
            return;
        }

        // 3. Set up AbortController and track stream
        const abortController = new AbortController();
        this.activeStreams.set(notePath, {
            controller: abortController,
            statusStartPos: actualStatusStartPos,
            statusEndPos: actualStatusEndPos
        });

        let isFirstChunk = true;
        let currentInsertPos: EditorPosition | null = null; // Position where the next chunk should be inserted
        let lastPosition: EditorPosition | null = null; // Tracks the end of the last inserted chunk

        try {
            // 4. Decrypt API Key and Call API
            if (!settings.encryptedApiKey) {
                new Notice('API Key is not set. Please configure it in settings.');
                this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, 'API key missing.');
                editor.setCursor(actualStatusStartPos);
                this.activeStreams.delete(notePath);
                return;
            }

            const decryptedApiKey = await (this.plugin as SimpleNoteChatPlugin).encryptionService.decrypt(settings.encryptedApiKey);

            if (!decryptedApiKey) {
                new Notice('Failed to decrypt API key. Please check plugin settings or re-enter the key.');
                this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, 'API key decryption failed.');
                editor.setCursor(actualStatusStartPos);
                this.activeStreams.delete(notePath);
                return;
            }

            const streamGenerator = this.openRouterService.streamChatCompletion(
                messages,
                decryptedApiKey,
                settings.defaultModel,
                abortController.signal
            );

            for await (const chunk of streamGenerator) {
                if (chunk) {
                    if (isFirstChunk) {
                        // 4a. Remove status message
                        this.removeStatusMessageAtPos(editor, settings,
                            actualStatusStartPos, actualStatusEndPos, 'First chunk received.');

                        // 4b. Insert separator with normalized spacing
                        currentInsertPos = this.insertSeparatorWithSpacing(
                            editor,
                            actualStatusStartPos, // Insert where status message was
                            settings.chatSeparator
                        );

                        // 4c. Insert the first chunk
                        editor.replaceRange(chunk, currentInsertPos, currentInsertPos);
                        lastPosition = editor.offsetToPos(
                            editor.posToOffset(currentInsertPos) + chunk.length
                        );
                        isFirstChunk = false;
                    } else {
                        // 4d. Insert subsequent chunks
                        if (!lastPosition) {
                            throw new Error("Internal state error: lastPosition not set after first chunk.");
                        }
                        editor.replaceRange(chunk, lastPosition, lastPosition);
                        lastPosition = editor.offsetToPos(
                            editor.posToOffset(lastPosition) + chunk.length
                        );
                    }

                }
            } // End for await loop

            // 5. Handle Stream Completion
            if (!isFirstChunk && lastPosition) { // Ensure stream actually inserted content
                // Append final separator and position cursor
                lastPosition = this.insertSeparatorWithSpacing(
                    editor,
                    lastPosition,
                    settings.chatSeparator
                );
                editor.setCursor(lastPosition); // Set cursor after the separator
            } else if (isFirstChunk) {
                // No chunks received - status message should still be there
                this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, 'Stream ended with no content.');
                editor.setCursor(actualStatusStartPos); // Move cursor back to where status was
                new Notice("Chat completed with no response.");
            } else if (lastPosition) {
                 log.warn("Stream finished, content likely received, placing cursor at end of content.");
                 editor.setCursor(lastPosition);
            } else {
                 log.error("Stream finished in an unexpected state. Placing cursor at status message start position.");
                 editor.setCursor(actualStatusStartPos);
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
                this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, `Error/Cancel occurred: ${reason}`);
                editor.setCursor(actualStatusStartPos); // Move cursor back
            } else {
                 log.debug("Error occurred after first chunk, status message should already be removed.");
                 // Cursor might be somewhere in the partially inserted response
            }
        } finally {
            // 7. Final Cleanup
            this.activeStreams.delete(notePath);
            log.debug(`Removed active stream tracker for note: ${notePath}`);
        }
    }


    /**
     * Attempts to remove the status message inserted by startChat.
     * @param editor The editor instance.
     * @param settings Plugin settings to get the model name.
     * @param startPos The expected start position of the status message.
     * @param endPos The expected end position of the status message.
     * @param reason Optional reason for removal logging.
     * @returns True if the message was found and removed, false otherwise.
     */
    private removeStatusMessageAtPos(editor: Editor, settings: PluginSettings, startPos: EditorPosition | undefined, endPos: EditorPosition | undefined, reason?: string): boolean {
        if (!startPos || !endPos) {
            log.warn("Attempted to remove status message but positions were undefined.", { reason });
            return false;
        }

        const expectedStatusBase = `Calling ${settings.defaultModel}...`;
        let removed = false;

        try {
            // Check range validity before getting text
             if (editor.posToOffset(startPos) >= editor.posToOffset(endPos)) {
                 log.warn("Invalid range for status message removal (start >= end).", { start: startPos, end: endPos, reason });
                 return false;
             }

            const currentText = editor.getRange(startPos, endPos).trim(); // Trim to handle potential extra newlines from insertTextAtPos

            if (currentText === expectedStatusBase) {
                editor.replaceRange('', startPos, endPos);
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

        editor.replaceRange(block, adjustedPos, adjustedPos);

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
    cancelStream(filePath: string, editor: Editor, settings: PluginSettings): boolean {
        const streamInfo = this.activeStreams.get(filePath);
        if (streamInfo) {
            log.debug(`Attempting to cancel chat stream for note: ${filePath}`);
            const reason = "Chat cancelled by user action.";
            streamInfo.controller.abort(reason);

            // Attempt status message cleanup using stored positions
            log.debug(`Attempting status message cleanup for cancelled stream: ${filePath}`);
            const removed = this.removeStatusMessageAtPos(editor, settings, streamInfo.statusStartPos, streamInfo.statusEndPos, reason);
            if (removed) {
                 editor.setCursor(streamInfo.statusStartPos); // Move cursor back if status was removed
            }

            this.activeStreams.delete(filePath); // Ensure removal
            log.debug(`Stream cancelled and removed from active streams for: ${filePath}`);
            new Notice(reason);
            return true;
        } else {
            log.debug(`No active chat stream found to cancel for note: ${filePath}`);
            return false;
        }
    }
}
