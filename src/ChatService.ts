import { requestUrl, Notice, Plugin, Editor, TFile, EditorPosition } from 'obsidian'; // Added Editor, TFile, EditorPosition
import { PluginSettings, ChatMessage } from './types';
import { CHAT_SEPARATOR, COMMAND_PHRASES, OPENROUTER_API_URL } from './constants';

export class ChatService {
    private plugin: Plugin; // Assuming we need the whole plugin instance for now
    private activeStreams: Map<string, AbortController> = new Map(); // Key: note path

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    /**
     * Parses the raw note content into an array of ChatMessages.
     * Filters out separators and command phrases.
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

        // Ensure the last message is from the user for the API call
        // If the last message was assistant, it means the user hasn't added anything after the last AI response.
        // OpenRouter expects the last message to be from the 'user'.
        // We might need to adjust this logic based on how users interact with the chat.
        // For now, if the last is assistant, we log a warning but proceed.
        // A better approach might be to ensure EditorHandler only triggers 'cc'
        // when there's new user input after the last separator.
        if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
            console.warn("Last parsed message was from assistant. Ensure new user input exists before triggering chat.");
            // Option: Remove last assistant message? messages.pop();
            // Option: Add dummy user message? messages.push({ role: 'user', content: '' }); // Risky
        } else if (messages.length === 0) {
             console.log("Parsing resulted in zero messages. Ensure note content is structured correctly with separators.");
        }
        return messages;
    }


    /**
     * Initiates a chat completion request to the OpenRouter API and handles the streaming response.
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
            return this.removeCallingStatus(editor, settings, 'API key not set.'); // Attempt removal even on pre-check failure
        }
        if (!defaultModel) {
            new Notice('Default model is not set. Please configure it in the plugin settings.');
            return this.removeCallingStatus(editor, settings, 'Default model not set.'); // Attempt removal
        }
        if (this.activeStreams.has(notePath)) {
            new Notice(`Chat stream already active for note: ${notePath}. Please wait or cancel.`);
            console.log(`Chat stream already active for note: ${notePath}. Ignoring new request.`);
            return; // Don't remove status if another stream is active
        }

        // --- Prepare API Request ---
        // Get the *current* content and find the status message to isolate the actual chat history
        const currentFullContent = editor.getValue();
        const statusMessage = `Calling ${settings.defaultModel || 'default model'}...`; // Base message without newline for searching
        let statusMessageIndex = -1;
        let statusMessageLength = 0;

        const statusWithNewline = statusMessage + '\n';
        const idxWithNewline = currentFullContent.lastIndexOf(statusWithNewline);

        if (idxWithNewline !== -1) {
            statusMessageIndex = idxWithNewline;
            statusMessageLength = statusWithNewline.length;
        } else if (currentFullContent.endsWith(statusMessage)) {
            // Check if it's the very last thing without a newline
            statusMessageIndex = currentFullContent.length - statusMessage.length;
            statusMessageLength = statusMessage.length;
        }

        // If status message is found, parse content before it; otherwise, parse everything (fallback)
        const contentForApi = statusMessageIndex > -1
            ? currentFullContent.substring(0, statusMessageIndex)
            : currentFullContent;

        const messages = this.parseNoteContent(contentForApi.trim(), CHAT_SEPARATOR);

        if (messages.length === 0) {
            new Notice('No valid chat content found to send.');
            return this.removeCallingStatus(editor, settings, 'No content found.'); // Attempt removal
        }

        // Ensure the very last message sent is from the 'user'
        if (messages[messages.length - 1].role !== 'user') {
             new Notice('Error: Chat history must end with user input.');
             console.error("Chat history parsing error: Last message role is not 'user'. Aborting.", messages);
             return this.removeCallingStatus(editor, settings, 'Invalid final message role.');
        }


        const requestBody = {
            model: defaultModel,
            messages: messages,
            stream: true,
        };

        const abortController = new AbortController();
        this.activeStreams.set(notePath, abortController); // Track the stream

        let statusRemoved = false;
        let initialInsertPos: EditorPosition | null = null; // Position where status was removed

        try {
            console.log('Sending request to OpenRouter:', JSON.stringify(requestBody, null, 2));

            // Use fetch API for streaming support
            const response = await fetch(`${OPENROUTER_API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    // Add recommended headers if needed
                    // 'HTTP-Referer': 'app://obsidian.md', // Example
                    // 'X-Title': 'Obsidian Simple Note Chat', // Example
                },
                body: JSON.stringify(requestBody),
                signal: abortController.signal, // Link abort controller
            });

            console.log('OpenRouter API Response Status:', response.status);

            if (!response.ok) {
                // Handle non-200 responses before trying to stream
                const errorBody = await response.text();
                console.error('OpenRouter API Error:', response.status, errorBody);
                let specificError = `API request failed with status ${response.status}`;
                try {
                    const errorJson = JSON.parse(errorBody);
                    specificError += `: ${errorJson.error?.message || errorBody}`;
                } catch {
                    specificError += `: ${errorBody || response.statusText}`;
                }
                throw new Error(specificError);
            }

            if (!response.body) {
                throw new Error('Response body is null.');
            }

            // --- Start Processing Stream ---
            // 1. Remove "Calling..." status and get initial insertion position
            const statusInfo = this.findAndRemoveStatusMessage(editor, settings);
            if (statusInfo) {
                statusRemoved = true;
                initialInsertPos = statusInfo.startPos; // Store the position where status *started*
                console.log("Removed status message, initial insertion point:", initialInsertPos);

                // 2. Add initial separator (ensure it's not added if the content before status was empty or just whitespace)
                const contentBeforeStatus = editor.getRange({line: 0, ch: 0}, initialInsertPos).trim();
                const initialSeparator = contentBeforeStatus.length > 0 ? `\n\n${CHAT_SEPARATOR}\n\n` : `${CHAT_SEPARATOR}\n\n`; // Add extra newline if needed

                editor.replaceRange(initialSeparator, initialInsertPos, initialInsertPos);
                // Calculate position *after* the separator for the first chunk
                let currentInsertPos = editor.offsetToPos(editor.posToOffset(initialInsertPos) + initialSeparator.length);
                console.log("Added initial separator, first chunk insert pos:", currentInsertPos);

                // 3. Process the stream
                const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
                let buffer = '';
                let lastPosition = currentInsertPos; // Track position for appending subsequent chunks

                while (true) {
                    if (abortController.signal.aborted) {
                        console.log("Stream reading aborted by signal.");
                        reader.cancel("Aborted by user"); // Cancel the reader
                        // Throwing here was causing double notices/cleanup. Let it exit loop.
                        break; // Exit the loop cleanly
                    }

                    const { done, value } = await reader.read();
                    if (done) {
                        console.log('Stream finished.');
                        break;
                    }

                    buffer += value;

                    let endOfMessageIndex;
                    // Process all complete messages in the buffer
                    while ((endOfMessageIndex = buffer.indexOf('\n\n')) >= 0) {
                        const message = buffer.substring(0, endOfMessageIndex);
                        buffer = buffer.substring(endOfMessageIndex + 2); // Consume message and delimiter

                        if (message.startsWith('data: ')) {
                            const dataContent = message.substring(6).trim();
                            if (dataContent === '[DONE]') {
                                console.log('Received [DONE] signal.');
                                continue; // Process remaining buffer if any
                            }
                            try {
                                const jsonData = JSON.parse(dataContent);
                                // Standard OpenAI/OpenRouter format: choices[0].delta.content
                                // Handle potential variations or empty chunks gracefully
                                const chunk = jsonData.choices?.[0]?.delta?.content ?? '';
                                if (chunk) {
                                    const from = lastPosition;
                                    const to = lastPosition;
                                    editor.replaceRange(chunk, from, to);
                                    // Update lastPosition to the end of the inserted chunk
                                    lastPosition = editor.offsetToPos(editor.posToOffset(from) + chunk.length);
                                }
                            } catch (e) {
                                console.error('Error parsing SSE JSON data:', e, 'Data:', dataContent);
                                new Notice("Error parsing streaming data chunk.");
                                // Consider stopping the stream here? Or just log and continue?
                            }
                        } else if (message.trim()) {
                             console.log("Received non-data line:", message); // e.g., comments like ': OPENROUTER PROCESSING...'
                        }
                    }
                } // end while(true) reader loop

                // Check if the loop was exited due to abort signal
                if (abortController.signal.aborted) {
                    throw new DOMException(abortController.signal.reason || "Chat cancelled", "AbortError");
                }

                // 4. Add final separator and set cursor
                // Only add if content was actually received
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
                // Avoid appending to the end as it might corrupt the note structure
                throw new Error("Status message not found, aborting stream processing.");
            }

        } catch (error: any) {
            console.error('Error during chat stream:', error);
            const reason = (error instanceof DOMException && error.name === 'AbortError')
                           ? (abortController.signal.reason || 'Chat cancelled')
                           : (error.message || 'Unknown stream error');

            if (error.name === 'AbortError') {
                new Notice(`Chat request cancelled: ${reason}`);
                // Status message should have been removed if stream started.
                // If error happened before status removal (e.g., network error), attempt removal.
                if (!statusRemoved) {
                    this.removeCallingStatus(editor, settings, `Chat cancelled early: ${reason}`);
                }
            } else {
                 new Notice(`Chat error: ${reason}`);
                 // Attempt to remove status message if it wasn't already removed during normal flow
                 if (!statusRemoved) {
                     this.removeCallingStatus(editor, settings, `Error occurred: ${reason}`);
                 }
                 // Optionally add an error marker in the note where processing stopped
                 // const errorMarker = `\n\n[STREAM ERROR: ${reason}]\n\n`;
                 // const errorPos = initialInsertPos ?? editor.offsetToPos(editor.getValue().length); // Insert where status was or at end
                 // editor.replaceRange(errorMarker, errorPos);
            }
        } finally {
            // Clean up the active stream tracker regardless of success or failure
            this.activeStreams.delete(notePath);
            console.log(`Removed active stream tracker for note: ${notePath}`);
        }
    }

    /**
     * Finds and removes the "Calling {model}..." status message from the editor.
     * Handles cases with or without a trailing newline.
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

        // Prioritize finding the message with a newline, as added by EditorHandler
        const statusWithNewline = statusMessageBase + '\n';
        const idxWithNewline = currentFullContent.lastIndexOf(statusWithNewline);

        if (idxWithNewline !== -1) {
            // Ensure it's near the end - avoid matching old status messages if user manually typed one earlier
            // Heuristic: check if it's within the last ~100 chars or last few lines. Adjust as needed.
            const searchStartOffset = Math.max(0, editor.posToOffset(editor.lastLine()) - 150); // Search near end
             if (idxWithNewline >= editor.posToOffset(editor.offsetToPos(searchStartOffset))) {
                statusMessageIndex = idxWithNewline;
                statusMessageActual = statusWithNewline;
             }
        }

        // If not found with newline near the end, check if it's the *exact* end of the file without newline
        if (statusMessageIndex === -1 && currentFullContent.endsWith(statusMessageBase)) {
            statusMessageIndex = currentFullContent.length - statusMessageBase.length;
            statusMessageActual = statusMessageBase;
        }


        if (statusMessageIndex > -1) {
            const statusStartPos = editor.offsetToPos(statusMessageIndex);
            // Ensure we don't try to create an invalid end position if message is empty (shouldn't happen)
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
            return null;
        }
    }

     /**
      * Helper to attempt removing the status message, typically used when an error occurs
      * before the stream properly starts or after cancellation/error.
      * @param editor
      * @param settings
      * @param reason Optional reason for logging.
      */
     private removeCallingStatus(editor: Editor, settings: PluginSettings, reason?: string): void {
         console.log(`Attempting to remove status message. Reason: ${reason || 'N/A'}`);
         this.findAndRemoveStatusMessage(editor, settings); // Call the main removal logic
     }


    /**
     * Cancels an active chat stream for a given note.
     * @param notePath The path of the note whose chat should be cancelled.
     */
    cancelChat(notePath: string): void {
        const controller = this.activeStreams.get(notePath);
        if (controller) {
            console.log(`Attempting to cancel chat stream for note: ${notePath}`);
            // Provide a reason for cancellation, accessible via signal.reason
            controller.abort("Chat cancelled by user action.");
            // The finally block in startChat handles map cleanup.
            // The catch block in startChat handles the Notice.
        } else {
            console.log(`No active chat stream found to cancel for note: ${notePath}`);
            new Notice(`No active chat found for ${notePath}.`);
        }
    }
}