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
		const editorContent = editor.getValue();
		const lines = editorContent.split('\n');

		let lastLineIndex = -1;
		let lastLineTrimmedContent = '';
		for (let i = lines.length - 1; i >= 0; i--) {
			const trimmedLine = lines[i].trim();
			if (trimmedLine.length > 0) {
				lastLineIndex = i;
				lastLineTrimmedContent = trimmedLine;
				break;
			}
		}

		if (lastLineIndex === -1) {
			return; // No command found
		}

		// Build list of active commands based on settings
		const activeCommands: CommandInfo[] = [];
		if (settings.chatCommandPhrase) activeCommands.push({ phrase: settings.chatCommandPhrase, type: 'cc' });
		if (settings.archiveCommandPhrase) activeCommands.push({ phrase: settings.archiveCommandPhrase, type: 'gg' });
		if (settings.deleteCommandPhrase && settings.enableDeleteCommand) activeCommands.push({ phrase: settings.deleteCommandPhrase, type: 'dd' });
		if (settings.newChatCommandPhrase && settings.enableNnCommandPhrase) activeCommands.push({ phrase: settings.newChatCommandPhrase, type: 'nn' });

		const matchedCommand = activeCommands.find(cmd => cmd.phrase === lastLineTrimmedContent);

		if (matchedCommand) {
			console.log(`Detected command phrase: ${matchedCommand.phrase} (type: ${matchedCommand.type})`);

			const lineStartPos: EditorPosition = { line: lastLineIndex, ch: 0 };
			const lineEndPos: EditorPosition = { line: lastLineIndex, ch: lines[lastLineIndex].length };

			// Extract content *before* the command line
			let contentBeforeCommand = lines.slice(0, lastLineIndex).join('\n').trimEnd();
			// Add a newline if there was content before the command
			if (contentBeforeCommand.length > 0) {
				contentBeforeCommand += '\n';
			}

			this._executeCommandAction(
				matchedCommand.type,
				editor,
				markdownView,
				settings,
				lineStartPos,
				lineEndPos,
				contentBeforeCommand,
				lines // Pass original lines for context if needed
			);
		}
	}

	private _executeCommandAction(
		commandType: 'cc' | 'gg' | 'dd' | 'nn',
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		lineStartPos: EditorPosition,
		lineEndPos: EditorPosition,
		contentBeforeCommand: string,
		lines: string[]
	): void {

		const file = markdownView.file; // Re-check file existence
		if (!file && commandType !== 'nn') { // 'nn' doesn't strictly need the current file
			console.error(`Cannot execute command '${commandType}': markdownView.file is null.`);
			new Notice(`Failed to execute command '${commandType}': No active file.`);
			return;
		}

		// Helper to set cursor position after removing/replacing the command line
		const setCursorAfterAction = () => {
			const lineIndex = lineStartPos.line;
			if (lineIndex > 0) {
				const prevLine = lineIndex - 1;
				editor.setCursor({ line: prevLine, ch: lines[prevLine].length });
			} else {
				editor.setCursor({ line: 0, ch: 0 }); // Move to start if it was the only line or first line
			}
		};

		switch (commandType) {
			case 'cc':
				const modelName = settings.defaultModel || 'default model';
				// Ensure status message ends with a newline for consistent removal later
				const statusMessage = `Calling ${modelName}...\n`;
				const statusMessageStartPos = lineStartPos; // Status replaces the command line

				// Replace the command line with the status message
				editor.replaceRange(statusMessage, lineStartPos, lineEndPos);

				// Calculate the end position of the inserted status message
				const statusMessageEndOffset = editor.posToOffset(statusMessageStartPos) + statusMessage.length;
				const statusMessageEndPos = editor.offsetToPos(statusMessageEndOffset);

				// Set cursor to the beginning of the status message (optional, could be end)
				editor.setCursor(statusMessageStartPos);
				console.log(`Inserted status message. Start: [${statusMessageStartPos.line}, ${statusMessageStartPos.ch}], End: [${statusMessageEndPos.line}, ${statusMessageEndPos.ch}]`);

				// Call startChat with the positions
				this.plugin.chatService.startChat(
					editor,
					file!,
					settings,
					statusMessageStartPos,
					statusMessageEndPos
				).catch(error => {
					console.error("Error starting chat:", error);
					// Attempt to replace the status message with an error message
					const errorMessage = error instanceof Error ? error.message : 'Unknown error';
					try {
						editor.replaceRange(`Error: ${errorMessage}`, statusMessageStartPos, statusMessageEndPos);
					} catch (replaceError) {
						console.error("Failed to replace status message with error:", replaceError);
						// Fallback notice if replacing fails
						new Notice(`Chat Error: ${errorMessage}`);
					}
				});
				break;

			case 'gg':
				editor.replaceRange('', lineStartPos, lineEndPos);
				setCursorAfterAction();

				const noteContentGg = editor.getValue(); // Get content *after* removing command line
				const chatSeparatorGg = settings.chatSeparator;
				if (!noteContentGg.includes(chatSeparatorGg)) {
					new Notice(`Archive command ('gg') requires at least one chat separator ('${chatSeparatorGg}') in the note.`);
					// Consider adding the command back here if desired, but it complicates flow.
					return;
				}

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
						}
					} catch (error) {
						console.error("Error during note archive:", error);
						new Notice("Failed to archive note. Check console for details.");
					}
				})();
				break;

			case 'dd':
				const noteContentDd = editor.getValue(); // Check content *before* removing the line
				const chatSeparatorDd = settings.chatSeparator;
				if (!settings.ddBypassSeparatorCheck && !noteContentDd.includes(chatSeparatorDd)) {
					new Notice(`Delete command ('dd') requires a chat separator ('${chatSeparatorDd}') or bypass enabled.`);
					return;
				}

				if (confirm("Are you sure you want to move this note to the trash?")) {
					editor.replaceRange('', lineStartPos, lineEndPos);
					setCursorAfterAction();

					(async () => {
						try {
							await this.plugin.fileSystemService.deleteFile(file!);
							new Notice("Note moved to trash.");
						} catch (error) {
							console.error("Error during note deletion:", error);
							new Notice("Failed to move note to trash. Check console for details.");
						}
					})();
				} else {
					new Notice("Note deletion cancelled.");
					// Command line remains as user cancelled before removal.
				}
				break;

			case 'nn':
				editor.replaceRange('', lineStartPos, lineEndPos);
				setCursorAfterAction();

				// @ts-ignore - Assuming 'commands' exists on app
				this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
				new Notice("Creating new chat note...");
				break;
		}
	}
}
