import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main';
import { PluginSettings } from './types';

interface CommandInfo {
	phrase: string;
	type: 'cc' | 'gg' | 'dd' | 'nn';
}

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

		// --- Handle Stop Sequence during Active Stream ---
		if (this.plugin.chatService.isStreamActive(filePath)) {
			const content = editor.getValue();
			const stopSequence = settings.stopCommandSequence;

			if (stopSequence && content.includes(stopSequence)) {
				console.log(`Stop sequence "${stopSequence}" detected in active stream file: ${filePath}`);
				// Pass editor and settings to cancelStream
				if (this.plugin.chatService.cancelStream(filePath, editor, settings)) {
					const sequenceIndex = content.lastIndexOf(stopSequence);
					if (sequenceIndex !== -1) {
						const startPos = editor.offsetToPos(sequenceIndex);
						const endPos = editor.offsetToPos(sequenceIndex + stopSequence.length);
						editor.replaceRange('', startPos, endPos);
						console.log(`Removed stop sequence "${stopSequence}" from editor.`);

						const endOfDoc = editor.offsetToPos(editor.getValue().length);
						const interruptionMessage = "\n\n[Response Interrupted]\n\n";
						editor.replaceRange(interruptionMessage, endOfDoc, endOfDoc);
						const finalCursorPos = editor.offsetToPos(editor.posToOffset(endOfDoc) + interruptionMessage.length);
						editor.setCursor(finalCursorPos);

						new Notice("Stream stopped by sequence.");
						return; // Stop further processing
					} else {
						console.warn("Stop sequence detected but could not find its index to remove.");
					}
				}
			}
			// Don't process command phrases if a stream is active but stop sequence wasn't found/handled
			return;
		}

		// --- Detect Command Phrases ---
		// Find the last non-empty line, ensuring it's followed by at least one empty/whitespace line.
		const editorContent = editor.getValue();
		const lines = editorContent.split('\n');
		const lastLineIndex = lines.length - 1;

		if (lastLineIndex < 0) {
			return; // Empty file
		}

		// 1. Check if the very last line is empty or whitespace
		if (lines[lastLineIndex].trim() !== '') {
			return; // Last line has content, not a command trigger
		}

		// 2. Find the last non-empty line index before the trailing empty lines
		let commandLineIndex = -1;
		let commandLineContent = '';
		for (let i = lastLineIndex - 1; i >= 0; i--) {
			if (lines[i].trim() !== '') {
				commandLineIndex = i;
				commandLineContent = lines[i]; // Use the exact line content for matching
				break;
			}
		}

		if (commandLineIndex === -1) {
			return; // No non-empty line found before the last empty one(s)
		}

		// Build list of active commands based on settings
		const activeCommands: CommandInfo[] = [];
		if (settings.chatCommandPhrase) activeCommands.push({ phrase: settings.chatCommandPhrase, type: 'cc' });
		if (settings.archiveCommandPhrase) activeCommands.push({ phrase: settings.archiveCommandPhrase, type: 'gg' });
		if (settings.deleteCommandPhrase && settings.enableDeleteCommand) activeCommands.push({ phrase: settings.deleteCommandPhrase, type: 'dd' });
		if (settings.newChatCommandPhrase && settings.enableNnCommandPhrase) activeCommands.push({ phrase: settings.newChatCommandPhrase, type: 'nn' });

		// 3. Match against the *exact* content of the last non-empty line
		const matchedCommand = activeCommands.find(cmd => cmd.phrase === commandLineContent);

		if (matchedCommand) {
			console.log(`Detected command phrase: ${matchedCommand.phrase} (type: ${matchedCommand.type}) on line ${commandLineIndex}`);

			// 4. Execute the action, passing the index of the command line
			this._executeCommandAction(
				matchedCommand.type,
				editor,
				markdownView,
				settings,
				commandLineIndex,
				lines // Pass original lines for context if needed
			);
		}
	}

	private _executeCommandAction(
		commandType: 'cc' | 'gg' | 'dd' | 'nn',
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number,
		lines: string[] // Original lines for context
	): void {

		const file = markdownView.file; // Re-check file existence
		if (!file && commandType !== 'nn') { // 'nn' doesn't strictly need the current file
			console.error(`Cannot execute command '${commandType}': markdownView.file is null.`);
			new Notice(`Failed to execute command '${commandType}': No active file.`);
			return;
		}

		// Define positions for the command line and all subsequent empty lines
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		// The end position is the end of the entire document to capture all trailing lines
		const rangeEndPos: EditorPosition = editor.offsetToPos(editor.getValue().length);

		// Helper to set cursor to the end of the line *before* the command line
		const setCursorBeforeCommand = () => {
			const targetLineIndex = commandLineIndex - 1;
			if (targetLineIndex >= 0) {
				const targetLineLength = editor.getLine(targetLineIndex).length;
				editor.setCursor({ line: targetLineIndex, ch: targetLineLength });
			} else {
				editor.setCursor({ line: 0, ch: 0 }); // Move to start if document is now empty or command was on first line
			}
		};


		switch (commandType) {
			case 'cc':
				const modelName = settings.defaultModel || 'default model';
				// Ensure status message ends with a newline
				const statusMessage = `Calling ${modelName}...\n`;

				// Replace the command line and all subsequent empty lines with the status message
				editor.replaceRange(statusMessage, commandLineStartPos, rangeEndPos);

				// Calculate the end position of the inserted status message
				// Start position is where the command line was.
				const statusMessageStartPos = commandLineStartPos;
				// The new end position is calculated *after* the replacement
				const statusMessageEndOffset = editor.posToOffset(statusMessageStartPos) + statusMessage.length;
				const statusMessageEndPos = editor.offsetToPos(statusMessageEndOffset);


				// Set cursor to the beginning of the status message
				editor.setCursor(statusMessageStartPos);
				console.log(`Replaced command line and trailing empty lines with status. Range: [${statusMessageStartPos.line}, ${statusMessageStartPos.ch}] to end of doc. New End: [${statusMessageEndPos.line}, ${statusMessageEndPos.ch}]`);

				// Call startChat with the correct positions relative to the *new* content
				this.plugin.chatService.startChat(
					editor,
					file!,
					settings,
					statusMessageStartPos, // Position where status message starts
					statusMessageEndPos   // Position where status message ends (calculated above)
				).catch(error => {
					console.error("Error starting chat:", error);
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					try {
						// Attempt to replace the *original* status message range with the error
						// Need to re-calculate the end position based on the *current* content if the status message was modified
						const currentStatusEndOffset = editor.posToOffset(statusMessageStartPos) + statusMessage.length;
						const currentStatusEndPos = editor.offsetToPos(currentStatusEndOffset);
						editor.replaceRange(`Error: ${errorMessage}\n`, statusMessageStartPos, currentStatusEndPos);
					} catch (replaceError) {
						console.error("Failed to replace status message with error:", replaceError);
						new Notice(`Chat Error: ${errorMessage}`); // Fallback notice
					}
				});
				break;

			case 'gg':
				// Check for separator *before* removing lines
				const noteContentGg = editor.getValue();
				const chatSeparatorGg = settings.chatSeparator;
				if (!noteContentGg.includes(chatSeparatorGg)) {
					new Notice(`Archive command ('gg') requires at least one chat separator ('${chatSeparatorGg}') in the note.`);
					// Do not remove the command lines if check fails
					return;
				}

				// Remove command line and all subsequent empty lines
				editor.replaceRange('', commandLineStartPos, rangeEndPos);
				setCursorBeforeCommand(); // Set cursor before async operation

				(async () => {
					try {
						const newPath = await this.plugin.fileSystemService.moveFileToArchive(
							file!,
							settings.archiveFolderName,
							settings
						);
						if (newPath) { new Notice(`Note archived to: ${newPath}`); }
						else {
							new Notice("Failed to archive note.");
							console.warn("FileSystemService.moveFileToArchive returned null.");
							// Consider adding back the command lines if archive fails? Might be complex.
						}
					} catch (error) {
						console.error("Error during note archive:", error);
						new Notice("Failed to archive note. Check console for details.");
					}
				})();
				break;

			case 'dd':
				// Check content *before* removing lines
				const noteContentDd = editor.getValue();
				const chatSeparatorDd = settings.chatSeparator;
				if (!settings.ddBypassSeparatorCheck && !noteContentDd.includes(chatSeparatorDd)) {
					new Notice(`Delete command ('dd') requires a chat separator ('${chatSeparatorDd}') or bypass enabled.`);
					// Do not remove lines if check fails
					return;
				}

				if (confirm("Are you sure you want to move this note to the trash?")) {
					// Remove command line and all subsequent empty lines
					editor.replaceRange('', commandLineStartPos, rangeEndPos);
					setCursorBeforeCommand(); // Set cursor before async operation

					(async () => {
						try {
							await this.plugin.fileSystemService.deleteFile(file!);
							new Notice("Note moved to trash.");
						} catch (error) {
							console.error("Error during note deletion:", error);
							new Notice("Failed to move note to trash. Check console for details.");
							// Consider adding back the command lines if delete fails?
						}
					})();
				} else {
					new Notice("Note deletion cancelled.");
					// Command lines remain as user cancelled.
				}
				break;

			case 'nn':
				// Remove command line and all subsequent empty lines
				editor.replaceRange('', commandLineStartPos, rangeEndPos);
				setCursorBeforeCommand();

				// Execute the command *after* modifying the editor
				// @ts-ignore - Assuming 'commands' exists on app
				this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
				new Notice("Creating new chat note...");
				break;
		}
	}
}
