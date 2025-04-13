import { Notice, Plugin, Editor, TFile, EditorPosition } from 'obsidian'; // Removed requestUrl, OPENROUTER_API_URL, Added EditorPosition
import { PluginSettings, ChatMessage } from './types';
import { CHAT_SEPARATOR, COMMAND_PHRASES } from './constants'; // Removed OPENROUTER_API_URL
import { OpenRouterService } from './OpenRouterService'; // Import OpenRouterService

export class ChatService {
    private plugin: Plugin;
    private openRouterService: OpenRouterService; // Add OpenRouterService instance
    private activeStreams: Map<string, AbortController> = new Map(); // Key: note path

    constructor(plugin: Plugin, openRouterService: OpenRouterService) {
        this.plugin = plugin;
        this.openRouterService = openRouterService; // Store injected service
    }

    /**
     * Parses the raw note content into an array of ChatMessages.
     * Filters out separators, command phrases, and potential status messages.
     * @param content The raw string content of the note.
     * @param separator The separator used to divide messages.
     * @returns An array of ChatMessage objects.
     */
    private parseNoteContent(content: string, separator: string): ChatMessage[] {
        // Split by separator, trim whitespace, and filter empty parts
        const parts = content.split(separator)
                             .map(part => part.trim())
                             .filter(part => part.length > 0);

        const messages: ChatMessage[] = [];
        let currentRole: 'user' | 'assistant' = 'user'; // Start assuming user input

        for (const part of parts) {
            // Simple check: if it contains "Calling [...]..." assume it's a status msg and skip
             if (part.startsWith('Calling ') && part.endsWith('...')) {
                 console.log(`Skipping potential status message during parsing: "${part}"`);
                 continue;
             }
             // Skip known command phrases if they appear alone (e.g., after a separator)
             if (COMMAND_PHRASES.includes(part.toLowerCase())) {
                 console.log(`Skipping command phrase during parsing: "${part}"`);
                 continue;
             }

            messages.push({ role: currentRole, content: part });
            // Alternate roles for the next valid message block
            currentRole = currentRole === 'user' ? 'assistant' : 'user';
        }

         // No longer enforcing last message role based on feedback
         if (messages.length === 0) {
              console.log("Parsing resulted in zero messages. Ensure note content is structured correctly with separators.");
         }
        return messages;
    }


    /**
     * Orchestrates the chat process: parses content, calls OpenRouterService for streaming,
     * and updates the editor in real-time.
     * @param _noteContent The content of the note *before* the "Calling..." status was added. Not directly used for API call.
     * @param editor The editor instance where the command was triggered.
     * @param file The file associated with the editor.
     * @param settings The current plugin settings.
     */
    async startChat(_noteContent: string, editor: Editor, file: TFile, settings: PluginSettings): Promise<void> {
        const { apiKey, defaultModel } = settings;
        const notePath = file.path;

        // --- Pre-checks ---
        if (!apiKey) {
            new Notice('OpenRouter API key is not set. Please configure it in the plugin settings.');
            return this.removeCallingStatus(editor, settings, 'API key not set.');
        }
        if (!defaultModel) {
            new Notice('Default model is not set. Please configure it in the plugin settings.');
            return this.removeCallingStatus(editor, settings, 'Default model not set.');
        }
        if (this.activeStreams.has(notePath)) {
            new Notice(`Chat stream already active for note: ${notePath}. Please wait or cancel.`);
            console.log(`Chat stream already active for note: ${notePath}. Ignoring new request.`);
            return;
        }

        // --- Prepare for API Call ---
        const currentFullContent = editor.getValue();
        const statusMessageBase = `Calling ${settings.defaultModel || 'default model'}...`;
        // Get content before the status message for the API history
        const { contentForApi } = this.getContentBeforeStatus(currentFullContent, statusMessageBase);

        const messages = this.parseNoteContent(contentForApi.trim(), CHAT_SEPARATOR);

        if (messages.length === 0) {
            new Notice('No valid chat content found to send.');
            return this.removeCallingStatus(editor, settings, 'No content found.');
        }

        // --- Setup Abort Controller ---
        const abortController = new AbortController();
        this.activeStreams.set(notePath, abortController);

        let statusRemoved = false;
        let initialInsertPos: EditorPosition | null = null; // Position where status was removed

        try {
            console.log(`Starting chat stream for note: ${notePath} with model: ${defaultModel}`);

            // --- Remove Status &amp; Add Initial Separator ---
            const statusInfo = this.findAndRemoveStatusMessage(editor, settings);
            if (statusInfo) {
                statusRemoved = true;
                initialInsertPos = statusInfo.startPos; // Position where status *started*
                console.log("Removed status message, initial insertion point:", initialInsertPos);

                // Determine if content before status was just whitespace
                const contentBeforeStatus = editor.getRange({line: 0, ch: 0}, initialInsertPos).trim();
                const initialSeparator = contentBeforeStatus.length > 0 ? `\n\n${CHAT_SEPARATOR}\n\n` : `${CHAT_SEPARATOR}\n\n`; // Add extra newline if needed

                editor.replaceRange(initialSeparator, initialInsertPos, initialInsertPos);

                // Calculate position *after* the separator for the first chunk
                let currentInsertPos = editor.offsetToPos(editor.posToOffset(initialInsertPos) + initialSeparator.length);
                console.log("Added initial separator, first chunk insert pos:", currentInsertPos);
                let lastPosition = currentInsertPos; // Track position for appending subsequent chunks

                // --- Call OpenRouterService to get the stream generator ---
                // **ASSUMPTION:** OpenRouterService has a method like this:
                // streamChatCompletion(messages: ChatMessage[], settings: PluginSettings, signal: AbortSignal): AsyncGenerator<string>
                const streamGenerator = this.openRouterService.streamChatCompletion(
                    messages,
                    settings,
                    abortController.signal
                );

                // --- Process Stream Chunks ---
                for await (const chunk of streamGenerator) {
                    // No need to check signal here, generator should handle it
                    if (chunk) {
                        const from = lastPosition;
                        const to = lastPosition;
                        editor.replaceRange(chunk, from, to);
                        // Update lastPosition to the end of the inserted chunk
                        lastPosition = editor.offsetToPos(editor.posToOffset(from) + chunk.length);
                    }
                } // AsyncGenerator completes or throws

                // --- Add Final Separator ---
                 // Only add if content was actually received (positions changed)
                 if (editor.posToOffset(currentInsertPos) !== editor.posToOffset(lastPosition)) {
                    const finalSeparator = `\n\n${CHAT_SEPARATOR}\n\n`;
                    editor.replaceRange(finalSeparator, lastPosition, lastPosition);
                    // Calculate final cursor position *after* the separator block
                    const finalCursorPos = editor.offsetToPos(editor.posToOffset(lastPosition) + finalSeparator.length);
                    editor.setCursor(finalCursorPos);
                    console.log("Added final separator, final cursor pos:", finalCursorPos);
                } else {
                     // No content was added, just place cursor back where status was removed + initial separator
                     editor.setCursor(currentInsertPos); // Position after initial separator
                     console.log("No content received from stream. Cursor set after initial separator.");
                }

            } else {
                // Status message wasn't found - this is unexpected in the normal flow
                console.error("CRITICAL: Could not find status message. Cannot proceed with stream insertion reliably.");
                new Notice("Error: Could not find status message to replace.");
                // Don't proceed if status wasn't found, as insertion points are unknown
                throw new Error("Status message not found, aborting stream processing.");
            }

        } catch (error: any) {
            console.error('Error during chat stream orchestration:', error);
            // Determine the reason, prioritizing AbortSignal.reason if available
            const reason = (error instanceof DOMException && error.name === 'AbortError')
                           ? (abortController.signal.reason || 'Chat cancelled') // Use signal.reason if provided
                           : (error.message || 'Unknown stream error'); // Corrected ternary

            if (error.name === 'AbortError') {
                new Notice(`Chat request cancelled: ${reason}`);
            } else {
                 // Handle API errors or other exceptions from the generator/service
                 new Notice(`Chat error: ${reason}`);
            }

            // Attempt to remove status message if it wasn't already removed (e.g., error before stream start)
            if (!statusRemoved) {
                this.removeCallingStatus(editor, settings, `Error/Cancel occurred: ${reason}`);
            }
            // Optional: Add an error marker in the note where processing stopped
            // const errorMarker = `\n\n[STREAM ERROR: ${reason}]\n\n`;
            // const errorPos = initialInsertPos ?? editor.offsetToPos(editor.getValue().length); // Insert where status was or at end
            // if (errorPos) editor.replaceRange(errorMarker, errorPos);

        } finally {
            // Clean up the active stream tracker regardless of success or failure
            this.activeStreams.delete(notePath);
            console.log(`Removed active stream tracker for note: ${notePath}`);
        }
    }

    /**
     * Finds the status message and returns the content before it.
     * @param currentFullContent The complete current content of the editor.
     * @param statusMessageBase The status message text without trailing newline (e.g., "Calling model...").
     * @returns Object containing content before the status and whether status was found.
     */
    private getContentBeforeStatus(currentFullContent: string, statusMessageBase: string): { contentForApi: string, statusFound: boolean } {
        let statusMessageIndex = -1;
        const statusWithNewline = statusMessageBase + '\n';
        const idxWithNewline = currentFullContent.lastIndexOf(statusWithNewline);

        // Heuristic: Check if the status message is reasonably close to the end
        const searchThreshold = 150; // How many characters from the end to search within
        const searchStartOffset = Math.max(0, currentFullContent.length - searchThreshold);

        if (idxWithNewline !== -1 && idxWithNewline >= searchStartOffset) {
            statusMessageIndex = idxWithNewline;
        }
        // If not found with newline near the end, check if it's the *exact* end of the file without newline
        else if (currentFullContent.endsWith(statusMessageBase)) {
             // Check if the potential match starts within the search threshold from the end
             const potentialIndex = currentFullContent.length - statusMessageBase.length;
             if (potentialIndex >= searchStartOffset) {
                 statusMessageIndex = potentialIndex;
             }
        }

        const contentForApi = statusMessageIndex > -1
            ? currentFullContent.substring(0, statusMessageIndex)
            : currentFullContent; // Fallback: use everything if status not found near end

        return { contentForApi, statusFound: statusMessageIndex > -1 };
    }


    /**
     * Finds and removes the "Calling {model}..." status message from the editor.
     * Handles cases with or without a trailing newline, prioritizing matches near the end.
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

        // Prioritize finding the message with a newline near the end
        const statusWithNewline = statusMessageBase + '\n';
        const idxWithNewline = currentFullContent.lastIndexOf(statusWithNewline);
        const searchThreshold = 150;
        // Correctly get offset for end of file to calculate search start offset
        const lastLineNum = editor.lastLine();
        const lastLineLength = editor.getLine(lastLineNum).length;
        const endOfFileOffset = editor.posToOffset({ line: lastLineNum, ch: lastLineLength });
        const searchStartOffsetEditor = Math.max(0, endOfFileOffset - searchThreshold);


        if (idxWithNewline !== -1) {
             // Convert index to EditorPosition to compare lines/offsets more reliably if needed,
             // but simple index check against threshold offset is often sufficient.
             const statusOffset = idxWithNewline;
             if (statusOffset >= searchStartOffsetEditor) {
                statusMessageIndex = idxWithNewline;
                statusMessageActual = statusWithNewline;
             }
        }

        // Fallback: check if it's the *exact* end of the file without newline
        if (statusMessageIndex === -1 && currentFullContent.endsWith(statusMessageBase)) { // Corrected &amp;&amp;
             const potentialIndex = currentFullContent.length - statusMessageBase.length;
             // Check if this potential match starts within the threshold from the end
             if (potentialIndex >= searchStartOffsetEditor) {
                 statusMessageIndex = potentialIndex;
                 statusMessageActual = statusMessageBase;
             }
        }

        // If found near the end, attempt removal
        if (statusMessageIndex > -1) {
            const statusStartPos = editor.offsetToPos(statusMessageIndex);
            const statusEndPos = editor.offsetToPos(statusMessageIndex + statusMessageActual.length);
            try {
                editor.replaceRange('', statusStartPos, statusEndPos);
                console.log(`Removed status message "${statusMessageActual.replace('\n', '\\n')}" starting at [${statusStartPos.line}, ${statusStartPos.ch}]`);
                return { startPos: statusStartPos, endPos: statusEndPos }; // Return start position for insertion
            } catch (e) {
                 console.error("Error removing status message range:", e, {start: statusStartPos, end: statusEndPos});
                 return null; // Failed to remove
            }
        } else {
            console.warn(`Status message "Calling ${modelName}..." not found near the end for removal.`);
            return null; // Not found near the end
        }
    }

     /**
      * Helper to attempt removing the status message, used during error/cancellation cleanup.
      */
     private removeCallingStatus(editor: Editor, settings: PluginSettings, reason?: string): void {
         console.log(`Attempting to remove status message. Reason: ${reason || 'N/A'}`);
         this.findAndRemoveStatusMessage(editor, settings); // Call the main removal logic
     }

    /**
     * Cancels an active chat stream for a given note by aborting its controller.
     * The actual cleanup and user notification happen in the startChat catch/finally blocks.
     * @param notePath The path of the note whose chat should be cancelled.
     */
    cancelChat(notePath: string): void {
        const controller = this.activeStreams.get(notePath);
        if (controller) {
            console.log(`Attempting to cancel chat stream for note: ${notePath}`);
            // Provide a reason for cancellation, accessible via signal.reason in the catch block
            controller.abort("Chat cancelled by user action.");
        } else {
            console.log(`No active chat stream found to cancel for note: ${notePath}`);
            // Show notice here if no stream was found to cancel
            new Notice(`No active chat found for ${notePath}.`);
        }
    }
}