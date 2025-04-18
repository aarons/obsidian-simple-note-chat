import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main'; // Assuming main exports the class as default
import { PluginSettings } from './types';
import { log } from './utils/logger';

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

		// cancel any pending 0.5‑second activations for this file
		const pending = this.activationTimers.get(filePath);
		if (pending) {
			clearTimeout(pending);
			this.activationTimers.delete(filePath);
		}

		// --- Prevent Command Phrase Detection During Active Stream ---
		// If a stream is active, we don't want to accidentally trigger
		// command phrases like 'cc ' or 'gg<Enter>'. The stream can only
		// be stopped via the Escape key (handled in main.ts).
		if (this.plugin.chatService.isStreamActive(filePath)) {
			return; // Don't process command phrases while streaming
		}

		// --- Detect Command Phrases (<phrase><space>[0.5s]) ---
		// This handles the case where the user types 'cc ' and pauses.
		// The <phrase><Enter> case is handled by handleKeyDown in main.ts

		const lines = editor.getValue().split('\n');

		// 1. Locate the last line containing non-whitespace content
		let lastContentLineIdx = lines.length - 1;
		while (lastContentLineIdx >= 0 && lines[lastContentLineIdx].trim() === '') {
			lastContentLineIdx--;
		}
		if (lastContentLineIdx < 0) return; // whole file is blank
		const lastContentLine = lines[lastContentLineIdx];

		// 2. Check for <phrase><space> variant on the last content line
		const trimmed = lastContentLine.trimEnd(); // drop right‑side spaces
		if (lastContentLine.endsWith(' ')) {
			let commandHandler: (() => void) | null = null;

			if (trimmed === settings.chatCommandPhrase) {
				commandHandler = () => this.triggerChatCommand(editor, markdownView, settings, lastContentLineIdx);
			} else if (trimmed === settings.archiveCommandPhrase) {
				commandHandler = () => this.triggerArchiveCommand(editor, markdownView, settings, lastContentLineIdx);
			} else if (settings.enableNnCommandPhrase && trimmed === settings.newChatCommandPhrase) {
				commandHandler = () => this.triggerNewChatCommand(editor, markdownView, settings, lastContentLineIdx);
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
	 * Helper to set cursor to the end of the line *before* the command line (if possible)
	 * or to the start of the document if the command was on the first line.
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
	 * Triggered by Enter keydown or space-timeout on the chat command phrase.
	 * Replaces the command phrase line with a status message and starts the chat.
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

		// Define the range for the command line itself
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const commandLineEndPos: EditorPosition = { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };

		// Determine the end of the range to replace (command line + its newline, or just command line if last line)
		const rangeToRemoveEnd = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 } // Remove the line and its newline
			: commandLineEndPos; // Just remove the content if it's the last line

		// Ensure status message starts and ends with a newline for separation
		const statusMessage = `\nCalling ${settings.defaultModel}...\n`;

		// Replace the command line (and its newline if applicable) with the status message
		editor.replaceRange(statusMessage, commandLineStartPos, rangeToRemoveEnd);

		// Calculate the start and end positions *of the inserted status message*
		// IMPORTANT: The statusMessage starts with '\n', so the actual text begins on the next line.
		const actualStatusTextStartPos: EditorPosition = { line: commandLineStartPos.line + 1, ch: 0 };
		// The end position is calculated relative to the *actual* start of the text.
		// We need the length of the status message *excluding* the leading '\n'.
		const statusTextLength = statusMessage.trimStart().length;
		const statusMessageEndOffset = editor.posToOffset(actualStatusTextStartPos) + statusTextLength;
		const statusMessageEndPos = editor.offsetToPos(statusMessageEndOffset);


		// Set cursor to the beginning of the actual status text (ready for stream)
		editor.setCursor(actualStatusTextStartPos);
		log.debug(`Replaced command line ${commandLineIndex} with status. Status Range for ChatService: [${actualStatusTextStartPos.line}, ${actualStatusTextStartPos.ch}] to [${statusMessageEndPos.line}, ${statusMessageEndPos.ch}]`);

		// Call startChat. The range passed should be where the *actual status text* is,
		// so the ChatService knows where to replace it with the actual response.
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
	 * Triggered by Enter keydown or space-timeout on the archive command phrase.
	 * Removes the command phrase line and initiates the archive process.
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

		// Check for separator *before* removing the command line
		// We need to exclude the command line itself from the check
		const tempContentBefore = editor.getRange({line: 0, ch: 0}, commandLineStartPos); // Content *before* the command line
		const tempContentAfter = editor.getRange(
			(commandLineIndex < editor.lastLine()) ? { line: commandLineIndex + 1, ch: 0 } : commandLineEndPos,
			editor.offsetToPos(editor.getValue().length)
		); // Content *after* the command line
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

		(async () => {
			try {
				const newPath = await this.plugin.fileSystemService.moveFileToArchive(
					file,
					settings.archiveFolderName,
					settings
				);
				if (newPath) { new Notice(`Note archived to: ${newPath}`); }
				else {
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
	 * Triggered by Enter keydown or space-timeout on the new chat command phrase.
	 * Removes the command phrase line and executes the new chat command.
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
}
