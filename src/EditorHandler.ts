import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main'; // Assuming main exports the class as default
import { PluginSettings } from './types';
import { log } from './utils/logger';
import { ModelSelectorModal } from './ModelSelectorModal'; // Added import

export class EditorHandler {
	private app: App;
	private plugin: SimpleNoteChat;
	private activationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	constructor(app: App, plugin: SimpleNoteChat) {
		this.app = app;
		this.plugin = plugin;
	}

	public handleEditorChange = (editor: Editor, markdownView: MarkdownView): void => {
		const settings = this.plugin.settings;
		const file = markdownView.file;

		if (!file) {
			log.warn("Editor change detected but no active file.");
			return;
		}
		const filePath = file.path;

		// Cancel any pending activations for this file
		const pending = this.activationTimers.get(filePath);
		if (pending) {
			clearTimeout(pending);
			this.activationTimers.delete(filePath);
		}

		// --- Prevent Command Phrase Detection During Active Stream ---
		// Don't trigger command phrases during an active stream
		// Stream can only be stopped via Escape key (handled in main.ts)
		if (this.plugin.chatService.isStreamActive(filePath)) {
			return; // Don't process command phrases while streaming
		}

		// --- Detect Command Phrases (<phrase><space>[0.5s]) ---
		// Handles space-triggered commands with 0.5s pause
		// Enter-triggered commands are handled by handleKeyDown in main.ts

		const lines = editor.getValue().split('\n');

		// Find the last non-empty line in the document
		let lastContentLineIdx = lines.length - 1;
		while (lastContentLineIdx >= 0 && lines[lastContentLineIdx].trim() === '') {
			lastContentLineIdx--;
		}
		if (lastContentLineIdx < 0) return; // whole file is blank
		const lastContentLine = lines[lastContentLineIdx];

		// Check if last line ends with a space (command activation)
		const trimmed = lastContentLine.trimEnd();
		if (lastContentLine.endsWith(' ')) {
			let commandHandler: (() => void) | null = null;

			if (trimmed === settings.chatCommandPhrase) {
				commandHandler = () => this.triggerChatCommand(editor, markdownView, settings, lastContentLineIdx);
			} else if (trimmed === settings.archiveCommandPhrase) {
				commandHandler = () => this.triggerArchiveCommand(editor, markdownView, settings, lastContentLineIdx);
			} else if (settings.newChatCommandPhrase && trimmed === settings.newChatCommandPhrase) {
				commandHandler = () => this.triggerNewChatCommand(editor, markdownView, settings, lastContentLineIdx);
			} else if (trimmed === settings.modelCommandPhrase) {
				commandHandler = () => this.triggerModelCommand(editor, markdownView, settings, lastContentLineIdx);
			}

			if (commandHandler) {
				log.debug(`Detected command phrase "${trimmed} " on line ${lastContentLineIdx}. Setting 0.5s timer.`);
				const finalCommandHandler = commandHandler; // Capture handler for closure
				const timeout = setTimeout(() => {
					// Re‑check that the line content hasn't changed during the delay
					const currentLines = editor.getValue().split('\n');
					let currentLastContentLineIdx = currentLines.length - 1;
					while (currentLastContentLineIdx >= 0 && currentLines[currentLastContentLineIdx].trim() === '') {
						currentLastContentLineIdx--;
					}

					if (currentLastContentLineIdx === lastContentLineIdx && currentLines[currentLastContentLineIdx] === lastContentLine) {
						log.debug(`Timer finished for "${trimmed} ". Executing command.`);
						finalCommandHandler();
					} else {
						log.debug(`Timer finished for "${trimmed} ", but content changed. Aborting.`);
					}
					this.activationTimers.delete(filePath);
				}, 500); // 0.5 s
				this.activationTimers.set(filePath, timeout);
			}
		}
	}

	/**
	 * Sets cursor position after command execution - either at the end of the previous line
	 * or at document start if command was on the first line.
	 */
	private _setCursorBeforeCommand(editor: Editor, commandLineIndex: number): void {
		if (commandLineIndex > 0) {
			const targetLineIndex = commandLineIndex - 1;
			const targetLineLength = editor.getLine(targetLineIndex).length;
			editor.setCursor({ line: targetLineIndex, ch: targetLineLength });
		} else {
			// If command was on the very first line (index 0), move cursor to start
			editor.setCursor({ line: 0, ch: 0 });
		}
	}

	/**
		* Appends the final archive status message to the content of the archived note.
		*/
	private async appendStatusToFile(filePath: string, noteName: string, folderName: string): Promise<void> {
		try {
			const archivedTFile = this.app.vault.getAbstractFileByPath(filePath);
			if (archivedTFile instanceof TFile) {
				const statusText = `note moved to: ${folderName}${noteName}\n`;
				await this.app.vault.append(archivedTFile, statusText);
				log.debug(`Appended status to archived note: ${filePath}`);
			} else {
				log.error(`Could not find archived file TFile at path: ${filePath}`);
				new Notice(`Failed to append status to archived note content.`);
			}
		} catch (appendError) {
			log.error(`Error appending status to archived note ${filePath}:`, appendError);
			new Notice(`Error appending status to archived note content.`);
		}
	}


	/**
		* Handles chat command activation.
		* Replaces command line with status message and initiates chat.
	 */
	public triggerChatCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		const file = markdownView.file;
		if (!file) {
			log.error(`Cannot execute chat command: markdownView.file is null.`);
			new Notice(`Failed to execute chat command: No active file.`);
			return;
		}

		// Define command line range
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		// Handle line endings appropriately based on position in document
		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 } // Include newline if not last line
			: commandLineEndPos; // Just the line content if last line

		const statusMessage = `Calling ${settings.defaultModel}...\n`;

		// Replace command line with status message
		editor.replaceRange(statusMessage, commandLineStartPos, rangeToRemoveEnd);

		// Track status message position for later replacement
		const actualStatusTextStartPos: EditorPosition = commandLineStartPos;
		const statusTextLength = statusMessage.length;
		const statusMessageEndOffset = editor.posToOffset(actualStatusTextStartPos) + statusTextLength;
		const statusMessageEndPos = editor.offsetToPos(statusMessageEndOffset);

		// Position cursor for incoming stream
		editor.setCursor(statusMessageEndPos);
		log.debug(`Replaced command line ${commandLineIndex} with status. Status Range for ChatService: [${actualStatusTextStartPos.line}, ${actualStatusTextStartPos.ch}] to [${statusMessageEndPos.line}, ${statusMessageEndPos.ch}]. Cursor set to end.`);

		// Start chat with status message range for replacement
		this.plugin.chatService.startChat(
			editor,
			file,
			settings,
			actualStatusTextStartPos, // Position where actual status text starts
			statusMessageEndPos       // Position where actual status text ends
		).catch(error => {
			log.error("Error starting chat:", error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			try {
				// Attempt to replace the *original* status message range with the error
				// Use the same range that was passed to startChat
				editor.replaceRange(`\nError: ${errorMessage}\n`, actualStatusTextStartPos, statusMessageEndPos);
			} catch (replaceError) {
				log.error("Failed to replace status message with error:", replaceError);
				// Fallback: Insert error message at the cursor position if replacement fails
				const currentCursor = editor.getCursor();
				editor.replaceRange(`\nError: ${errorMessage}\n`, currentCursor);
				new Notice(`Chat Error: ${errorMessage}. Failed to replace status message.`);
			}
		});
	}

	/**
	 * Handles archive command activation.
	 * Removes command line and moves file to archive location.
	 */
	public triggerArchiveCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		const file = markdownView.file;
		if (!file) {
			log.error(`Cannot execute archive command: markdownView.file is null.`);
			new Notice(`Failed to execute archive command: No active file.`);
			return;
		}

		// Define the range for the command line itself
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		// Check for chat separator, excluding the command line itself
		const tempContentBefore = editor.getRange({line: 0, ch: 0}, commandLineStartPos);
		const tempContentAfter = editor.getRange(
			(commandLineIndex < editor.lastLine()) ? { line: commandLineIndex + 1, ch: 0 } : commandLineEndPos,
			editor.offsetToPos(editor.getValue().length)
		);
		const combinedContent = tempContentBefore + tempContentAfter;
		const chatSeparatorGg = settings.chatSeparator;

		if (!combinedContent.includes(chatSeparatorGg)) {
			new Notice(`Archive command ('${settings.archiveCommandPhrase}') requires at least one chat separator ('${chatSeparatorGg}') in the note (excluding the command line).`);
			// Do not remove the command line if check fails
			return;
		}

		// Determine the end of the range to remove (command line + its newline, or just command line if last line)
		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 } // Remove the line and its newline
			: commandLineEndPos; // Just remove the content if it's the last line

		// Remove the command line (and its newline if applicable)
		editor.replaceRange('', commandLineStartPos, rangeToRemoveEnd);

		// Set cursor position *before* the async operation
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Show status *before* calling the potentially slow archive function if using model
		if (settings.enableArchiveRenameLlm) {
			const titleModel = settings.llmRenameModel || settings.defaultModel;
			if (titleModel && settings.apiKey) {
				new Notice(`Calling ${titleModel} to generate title...`, 5000); // Temporary notice
			} else {
				log.warn("Archive rename with LLM enabled, but API key or model not set. Skipping notice.");
			}
		}

		(async () => {
			try {
				const newPath = await this.plugin.fileSystemService.moveFileToArchive(
					file,
					settings.archiveFolderName,
					settings
				);
				if (newPath) {
					// Parse new name and folder from the returned path
					const newName = newPath.split('/').pop() || file.basename; // Fallback to original basename
					const archiveFolder = settings.archiveFolderName; // Use the setting value

					// Show persistent notice
					new Notice(`Renamed to ${newName}\nMoved to ${archiveFolder}`);

					// Append status to the *content* of the archived file
					await this.appendStatusToFile(newPath, newName, archiveFolder);

				} else {
					new Notice("Failed to archive note.");
					log.warn("FileSystemService.moveFileToArchive returned null.");
					// Consider adding back the command line if archive fails? Might be complex.
				}
			} catch (error) {
				console.error("Error during note archive:", error);
				new Notice("Failed to archive note. Check console for details.");
			}
		})();
	}

	/**
	 * Handles new chat command activation.
	 * Removes command line and creates a new chat note.
	 */
	public triggerNewChatCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		// Define the range for the command line itself
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		// Determine the end of the range to remove (command line + its newline, or just command line if last line)
		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 } // Remove the line and its newline
			: commandLineEndPos; // Just remove the content if it's the last line

		// Remove the command line (and its newline if applicable)
		editor.replaceRange('', commandLineStartPos, rangeToRemoveEnd);

		// Set cursor position *before* executing the command
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Execute the command *after* modifying the editor
		// @ts-ignore - Assuming 'commands' exists on app
		this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
		new Notice("Creating new chat note...");
	}

	/**
	 * Handles model selection command activation.
	 * Removes command line and opens the model selector modal.
	 */
	public triggerModelCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number
	): void {
		// Define the range for the command line itself
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		// Determine the end of the range to remove (command line + its newline, or just command line if last line)
		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 } // Remove the line and its newline
			: commandLineEndPos; // Just remove the content if it's the last line

		// Remove the command line (and its newline if applicable)
		editor.replaceRange('', commandLineStartPos, rangeToRemoveEnd);

		// Set cursor position *before* opening the modal
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Open the modal
		new ModelSelectorModal(this.plugin).open();
		log.debug(`Executed model command ('${settings.modelCommandPhrase}') on line ${commandLineIndex}. Opening modal.`);
	}
}
