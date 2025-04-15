import { Notice, Plugin, Editor, TFile, EditorPosition } from 'obsidian';
import { PluginSettings, ChatMessage } from './types';
import { OpenRouterService } from './OpenRouterService';

export class ChatService {
    private plugin: Plugin;
    private openRouterService: OpenRouterService;
    private activeStreams: Map<string, AbortController> = new Map(); // Key: note path

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
     */
    async startChat(_noteContent: string, editor: Editor, file: TFile, settings: PluginSettings): Promise<void> {
        const notePath = file.path;

        if (this.activeStreams.has(notePath)) {
            new Notice(`Chat stream already active for note: ${notePath}. Please wait or cancel.`);
            console.log(`Chat stream already active for note: ${notePath}. Ignoring new request.`);
            return;
        }

        const currentFullContent = editor.getValue();
        const statusMessageBase = `Calling ${settings.defaultModel || 'default model'}...`;
        const { contentForApi } = this.getContentBeforeStatus(currentFullContent, statusMessageBase);

        const messages = this.parseNoteContent(contentForApi.trim(), settings.chatSeparator);

        if (messages.length === 0) {
            new Notice('No content was found in the note.');
            return this.removeCallingStatus(editor, settings, 'No content found.');
        }

        const abortController = new AbortController();
        this.activeStreams.set(notePath, abortController);

        let statusRemoved = false;
        let initialInsertPos: EditorPosition | null = null;

        try {
            const statusInfo = this.findAndRemoveStatusMessage(editor, settings);
            if (statusInfo) {
                statusRemoved = true;
                initialInsertPos = statusInfo.startPos;
                console.log("Removed status message, initial insertion point:", initialInsertPos);
                const contentBeforeStatus = editor.getRange({line: 0, ch: 0}, initialInsertPos).trim();
                const initialSeparator = contentBeforeStatus.length > 0 ? `\n\n${settings.chatSeparator}\n\n` : `${settings.chatSeparator}\n\n`;

                editor.replaceRange(initialSeparator, initialInsertPos, initialInsertPos);

                let currentInsertPos = editor.offsetToPos(editor.posToOffset(initialInsertPos) + initialSeparator.length);
                console.log("Added initial separator, first chunk insert pos:", currentInsertPos);
                let lastPosition = currentInsertPos;
                const streamGenerator = this.openRouterService.streamChatCompletion(
                    messages,
                    settings,
                    abortController.signal
                );

                for await (const chunk of streamGenerator) {
                    if (chunk) {
                        const from = lastPosition;
                        const to = lastPosition;
                        editor.replaceRange(chunk, from, to);
                        lastPosition = editor.offsetToPos(editor.posToOffset(from) + chunk.length);
                        if (settings.enableViewportScrolling) {
                            editor.scrollIntoView({ from: lastPosition, to: lastPosition }, true);
                        }
                    }
                }
                 if (editor.posToOffset(currentInsertPos) !== editor.posToOffset(lastPosition)) {
                    const finalSeparator = `\n\n${settings.chatSeparator}\n\n`;
                    editor.replaceRange(finalSeparator, lastPosition, lastPosition);
                    const finalCursorPos = editor.offsetToPos(editor.posToOffset(lastPosition) + finalSeparator.length);
                    editor.setCursor(finalCursorPos);
                    console.log("Added final separator, final cursor pos:", finalCursorPos);
                } else {
                     editor.setCursor(currentInsertPos);
                     console.log("No content received from stream. Cursor set after initial separator.");
                }

            } else {
                console.error("CRITICAL: Could not find status message. Cannot proceed with stream insertion reliably.");
                new Notice("Error: Could not find status message to replace.");
                throw new Error("Status message not found, aborting stream processing.");
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
                // Check for specific configuration errors thrown by OpenRouterService
                if (reason.includes("API key") || reason.includes("default model")) {
                    noticeMessage = `Configuration error: ${reason}. Please check plugin settings.`;
                } else {
                    noticeMessage = `Chat error: ${reason}`;
                }
            } else {
                 // Handle non-Error objects if necessary
                 reason = String(error);
                 noticeMessage = `Chat error: ${reason}`;
            }

            new Notice(noticeMessage);

            if (!statusRemoved) {
                this.removeCallingStatus(editor, settings, `Error/Cancel occurred: ${reason}`);
            }

        } finally {
            this.activeStreams.delete(notePath);
            console.log(`Removed active stream tracker for note: ${notePath}`);
        }
    }

    /**
     * Extracts content before the status message.
     * @param currentFullContent The complete current content of the editor.
     * @param statusMessageBase The status message text without trailing newline.
     * @returns Object containing content before the status and whether status was found.
     */
    private getContentBeforeStatus(currentFullContent: string, statusMessageBase: string): { contentForApi: string, statusFound: boolean } {
        let statusMessageIndex = -1;
        const statusWithNewline = statusMessageBase + '\n';
        const idxWithNewline = currentFullContent.lastIndexOf(statusWithNewline);

        const searchThreshold = 150;
        const searchStartOffset = Math.max(0, currentFullContent.length - searchThreshold);

        if (idxWithNewline !== -1 && idxWithNewline >= searchStartOffset) {
            statusMessageIndex = idxWithNewline;
        }
        else if (currentFullContent.endsWith(statusMessageBase)) {
             const potentialIndex = currentFullContent.length - statusMessageBase.length;
             if (potentialIndex >= searchStartOffset) {
                 statusMessageIndex = potentialIndex;
             }
        }

        const contentForApi = statusMessageIndex > -1
            ? currentFullContent.substring(0, statusMessageIndex)
            : currentFullContent;

        return { contentForApi, statusFound: statusMessageIndex > -1 };
    }


    /**
     * Removes the "Calling {model}..." status message from the editor.
     * @param editor The editor instance.
     * @param settings Plugin settings to get the model name.
     * @returns The start position where the message was found and removed, or null if not found.
     */
    private findAndRemoveStatusMessage(editor: Editor, settings: PluginSettings): { startPos: EditorPosition, endPos: EditorPosition } | null {
        const currentFullContent = editor.getValue();
        const modelName = settings.defaultModel || 'default model';
        const statusMessageBase = `Calling ${modelName}...`;

        let statusMessageIndex = -1;
        let statusMessageActual = '';

        const statusWithNewline = statusMessageBase + '\n';
        const idxWithNewline = currentFullContent.lastIndexOf(statusWithNewline);
        const searchThreshold = 150;
        const lastLineNum = editor.lastLine();
        const lastLineLength = editor.getLine(lastLineNum).length;
        const endOfFileOffset = editor.posToOffset({ line: lastLineNum, ch: lastLineLength });
        const searchStartOffsetEditor = Math.max(0, endOfFileOffset - searchThreshold);


        if (idxWithNewline !== -1) {
             const statusOffset = idxWithNewline;
             if (statusOffset >= searchStartOffsetEditor) {
                statusMessageIndex = idxWithNewline;
                statusMessageActual = statusWithNewline;
             }
        }

        if (statusMessageIndex === -1 && currentFullContent.endsWith(statusMessageBase)) {
             const potentialIndex = currentFullContent.length - statusMessageBase.length;
             if (potentialIndex >= searchStartOffsetEditor) {
                 statusMessageIndex = potentialIndex;
                 statusMessageActual = statusMessageBase;
             }
        }

        if (statusMessageIndex > -1) {
            const statusStartPos = editor.offsetToPos(statusMessageIndex);
            const statusEndPos = editor.offsetToPos(statusMessageIndex + statusMessageActual.length);
            try {
                editor.replaceRange('', statusStartPos, statusEndPos);
                console.log(`Removed status message "${statusMessageActual.replace('\n', '\\n')}" starting at [${statusStartPos.line}, ${statusStartPos.ch}]`);
                return { startPos: statusStartPos, endPos: statusEndPos };
            } catch (e) {
                 console.error("Error removing status message range:", e, {start: statusStartPos, end: statusEndPos});
                 return null;
            }
        } else {
            console.warn(`Status message "Calling ${modelName}..." not found near the end for removal.`);
            return null;
        }
    }

     /**
      * Removes status message during error/cancellation.
      */
     private removeCallingStatus(editor: Editor, settings: PluginSettings, reason?: string): void {
         console.log(`Attempting to remove status message. Reason: ${reason || 'N/A'}`);
         this.findAndRemoveStatusMessage(editor, settings);
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
    cancelStream(filePath: string): boolean {
        const controller = this.activeStreams.get(filePath);
        if (controller) {
            console.log(`Attempting to cancel chat stream for note: ${filePath}`);
            controller.abort("Chat cancelled by user action."); // Reason can be customized later if needed
            this.activeStreams.delete(filePath); // Ensure removal even if finally block hasn't run
            console.log(`Stream cancelled and removed from active streams for: ${filePath}`);
            return true;
        } else {
            console.log(`No active chat stream found to cancel for note: ${filePath}`);
            return false;
        }
    }
}
