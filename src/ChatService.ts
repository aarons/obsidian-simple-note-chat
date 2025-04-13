import { requestUrl, Notice, Plugin, Editor, TFile } from 'obsidian'; // Added Editor, TFile
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
     * @param content The raw string content of the note.
     * @param separator The separator used to divide messages.
     * @returns An array of ChatMessage objects.
     */
    private parseNoteContent(content: string, separator: string): ChatMessage[] {
        const parts = content.split(separator);
        const messages: ChatMessage[] = [];
        let currentRole: 'user' | 'assistant' = 'user';

        for (const part of parts) {
            const trimmedPart = part.trim();
            if (trimmedPart && !COMMAND_PHRASES.includes(trimmedPart.toLowerCase())) {
                messages.push({ role: currentRole, content: trimmedPart });
                currentRole = currentRole === 'user' ? 'assistant' : 'user';
            }
        }
        return messages;
    }

    /**
     * Initiates a chat completion request to the OpenRouter API.
     * Does not handle the streaming response yet.
     * @param noteContent The full content of the note to be parsed (excluding status message).
     * @param editor The editor instance where the command was triggered.
     * @param file The file associated with the editor.
     * @param settings The current plugin settings.
     */
    async startChat(noteContent: string, editor: Editor, file: TFile, settings: PluginSettings): Promise<void> {
        const { apiKey, defaultModel } = settings;

        if (!apiKey) {
            new Notice('OpenRouter API key is not set. Please configure it in the plugin settings.');
            return;
        }
        if (!defaultModel) {
            new Notice('Default model is not set. Please configure it in the plugin settings.');
            return;
        }

        const notePath = file.path; // Get path from TFile
        // Check if a stream is already active for this note (we'll add cancellation later)
        if (this.activeStreams.has(notePath)) {
        	console.log(`Chat stream already active for note: ${notePath}. Ignoring new request.`);
            // Optionally, notify the user or implement cancellation/replacement logic here.
            // For now, we just prevent starting a new one.
            return;
        }

        const messages = this.parseNoteContent(noteContent, CHAT_SEPARATOR);

        if (messages.length === 0) {
            new Notice('No valid chat content found in the note.');
            return;
        }

        const requestBody = {
            model: defaultModel,
            messages: messages,
            stream: true,
        };

        const abortController = new AbortController();
        this.activeStreams.set(notePath, abortController); // Track the stream using file path

        try {
            console.log('Sending request to OpenRouter:', JSON.stringify(requestBody, null, 2)); // Log request body

            const response = await requestUrl({
                url: `${OPENROUTER_API_URL}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    // Add other headers recommended by OpenRouter if any (e.g., HTTP-Referer, X-Title)
                    // 'HTTP-Referer': 'YOUR_SITE_URL', // Optional
                    // 'X-Title': 'YOUR_SITE_NAME', // Optional
                },
                body: JSON.stringify(requestBody),
                // signal: abortController.signal // Add signal for cancellation later
            });

            console.log('OpenRouter API Response Status:', response.status);
            console.log('OpenRouter API Response Headers:', response.headers);

            // --- STREAM HANDLING WILL GO HERE IN THE NEXT STEP ---
            // For now, we just initiated the request.
            // We need to process response.arrayBuffer or response.text if using non-streaming
            // For streaming, we'll need a different approach to read the chunks.

            new Notice('Chat request sent. Stream handling not yet implemented.'); // Placeholder notice

        } catch (error) {
            console.error('Error calling OpenRouter API:', error);
            new Notice(`Error contacting OpenRouter: ${error.message || 'Unknown error'}`);
        } finally {
            // Clean up the active stream tracker once the request (or stream) finishes or errors
             this.activeStreams.delete(notePath);
             console.log(`Removed active stream tracker for note: ${notePath}`);
        }
    }

    // Method to cancel an active stream (will be used later)
    cancelChat(notePath: string): void {
        const controller = this.activeStreams.get(notePath);
        if (controller) {
            controller.abort();
            this.activeStreams.delete(notePath);
            new Notice(`Chat for note ${notePath} cancelled.`);
            console.log(`Chat stream cancelled for note: ${notePath}`);
        } else {
            console.log(`No active chat stream found to cancel for note: ${notePath}`);
        }
    }
}