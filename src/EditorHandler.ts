import { App, Editor, MarkdownView, TFile, EditorPosition, Notice } from 'obsidian';
import SimpleNoteChat from './main'; // Assuming main exports the class as default
import { PluginSettings } from './types';
import { log } from './utils/logger';
import { ModelSelectorModal } from './ModelSelectorModal'; // Added import

export class EditorHandler {
	private app: App;
	private plugin: SimpleNoteChat;

	constructor(app: App, plugin: SimpleNoteChat) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * Removes the command phrase line (including its trailing newline when it isn't
	 * the last line) and returns the position where the line started.
	 */
	private removeCommandLine(editor: Editor, commandLineIndex: number): EditorPosition {
		const startPos: EditorPosition = { line: commandLineIndex, ch: 0 };
		const endPos: EditorPosition = (commandLineIndex < editor.lastLine())
			? { line: commandLineIndex + 1, ch: 0 }
			: { line: commandLineIndex, ch: editor.getLine(commandLineIndex).length };
		editor.replaceRange('', startPos, endPos);
		return startPos;
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

		const commandLineStartPos = this.removeCommandLine(editor, commandLineIndex);

		// Start chat, providing the position where the status message started
		this.plugin.chatService.startChat(
			editor,
			file,
			settings,
			commandLineStartPos // Position where status message was inserted
		).catch((error: Error) => { // Add type to error
			log.error("Error starting chat from command phrase:", error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			// Log the error. startChat handles cleanup and user notification.
			log.error(`Chat Error from command phrase: ${errorMessage}. Relying on startChat cleanup.`);
			// No need for fallback insertion here, startChat handles its errors internally.
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

		this.removeCommandLine(editor, commandLineIndex);

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
					settings,
					editor // Pass the editor instance
				);
				// Parse new name from the returned path
				const newName = newPath.split('/').pop() || file.basename; // Fallback to original basename

				// Show persistent notice
				new Notice(`Renamed to ${newName}\nMoved to ${settings.archiveFolderName}`);
			} catch (error) {
				log.error("Error during note archive:", error);
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`Failed to archive note: ${message}`);
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
		this.removeCommandLine(editor, commandLineIndex);

		// Set cursor position *before* creating the note
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Create the note *after* modifying the editor
		this.plugin.createNewChatNote();
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
		this.removeCommandLine(editor, commandLineIndex);

		// Set cursor position *before* opening the modal
		this._setCursorBeforeCommand(editor, commandLineIndex);

		// Open the modal
		new ModelSelectorModal(this.plugin).open();
		log.debug(`Executed model command ('${settings.modelCommandPhrase}') on line ${commandLineIndex}. Opening modal.`);
	}

	/**
		* Opens the model selector modal directly.
		* Intended for use by commands/hotkeys.
		*/
	public openModelSelectorModal(): void {
		new ModelSelectorModal(this.plugin).open();
		log.debug("Opened model selector modal via command/hotkey.");
	}
}
