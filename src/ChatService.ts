import { Notice, Plugin, Editor, TFile, EditorPosition } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';
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
    private activeStreams: Map<string, ActiveStreamInfo> = new Map();

    constructor(plugin: Plugin, openRouterService: OpenRouterService) {
        this.plugin = plugin;
        this.openRouterService = openRouterService;
    }

    /**
     * Parses note content into ChatMessages up to a given position, respecting boundary markers.
     */
    private parseNoteContent(fullContent: string, separator: string, parseUntilOffset: number): ChatMessage[] {
        const relevantContent = fullContent.substring(0, parseUntilOffset);

        // Find boundary marker (^^^) - content above this marker is ignored during parsing
        const escapedMarker = CHAT_BOUNDARY_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const boundaryRegex = new RegExp('(?:^|\\n)\\s*' + escapedMarker + '\\s*(?=\\n|$)', 'g');

        let lastMatch: RegExpExecArray | null = null;
        let currentMatch: RegExpExecArray | null;
        while ((currentMatch = boundaryRegex.exec(relevantContent)) !== null) {
            lastMatch = currentMatch;
        }

        let contentToParse: string;
        if (lastMatch) {
            const startIndex = lastMatch.index + lastMatch[0].length;
            contentToParse = relevantContent.substring(startIndex);
            log.debug(`Found last chat boundary marker "${CHAT_BOUNDARY_MARKER}" ending at index ${startIndex -1}. Parsing content after marker up to offset ${parseUntilOffset}.`);
        } else {
            contentToParse = relevantContent;
        }

        const parts = contentToParse.split(separator)
                                    .map(part => part.trim())
                                    .filter(part => part.length > 0);

        // Messages alternate user -> assistant -> user based on separator splits
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
     * Inserts text ensuring proper line boundaries for chat messages.
     * @returns Start and end positions of the inserted text.
     */
    private insertTextAtPos(editor: Editor, text: string, pos: EditorPosition): [EditorPosition, EditorPosition] {
        const currentOffset = editor.posToOffset(pos);
        const docValue = editor.getValue();
        let textToInsert = text;

        if (currentOffset > 0 && docValue[currentOffset - 1] !== '\n') {
            textToInsert = '\n' + textToInsert;
        }
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
     * Orchestrates the complete chat flow: status message, API call, streaming response.
     * Handles streaming lifecycle, cancellation, and proper message formatting.
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

        const statusMessage = `Calling ${settings.defaultModel}...`;
        const [actualStatusStartPos, actualStatusEndPos] = this.insertTextAtPos(editor, statusMessage, insertionPos);
        log.debug(`Inserted status message from [${actualStatusStartPos.line}, ${actualStatusStartPos.ch}] to [${actualStatusEndPos.line}, ${actualStatusEndPos.ch}]`);
        editor.setCursor(actualStatusEndPos);

        // Parse content before the status message to build conversation history
        const parseUntilOffset = editor.posToOffset(actualStatusStartPos);
        const messages = this.parseNoteContent(editor.getValue(), settings.chatSeparator, parseUntilOffset);

        if (messages.length === 0) {
            new Notice('No content found before the chat initiation point.');
            this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, 'No content found.');
            editor.setCursor(actualStatusStartPos);
            return;
        }

        // Track stream for cancellation and cleanup
        const abortController = new AbortController();
        this.activeStreams.set(notePath, {
            controller: abortController,
            statusStartPos: actualStatusStartPos,
            statusEndPos: actualStatusEndPos
        });

        let isFirstChunk = true;
        let currentInsertPos: EditorPosition | null = null;
        let lastPosition: EditorPosition | null = null;

        try {
            const streamGenerator = this.openRouterService.streamChatCompletion(
                messages,
                settings,
                abortController.signal
            );

            for await (const chunk of streamGenerator) {
                if (chunk) {
                    if (isFirstChunk) {
                        // Critical first-chunk timing: Remove status message BEFORE inserting separator
                        // to avoid orphaned status text if separator insertion fails. The status message
                        // must be removed atomically before any response content appears.
                        this.removeStatusMessageAtPos(editor, settings,
                            actualStatusStartPos, actualStatusEndPos, 'First chunk received.');

                        // Insert separator at original status position to maintain conversation structure
                        currentInsertPos = this.insertSeparatorWithSpacing(
                            editor,
                            actualStatusStartPos,
                            settings.chatSeparator
                        );

                        editor.replaceRange(chunk, currentInsertPos, currentInsertPos);
                        lastPosition = editor.offsetToPos(
                            editor.posToOffset(currentInsertPos) + chunk.length
                        );
                        isFirstChunk = false;
                    } else {
                        if (!lastPosition) {
                            throw new Error("Internal state error: lastPosition not set after first chunk.");
                        }
                        editor.replaceRange(chunk, lastPosition, lastPosition);
                        lastPosition = editor.offsetToPos(
                            editor.posToOffset(lastPosition) + chunk.length
                        );
                    }

                }
            }

            // Stream completion: Handle edge cases for proper conversation structure
            if (!isFirstChunk && lastPosition) {
                // Normal completion: add trailing separator and position for next user input
                lastPosition = this.insertSeparatorWithSpacing(
                    editor,
                    lastPosition,
                    settings.chatSeparator
                );
                editor.setCursor(lastPosition);
            } else if (isFirstChunk) {
                // Edge case: stream ended without any chunks (empty response)
                this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, 'Stream ended with no content.');
                editor.setCursor(actualStatusStartPos);
                new Notice("Chat completed with no response.");
            } else if (lastPosition) {
                // Edge case: content received but no final separator needed
                 log.warn("Stream finished, content likely received, placing cursor at end of content.");
                 editor.setCursor(lastPosition);
            } else {
                // Edge case: unexpected state - failsafe cursor positioning
                 log.error("Stream finished in an unexpected state. Placing cursor at status message start position.");
                 editor.setCursor(actualStatusStartPos);
            }
        } catch (error: any) {
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

            // Error recovery: Clean up status message only if stream never started
            // Once first chunk is processed, status message is already removed
            if (isFirstChunk) {
                log.debug("Error occurred before first chunk, attempting status message cleanup.");
                this.removeStatusMessageAtPos(editor, settings, actualStatusStartPos, actualStatusEndPos, `Error/Cancel occurred: ${reason}`);
                editor.setCursor(actualStatusStartPos);
            } else {
                // Stream was active - status already removed, no cleanup needed
                 log.debug("Error occurred after first chunk, status message should already be removed.");
            }
        } finally {
            this.activeStreams.delete(notePath);
            log.debug(`Removed active stream tracker for note: ${notePath}`);
        }
    }


    /**
     * Removes the temporary status message, with validation to ensure we're removing the right content.
     */
    private removeStatusMessageAtPos(editor: Editor, settings: PluginSettings, startPos: EditorPosition | undefined, endPos: EditorPosition | undefined, reason?: string): boolean {
        if (!startPos || !endPos) {
            log.warn("Attempted to remove status message but positions were undefined.", { reason });
            return false;
        }

        const expectedStatusBase = `Calling ${settings.defaultModel}...`;
        let removed = false;

        try {
             if (editor.posToOffset(startPos) >= editor.posToOffset(endPos)) {
                 log.warn("Invalid range for status message removal (start >= end).", { start: startPos, end: endPos, reason });
                 return false;
             }

            const currentText = editor.getRange(startPos, endPos).trim();

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
     * Inserts chat separator with proper newline spacing based on context.
     */
    private insertSeparatorWithSpacing(
        editor: Editor,
        pos: EditorPosition,
        separator: string
    ): EditorPosition {
        let currentOffset = editor.posToOffset(pos);
        const docLength = editor.getValue().length;
        const originalValue = editor.getValue();

        while (currentOffset < docLength && originalValue[currentOffset] === '\n') {
            currentOffset++;
        }
        const adjustedPos = editor.offsetToPos(currentOffset);

        // Determine spacing: need proper newlines for separator isolation
        let prefix = '\n\n';
        if (currentOffset === 0) {
            prefix = '';
        } else if (currentOffset > 0 && originalValue[currentOffset - 1] === '\n') {
             prefix = '\n';
        }

        const suffix = '\n\n';
        const block = `${prefix}${separator}${suffix}`;

        editor.replaceRange(block, adjustedPos, adjustedPos);
        return editor.offsetToPos(currentOffset + block.length);
    }


    isStreamActive(filePath: string): boolean {
        return this.activeStreams.has(filePath);
    }

    cancelStream(filePath: string, editor: Editor, settings: PluginSettings): boolean {
        const streamInfo = this.activeStreams.get(filePath);
        if (streamInfo) {
            log.debug(`Attempting to cancel chat stream for note: ${filePath}`);
            const reason = "Chat cancelled by user action.";
            streamInfo.controller.abort(reason);

            log.debug(`Attempting status message cleanup for cancelled stream: ${filePath}`);
            const removed = this.removeStatusMessageAtPos(editor, settings, streamInfo.statusStartPos, streamInfo.statusEndPos, reason);
            if (removed) {
                 editor.setCursor(streamInfo.statusStartPos);
            }

            this.activeStreams.delete(filePath);
            log.debug(`Stream cancelled and removed from active streams for: ${filePath}`);
            new Notice(reason);
            return true;
        } else {
            log.debug(`No active chat stream found to cancel for note: ${filePath}`);
            return false;
        }
    }
}
