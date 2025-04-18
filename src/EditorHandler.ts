import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main';
import { PluginSettings } from './types';
import { log } from './utils/logger';

// Command handlers are now mapped directly to phrases

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
		// Note: <phrase><Enter> is now handled by handleKeyDown in main.ts

		const lines = editor.getValue().split('\n');

		// 1. locate last content line (≠ empty after trim)
		let lastContentLineIdx = lines.length - 1;
		while (lastContentLineIdx >= 0 && lines[lastContentLineIdx].trim() === '') {
			lastContentLineIdx--;
		}
		if (lastContentLineIdx < 0) return;                      // whole file is blank
		const lastContentLine = lines[lastContentLineIdx];

		// 2. build phrase→handler map (as before)
		const commandHandlers: Record<string, () => void> = {};
		if (settings.chatCommandPhrase)  commandHandlers[settings.chatCommandPhrase]  = () => this._handleChatCommand(editor, markdownView, settings, lastContentLineIdx, lines);
		if (settings.archiveCommandPhrase) commandHandlers[settings.archiveCommandPhrase] = () => this._handleArchiveCommand(editor, markdownView, settings, lastContentLineIdx, lines);
		if (settings.newChatCommandPhrase && settings.enableNnCommandPhrase)
			commandHandlers[settings.newChatCommandPhrase] = () => this._handleNewChatCommand(editor, markdownView, settings, lastContentLineIdx, lines);

		// 3a.  <phrase><Enter> variant  (i.e. at least one blank line follows)
		const hasTrailingBlank = lastContentLineIdx < lines.length - 1;
		if (hasTrailingBlank && commandHandlers[lastContentLine]) {
			commandHandlers[lastContentLine]();
			return;
		}

		// 3b.  <phrase><space> variant  (no blank line yet, ends with space)
		const trimmed = lastContentLine.trimEnd();              // drop right‑side spaces
		if (lastContentLine.endsWith(' ') && commandHandlers[trimmed]) {
			const timeout = setTimeout(() => {
				// re‑check that nothing changed during the delay
				const currentLines = editor.getValue().split('\n');
				const idx = currentLines.length - 1;
				if (idx >= 0 && currentLines[idx] === lastContentLine) {
					commandHandlers[trimmed]();
				}
				this.activationTimers.delete(filePath);
			}, 500);                                            // 0.5 s
			this.activationTimers.set(filePath, timeout);
		}
	}

	/**
	 * Helper to set cursor to the end of the line before the command line
	 */
	private _setCursorBeforeCommand(editor: Editor, commandLineIndex: number): void {
		const targetLineIndex = commandLineIndex - 1;
		if (targetLineIndex >= 0) {
			const targetLineLength = editor.getLine(targetLineIndex).length;
			editor.setCursor({ line: targetLineIndex, ch: targetLineLength });
		} else {
			editor.setCursor({ line: 0, ch: 0 }); // Move to start if document is now empty or command was on first line
		}
	}

	/**
	 * Handle the chat command (cc)
	 */
	private _handleChatCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number,
		lines: string[]
	): void {
		const file = markdownView.file;
		if (!file) {
			log.error(`Cannot execute chat command: markdownView.file is null.`);
			new Notice(`Failed to execute chat command: No active file.`);
			return;
		}

		// Define positions for the command line and all subsequent empty lines
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		// The end position is the end of the entire document to capture all trailing lines
		const rangeEndPos: EditorPosition = editor.offsetToPos(editor.getValue().length);

		// Ensure status message ends with a newline
		const statusMessage = `Calling ${settings.defaultModel}...\n`;

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
		log.debug(`Replaced command line and trailing empty lines with status. Range: [${statusMessageStartPos.line}, ${statusMessageStartPos.ch}] to end of doc. New End: [${statusMessageEndPos.line}, ${statusMessageEndPos.ch}]`);

		// Call startChat with the correct positions relative to the *new* content
		this.plugin.chatService.startChat(
			editor,
			file,
			settings,
			statusMessageStartPos, // Position where status message starts
			statusMessageEndPos   // Position where status message ends (calculated above)
		).catch(error => {
			log.error("Error starting chat:", error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			try {
				// Attempt to replace the *original* status message range with the error
				// Need to re-calculate the end position based on the *current* content if the status message was modified
				const currentStatusEndOffset = editor.posToOffset(statusMessageStartPos) + statusMessage.length;
				const currentStatusEndPos = editor.offsetToPos(currentStatusEndOffset);
				editor.replaceRange(`Error: ${errorMessage}\n`, statusMessageStartPos, currentStatusEndPos);
			} catch (replaceError) {
				log.error("Failed to replace status message with error:", replaceError);
				new Notice(`Chat Error: ${errorMessage}`); // Fallback notice
			}
		});
	}

	/**
	 * Handle the archive command (gg)
	 */
	private _handleArchiveCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number,
		lines: string[]
	): void {
		const file = markdownView.file;
		if (!file) {
			log.error(`Cannot execute archive command: markdownView.file is null.`);
			new Notice(`Failed to execute archive command: No active file.`);
			return;
		}

		// Define positions for the command line and all subsequent empty lines
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		// The end position is the end of the entire document to capture all trailing lines
		const rangeEndPos: EditorPosition = editor.offsetToPos(editor.getValue().length);

		// Check for separator *before* removing lines
		const noteContentGg = editor.getValue();
		const chatSeparatorGg = settings.chatSeparator;
		if (!noteContentGg.includes(chatSeparatorGg)) {
			new Notice(`Archive command ('${settings.archiveCommandPhrase}') requires at least one chat separator ('${chatSeparatorGg}') in the note.`);
			// Do not remove the command lines if check fails
			return;
		}

		// Remove command line and all subsequent empty lines
		editor.replaceRange('', commandLineStartPos, rangeEndPos);
		this._setCursorBeforeCommand(editor, commandLineIndex); // Set cursor before async operation

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
					// Consider adding back the command lines if archive fails? Might be complex.
				}
			} catch (error) {
				console.error("Error during note archive:", error);
				new Notice("Failed to archive note. Check console for details.");
			}
		})();
	}

	/**
	 * Handle the new chat command (nn)
	 */
	private _handleNewChatCommand(
		editor: Editor,
		markdownView: MarkdownView,
		settings: PluginSettings,
		commandLineIndex: number,
		lines: string[]
	): void {
		// Define positions for the command line and all subsequent empty lines
		const commandLineStartPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		// The end position is the end of the entire document to capture all trailing lines
		const rangeEndPos: EditorPosition = editor.offsetToPos(editor.getValue().length);

		// Remove command line and all subsequent empty lines
		editor.replaceRange('', commandLineStartPos, rangeEndPos);
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Execute the command *after* modifying the editor
		// @ts-ignore - Assuming 'commands' exists on app
		this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
		new Notice("Creating new chat note...");
	}
}
