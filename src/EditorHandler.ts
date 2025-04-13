import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main';
// Command constants and separator are now fetched from settings
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
    	const trimmedContent = content.trimEnd();
    	const ccCommandPhrase = `\n${settings.ccCommandPhrase}\n`; // Get from settings

    	if (trimmedContent.endsWith(ccCommandPhrase)) {
    		// Calculate the range of the command phrase to replace
    		const commandStartIndex = trimmedContent.length - ccCommandPhrase.length;
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
    	const ggCommandPhrase = `\n${settings.ggCommandPhrase}\n`; // Get from settings
    	if (trimmedContent.endsWith(ggCommandPhrase)) {
    		const settings = this.plugin.settings; // Get settings
    		const noteContent = editor.getValue(); // Get full content for separator check

    		// Separator Check
    		const chatSeparator = settings.chatSeparator; // Get from settings
    		if (!noteContent.includes(chatSeparator)) {
    			new Notice(`Archive command ('gg') requires at least one chat separator ('${chatSeparator}') in the note.`);
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
    				// Pass the whole settings object now
    				const newPath = await this.plugin.fileSystemService.moveFileToArchive(
    					markdownView.file!, // Assert non-null based on the check above
    					settings.archiveFolderName,
    					settings // Pass the entire settings object
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

    		// --- DD Command Check (Delete Note) ---
    		const ddCommandPhrase = `\n${settings.ddCommandPhrase}\n`; // Get from settings
    		if (trimmedContent.endsWith(ddCommandPhrase)) {
    			const settings = this.plugin.settings; // Get settings

    			// 1. Check if Enabled (Line 103)
    			if (!settings.enableDeleteCommand) {
    				return; // Do nothing if the command is not enabled
    			}

    			const noteContent = editor.getValue(); // Get full content for separator check

    			// 2. Separator Check (Line 105)
    			const chatSeparator = settings.chatSeparator; // Get from settings (already fetched for gg, but get again for clarity/safety)
    			// Only check for separator if bypass is NOT enabled
    			if (!settings.ddBypassSeparatorCheck) {
    				if (!noteContent.includes(chatSeparator)) {
    					new Notice(`Delete command ('dd') requires at least one chat separator ('${chatSeparator}') in the note for safety.`);
    					return; // Stop processing if separator is missing and bypass is off
    				}
    			}

    			// Ensure file exists before attempting delete
    			if (!markdownView.file) {
    				console.error("Cannot delete note: markdownView.file is null.");
    				new Notice("Failed to delete note: No active file.");
    				return;
    			}

    			// 3. Confirmation Prompt (Line 107)
    			if (confirm("Are you sure you want to move this note to the trash?")) {
    				// Use an async IIFE to handle the promise from deleteFile
    				(async () => {
    					try {
    						await this.plugin.fileSystemService.deleteFile(markdownView.file!); // Assert non-null based on the check above
    						new Notice("Note moved to trash.");
    						// The view might close automatically upon deletion by Obsidian.
    					} catch (error) {
    						console.error("Error during note deletion:", error);
    						new Notice("Failed to move note to trash. Check console for details.");
    					}
    				})();
    			} else {
    				// User cancelled the deletion
    				new Notice("Note deletion cancelled.");
    				// Optionally remove the 'dd' command text here if desired, but plan says not to
    			}

    			// Do not remove 'dd' text as per current requirements.
    			return; // Return after handling dd
    		}

   // --- NN Command Check (New Note) ---
   const nnCommandPhrase = `\n${settings.nnCommandPhrase}\n`; // Get from settings
   // Re-check trimmedContent as it might have changed if other handlers modified it, though unlikely with current returns
   const currentTrimmedContent = editor.getValue().trimEnd();

   if (currentTrimmedContent.endsWith(nnCommandPhrase)) {
    // 1. Check if Enabled
    if (!settings.enableNnCommandPhrase) {
    	return; // Do nothing if the command phrase trigger is not enabled
    }

    // 2. Remove the command phrase
    const commandStartIndex = currentTrimmedContent.length - nnCommandPhrase.length;
    const startPos = editor.offsetToPos(commandStartIndex);
    const endPos = editor.offsetToPos(currentTrimmedContent.length); // Use trimmed length for end position
    editor.replaceRange('', startPos, endPos);

    // 3. Execute the command
    // Ensure the command ID matches the one registered in main.ts
    // @ts-ignore - Assuming 'commands' exists on app, potentially a typing issue
    this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
    new Notice("Creating new chat note..."); // Optional feedback

    return; // Return after handling nn
   }

    		// --- Future command checks could go here ---
    	}
 }
