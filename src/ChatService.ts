import { Notice, Plugin, Editor, TFile, EditorPosition } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';

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
     * Parses note content into ChatMessages.
     * @param content The raw string content of the note.
     * @param separator The separator used to divide messages.
     * @returns An array of ChatMessage objects.
     */
    private parseNoteContent(content: string, separator: string): ChatMessage[] {
        const parts = content.split(separator)
                             .map(part => part.trim())
                             .filter(part => part.length > 0);

        const messages: ChatMessage[] = [];
        let currentRole: 'user' | 'assistant' = 'user';

        for (const part of parts) {
            if (part.startsWith('Calling ') && part.endsWith('...')) {
                console.log(`Skipping potential status message during parsing: "${part}"`);
                continue;
            }

            messages.push({ role: currentRole, content: part });
            currentRole = currentRole === 'user' ? 'assistant' : 'user';
        }

        if (messages.length === 0) {
            console.log("Parsing resulted in zero messages. Ensure note content is structured correctly with separators.");
        }
        return messages;
    }


    /**
     * Handles the chat process from parsing to streaming and updating the editor.
     * @param _noteContent The content of the note before the "Calling..." status was added.
     * @param editor The editor instance where the command was triggered.
     * @param file The file associated with the editor.
     * @param settings The current plugin settings.
     * @param statusMessageStartPos The editor position where the status message begins.
     * @param statusMessageEndPos The editor position where the status message ends.
     */
    async startChat(
        editor: Editor,
        file: TFile,
        settings: PluginSettings,
        statusMessageStartPos: EditorPosition,
        statusMessageEndPos: EditorPosition
    ): Promise<void> {
        const notePath = file.path;

        if (this.activeStreams.has(notePath)) {
            new Notice(`Chat stream already active for note: ${notePath}. Please wait or cancel.`);
            console.log(`Chat stream already active for note: ${notePath}. Ignoring new request.`);
            return;
        }

        // Get content *before* the status message using the provided start position
        const contentForApi = editor.getRange({ line: 0, ch: 0 }, statusMessageStartPos);
        const messages = this.parseNoteContent(contentForApi.trim(), settings.chatSeparator);

        if (messages.length === 0) {
            new Notice('No content found before the trigger command.');
            // Attempt to remove the status message we likely just added
            this.removeStatusMessageAtPos(editor, settings, statusMessageStartPos, statusMessageEndPos, 'No content found.');
            return;
        }

        const abortController = new AbortController();
        this.activeStreams.set(notePath, {
            controller: abortController,
            statusStartPos: statusMessageStartPos,
            statusEndPos: statusMessageEndPos
        });

        let isFirstChunk = true;
        let currentInsertPos: EditorPosition | null = null; // Position where the next chunk should be inserted
        let lastPosition: EditorPosition | null = null; // Tracks the end of the last inserted chunk

        try {
            const streamGenerator = this.openRouterService.streamChatCompletion(
                messages,
                settings,
                abortController.signal
            );

            for await (const chunk of streamGenerator) {
                if (chunk) {
                    if (isFirstChunk) {
                        // 1. Attempt to remove status message at known location
                        const removed = this.removeStatusMessageAtPos(editor, settings, statusMessageStartPos, statusMessageEndPos, 'First chunk received.');
                        if (!removed) {
                             console.warn("Could not verify and remove status message at expected location, proceeding anyway.");
                        }

                        // 2. Determine prefix for separator
                        const contentBeforeStatus = editor.getRange({ line: 0, ch: 0 }, statusMessageStartPos);
                        let prefix = '';
                        if (contentBeforeStatus.endsWith('\n')) {
                            prefix = '\n';
                        } else if (contentBeforeStatus.length > 0) {
                            prefix = '\n\n';
                        }

                        // 3. Insert separator
                        const initialSeparatorInsertion = `${prefix}${settings.chatSeparator}\n\n`;
                        editor.replaceRange(initialSeparatorInsertion, statusMessageStartPos, statusMessageStartPos); // Insert at original start pos
                        currentInsertPos = editor.offsetToPos(editor.posToOffset(statusMessageStartPos) + initialSeparatorInsertion.length);

                        // 4. Insert the first chunk
                        editor.replaceRange(chunk, currentInsertPos, currentInsertPos);
                        lastPosition = editor.offsetToPos(editor.posToOffset(currentInsertPos) + chunk.length);
                        isFirstChunk = false; // Mark first chunk as processed

                    } else {
                        if (!lastPosition) {
                             throw new Error("Internal state error: lastPosition not set after first chunk.");
                        }
                        const from = lastPosition;
                        const to = lastPosition;
                        editor.replaceRange(chunk, from, to);
                        lastPosition = editor.offsetToPos(editor.posToOffset(from) + chunk.length);
                    }

                    // Scroll into view if enabled
                    if (settings.enableViewportScrolling && lastPosition) {
                        editor.scrollIntoView({ from: lastPosition, to: lastPosition }, true);
                    }
                }
            } // End for await loop

            // --- After Stream Completion ---
            if (!isFirstChunk && lastPosition && currentInsertPos) { // Ensure stream actually inserted content
                 // Content was added by the stream. Append the final separator and position cursor.
                 const finalSuffix = `\n\n${settings.chatSeparator}\n\n`;
                 editor.replaceRange(finalSuffix, lastPosition, lastPosition);
                 const finalCursorPos = editor.offsetToPos(editor.posToOffset(lastPosition) + finalSuffix.length);
                 editor.setCursor(finalCursorPos);
            } else if (isFirstChunk) {
                 // Stream finished, but no chunks were received. Status message might still be there.
                 this.removeStatusMessageAtPos(editor, settings, statusMessageStartPos, statusMessageEndPos, 'Stream ended with no content.');
                 editor.setCursor(statusMessageStartPos); // Place cursor where status message was
            } else if (lastPosition && currentInsertPos) {
                 // Stream finished, content was received, but the check failed? (Shouldn't happen often)
                 // Place cursor at the end of the received content.
                 console.warn("Stream finished, content likely received, placing cursor at end of content.");
                 editor.setCursor(lastPosition);
            } else {
                 // Fallback if state is unexpected
                 console.error("Stream finished in an unexpected state. Placing cursor at status message start position.");
                 editor.setCursor(statusMessageStartPos);
            }

        } catch (error: any) {
            console.error('Error during chat stream orchestration:', error);
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

            // If the error occurred before the first chunk was processed, remove the status message
            if (isFirstChunk) {
                console.log("Error occurred before first chunk, attempting status message cleanup.");
                this.removeStatusMessageAtPos(editor, settings, statusMessageStartPos, statusMessageEndPos, `Error/Cancel occurred: ${reason}`);
            } else {
                 console.log("Error occurred after first chunk, status message should already be removed.");
            }

        } finally {
            this.activeStreams.delete(notePath);
            console.log(`Removed active stream tracker for note: ${notePath}`);
        }
    }


    /**
     * Attempts to remove the status message at a specific location.
     * @param editor The editor instance.
     * @param settings Plugin settings to get the model name.
     * @param startPos The expected start position of the status message.
     * @param endPos The expected end position of the status message.
     * @param reason Optional reason for removal logging.
     * @returns True if the message was found and removed, false otherwise.
     */
    private removeStatusMessageAtPos(editor: Editor, settings: PluginSettings, startPos: EditorPosition, endPos: EditorPosition, reason?: string): boolean {
        const modelName = settings.defaultModel || 'default model';
        const expectedStatus = `Calling ${modelName}...`;
        let removed = false;

        try {
            const currentText = editor.getRange(startPos, endPos);
            if (currentText === expectedStatus || currentText === `${expectedStatus}\n`) {
                editor.replaceRange('', startPos, endPos);
                removed = true;
            }
        } catch (e) {
            console.error("Error removing status message range:", e, { start: startPos, end: endPos, reason: reason });
        }
        return removed;
    }


    /**
     * Checks if a stream is currently active for the given file path.
     * @param filePath The path of the file.
     * @returns True if a stream is active, false otherwise.
     */
    isStreamActive(filePath: string): boolean {
        return this.activeStreams.has(filePath);
    }

    /**
     * Cancels an active chat stream for a given note.
     * @param filePath The path of the note whose chat should be cancelled.
     * @returns True if a stream was found and cancelled, false otherwise.
     */
    cancelStream(filePath: string, editor: Editor, settings: PluginSettings): boolean {
        const streamInfo = this.activeStreams.get(filePath);
        if (streamInfo) {
            console.log(`Attempting to cancel chat stream for note: ${filePath}`);
            const reason = "Chat cancelled by user action.";
            streamInfo.controller.abort(reason);

            // Attempt to clean up the status message using stored positions
            console.log(`Attempting status message cleanup for cancelled stream: ${filePath}`);
            this.removeStatusMessageAtPos(editor, settings, streamInfo.statusStartPos, streamInfo.statusEndPos, reason);

            this.activeStreams.delete(filePath); // Ensure removal
            console.log(`Stream cancelled and removed from active streams for: ${filePath}`);
            new Notice(reason);
            return true;
        } else {
            console.log(`No active chat stream found to cancel for note: ${filePath}`);
            return false;
        }
    }
}
