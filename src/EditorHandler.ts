import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main';
import { CC_COMMAND, GG_COMMAND, CHAT_SEPARATOR } from './constants';
import { PluginSettings } from './types';

export class EditorHandler {
    private app: App;
    private plugin: SimpleNoteChat;

    constructor(app: App, plugin: SimpleNoteChat) {
        this.app = app;
        this.plugin = plugin;
    }

    public handleEditorChange = (editor: Editor, markdownView: MarkdownView): void => {
    	const settings = this.plugin.settings;
    	const file = markdownView.file;

    	if (!file) {
    		console.warn("Editor change detected but no active file.");
    		return;
    	}
    	const filePath = file.path;

    	// --- Stop Sequence Check ---
    	if (this.plugin.chatService.isStreamActive(filePath)) {
    		const content = editor.getValue();
    		const stopSequence = settings.stopCommandSequence;

    		if (stopSequence && content.includes(stopSequence)) {
    			console.log(`Stop sequence "${stopSequence}" detected in active stream file: ${filePath}`);
    			if (this.plugin.chatService.cancelStream(filePath)) {
    				// Find and remove the stop sequence
    				const sequenceIndex = content.lastIndexOf(stopSequence); // Find last occurrence
    				if (sequenceIndex !== -1) {
    					const startPos = editor.offsetToPos(sequenceIndex);
    					const endPos = editor.offsetToPos(sequenceIndex + stopSequence.length);
    					editor.replaceRange('', startPos, endPos);
    					console.log(`Removed stop sequence "${stopSequence}" from editor.`);

    					// Append interruption message - Append at the end for simplicity
    					const endOfDoc = editor.offsetToPos(editor.getValue().length);
    					const interruptionMessage = "\n\n[Response Interrupted]\n\n";
    					editor.replaceRange(interruptionMessage, endOfDoc, endOfDoc);
    					// Move cursor after the appended message
    					const finalCursorPos = editor.offsetToPos(editor.posToOffset(endOfDoc) + interruptionMessage.length);
    					editor.setCursor(finalCursorPos);


    					new Notice("Stream stopped by sequence.");
    					return; // Stop further processing in this handler call
    				} else {
    					console.warn("Stop sequence detected but could not find its index to remove.");
    				}
    			}
    		}
    	}

    	// --- CC Command Check (Existing Logic) ---
    	const content = editor.getValue(); // Re-get content in case it was modified by stop sequence logic
    	const commandPhrase = `\n${CC_COMMAND}\n`; // Command must be on its own line preceded and followed by a newline
    	const trimmedContent = content.trimEnd();

    	if (trimmedContent.endsWith(commandPhrase)) {
    		// Calculate the range of the command phrase to replace
    		const commandStartIndex = trimmedContent.length - commandPhrase.length;
    		const startPos = editor.offsetToPos(commandStartIndex);
    		const endPos = editor.offsetToPos(trimmedContent.length); // Use trimmed length for end position

    		const modelName = settings.defaultModel || 'default model';
    		const statusMessage = `Calling ${modelName}...`;

    		editor.replaceRange(statusMessage + '\n', startPos, endPos);

    		// Get the content *before* the command phrase was added for parsing
    		const contentForChat = trimmedContent.substring(0, commandStartIndex);

    		if (!markdownView.file) {
    			console.error("Cannot start chat: markdownView.file is null.");
    			return;
    		}

    		this.plugin.chatService.startChat(
    			contentForChat,
    			editor,
    			markdownView.file,
    			settings
    		).catch(error => {
    			console.error("Error starting chat:", error);
    			// Optionally revert the status message or show an error in the editor
    		});
    		return; // Return after handling cc
    	}

    	// --- GG Command Check (Archive Note) ---
    	const ggCommandPhrase = `\n${GG_COMMAND}\n`;
    	if (trimmedContent.endsWith(ggCommandPhrase)) {
    		const settings = this.plugin.settings; // Get settings
    		const noteContent = editor.getValue(); // Get full content for separator check

    		// Separator Check
    		if (!noteContent.includes(CHAT_SEPARATOR)) {
    			new Notice(`Archive command ('gg') requires at least one chat separator ('${CHAT_SEPARATOR}') in the note.`);
    			return; // Stop processing if separator is missing
    		}

    		// Ensure file exists before attempting archive
    		if (!markdownView.file) {
    			console.error("Cannot archive note: markdownView.file is null.");
    			new Notice("Failed to archive note: No active file.");
    			return;
    		}

    		// Use an async IIFE to handle the promise from moveFileToArchive
    		(async () => {
    			try {
    				const newPath = await this.plugin.fileSystemService.moveFileToArchive(
    					markdownView.file!, // Assert non-null based on the check above
    					settings.archiveFolderName
    				);

    				if (newPath) {
    					new Notice(`Note archived to: ${newPath}`);
    					// The view might close automatically upon rename by Obsidian.
    				} else {
    					// moveFileToArchive returns null on handled errors (e.g., folder creation failure)
    					new Notice("Failed to archive note.");
    					console.warn("FileSystemService.moveFileToArchive returned null.");
    				}
    			} catch (error) {
    				console.error("Error during note archive:", error);
    				new Notice("Failed to archive note. Check console for details.");
    			}
    		})();

    		// Do not remove 'gg' text as per current requirements.
    		return; // Return after handling gg
    	}

    	// --- Future command checks (e.g., dd, nn) could go here ---
    }
}
