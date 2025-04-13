import { App, Editor, MarkdownView, TFile, EditorPosition } from 'obsidian'; // Added EditorPosition
import SimpleNoteChat from './main';
import { CC_COMMAND } from './constants';
import { PluginSettings } from './types';

export class EditorHandler {
    private app: App;
    private plugin: SimpleNoteChat;

    constructor(app: App, plugin: SimpleNoteChat) {
        this.app = app;
        this.plugin = plugin;
    }

    public handleEditorChange = (editor: Editor, markdownView: MarkdownView): void => {
    	const content = editor.getValue();
    	const settings = this.plugin.settings;
    	const commandPhrase = `\n${CC_COMMAND}\n`; // Command must be on its own line preceded and followed by a newline

    	// Trim trailing whitespace from the content before checking
    	// This handles cases where the user might have added spaces after the final newline
    	const trimmedContent = content.trimEnd();

    	if (trimmedContent.endsWith(commandPhrase)) {
    		// Calculate the range of the command phrase to replace
    		const commandStartIndex = trimmedContent.length - commandPhrase.length;
    		const startPos = editor.offsetToPos(commandStartIndex);
    		const endPos = editor.offsetToPos(trimmedContent.length); // Use trimmed length for end position

    		// Prepare status message
    		const modelName = settings.defaultModel || 'default model';
    		const statusMessage = `Calling ${modelName}...`;

    		// Replace the command phrase with the status message
    		editor.replaceRange(statusMessage + '\n', startPos, endPos);

    		// Get the content *before* the command phrase was added for parsing
    		const contentForChat = trimmedContent.substring(0, commandStartIndex);

    		// Ensure file exists before proceeding
    		if (!markdownView.file) {
    			console.error("Cannot start chat: markdownView.file is null.");
    			return; // Or handle appropriately
    		}

    		// Call ChatService
    		this.plugin.chatService.startChat(
    			contentForChat,
    			editor,
    			markdownView.file,
    			settings
    		).catch(error => {
    			console.error("Error starting chat:", error);
    			// Optionally revert the status message or show an error in the editor
    		});
    	}
    }
}