import { Editor, MarkdownView, Notice, Plugin, moment, normalizePath } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { OpenRouterService } from './OpenRouterService';
import { EditorHandler } from './EditorHandler';
import { FileSystemService } from './FileSystemService';
import { PluginSettings, DEFAULT_SETTINGS, LogLevel } from './types';
import { log, initializeLogger } from './utils/logger';
import { encryptApiKey, decryptApiKey } from './utils/encryption';
import {
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	CHAT_SEPARATOR,
	MODEL_COMMAND_DEFAULT
} from './constants';
DEFAULT_SETTINGS.chatCommandPhrase = CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.archiveCommandPhrase = ARCHIVE_COMMAND_DEFAULT;
DEFAULT_SETTINGS.newChatCommandPhrase = NEW_CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.modelCommandPhrase = MODEL_COMMAND_DEFAULT;
DEFAULT_SETTINGS.chatSeparator = CHAT_SEPARATOR;

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;
	chatService: ChatService;
	openRouterService: OpenRouterService;
	editorHandler: EditorHandler;
	fileSystemService: FileSystemService;

	private activeMarkdownView: MarkdownView | null = null;
	private activeEditorKeyDownTarget: EventTarget | null = null;
	private boundKeyDownHandler: ((evt: KeyboardEvent) => void) | null = null;
	private commandMap: Record<string, ((editor: Editor, view: MarkdownView, line: number) => void) | undefined> = {};
	private lastSettingsHash: string = '';
	private spacebarCommandTimeoutIds: Map<string, number> = new Map();

	async onload() {
		log.debug('Loading Simple Note Chat plugin');
		await this.loadSettings();
		initializeLogger(this.settings); // Initialize logger with loaded settings

		this.updateCommandMap();
		this.lastSettingsHash = this.getSettingsHash();

		this.openRouterService = new OpenRouterService();

		if (this.settings.apiKey) {
			this.openRouterService.getCachedModels(this.settings.apiKey)
				.then(() => log.debug('Models prefetched on plugin load'))
				.catch(err => log.error('Error prefetching models:', err));
		}
		this.chatService = new ChatService(this, this.openRouterService);
		this.fileSystemService = new FileSystemService(this.app, this.openRouterService);
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
			this.unregisterScopedKeyDownHandler();

			if (leaf?.view instanceof MarkdownView) {
				const view = leaf.view;
				const target = view.containerEl;

				const boundHandler = this.handleKeyDown.bind(this, view);
				this.boundKeyDownHandler = boundHandler;
				target.addEventListener('keydown', boundHandler);

				this.activeMarkdownView = view;
				this.activeEditorKeyDownTarget = target;
				log.debug("Registered scoped keydown handler for active MarkdownView");
			}
		}));

		// Check for active markdown view on plugin load
		const currentLeaf = this.app.workspace.activeLeaf;
		if (currentLeaf?.view instanceof MarkdownView) {
			const view = currentLeaf.view;
			const target = view.containerEl;
			const boundHandler = this.handleKeyDown.bind(this, view);
			this.boundKeyDownHandler = boundHandler;
			target.addEventListener('keydown', boundHandler);
			this.activeMarkdownView = view;
			this.activeEditorKeyDownTarget = target;
			log.debug("Registered initial scoped keydown handler");
		}


		this.addCommand({
			id: 'create-new-chat-note',
			name: 'Create New Chat Note',
			callback: async () => {
				try {
					let targetFolder = '';
					if (this.settings.newNoteLocation === 'current') {
						const currentFile = this.app.workspace.getActiveFile();
						if (currentFile && currentFile.parent) {
							targetFolder = currentFile.parent.path;
						} else {
							targetFolder = '/';
							log.debug("No active file or parent folder found, using vault root for new note.");
						}
					} else if (this.settings.newNoteLocation === 'custom') {
						targetFolder = this.settings.newNoteCustomFolder;
					} else {
						targetFolder = this.settings.archiveFolderName;
					}

					// Normalize the targetFolder path
					if (targetFolder && targetFolder !== '/') {
						targetFolder = normalizePath(targetFolder);
					} else if (targetFolder === '') { // Handle case where custom path might be empty
						targetFolder = '/'; // Default to root if empty
					}


					// Ensure target folder exists
					// For root, no check/creation is needed. For others, check and create.
					if (targetFolder !== '/') {
						const folderExists = this.app.vault.getAbstractFileByPath(targetFolder) !== null;
						if (!folderExists) {
							try {
								await this.app.vault.createFolder(targetFolder);
								log.debug(`Created target folder: ${targetFolder}`);
							} catch (folderError) {
								log.error(`Failed to create target folder "${targetFolder}":`, folderError);
								new Notice(`Failed to create folder "${targetFolder}". Using vault root.`);
								targetFolder = '/'; // Fallback to root on folder creation error
							}
						}
					}

					// Construct title using prefix, format, and suffix
					const formattedDate = moment().format(this.settings.newNoteTitleFormat || DEFAULT_NN_TITLE_FORMAT);
					const prefix = this.settings.newNoteTitlePrefix || '';
					const suffix = this.settings.newNoteTitleSuffix || '';
					const title = `${prefix}${formattedDate}${suffix}`;

					const baseFilename = `${title}.md`;
					const availablePath = await this.fileSystemService.findAvailablePath(targetFolder, baseFilename);

					const newFile = await this.app.vault.create(availablePath, '');
					await this.app.workspace.openLinkText(newFile.path, '', false); // Ensure leaf is open before notice
					new Notice(`Created new chat note: ${newFile.basename}`);

				} catch (error) {
					log.error("Error creating new chat note:", error);
					new Notice("Error creating new chat note. Check console for details.");
				}
			}
		});
		this.addCommand({
			id: 'trigger-chat-completion-cc',
			name: 'Trigger Chat Completion (cc)',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const file = view.file;
				if (!file) {
					new Notice("Cannot trigger chat: No active file.");
					log.error("Trigger chat completion hotkey failed: No active file.");
					return;
				}
				log.debug(`Triggering chat completion via hotkey for file: ${file.path}`);
				const cursor = editor.getCursor(); // Get cursor position
				this.chatService.startChat(editor, file, this.settings, cursor)
					.catch((error: Error) => {
						log.error("Error starting chat from hotkey:", error);
						new Notice("Failed to start chat. See console for details.");
					});
			}
		});

		this.addCommand({
			id: 'archive-current-note',
			name: 'Archive Current Note',
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					return false; // No active file to archive
				}

				if (checking) {
					return true; // Command is available if there's an active file
				}

				// Execute the archive logic - moveFileToArchive handles notifications
				this.fileSystemService.moveFileToArchive(
					activeFile,
					this.settings.archiveFolderName,
					this.settings
				);

				return true;
			}
		});

		this.addCommand({
			id: 'change-chat-model',
			name: 'Change Chat Model',
			callback: () => {
				this.editorHandler.openModelSelectorModal();
				log.debug("Executed 'change model' command via hotkey.");
			}
		});
	}

	onunload() {
		log.debug('Unloading Simple Note Chat plugin');
		// Ensure the listener is removed when the plugin unloads
		this.unregisterScopedKeyDownHandler();
	}

	private unregisterScopedKeyDownHandler() {
		if (this.activeEditorKeyDownTarget && this.boundKeyDownHandler) {
			this.activeEditorKeyDownTarget.removeEventListener('keydown', this.boundKeyDownHandler);
			log.debug("Unregistered scoped keydown handler");
		}
		// Clear all pending spacebar timeouts when unregistering
		this.spacebarCommandTimeoutIds.forEach(timeoutId => clearTimeout(timeoutId));
		this.spacebarCommandTimeoutIds.clear();

		this.activeMarkdownView = null;
		this.activeEditorKeyDownTarget = null;
		this.boundKeyDownHandler = null;
	}


	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		this.settings.chatSeparator = CHAT_SEPARATOR; // Ensure the constant is always used

		// Decrypt the API key if it exists and is encrypted
		if (this.settings.apiKey) {
			this.settings.apiKey = decryptApiKey(this.settings.apiKey);
		}
	}

	async saveSettings() {
		// Create a copy of settings for saving with encrypted API key
		const settingsToSave = { ...this.settings };

		// Encrypt the API key before saving
		if (settingsToSave.apiKey) {
			settingsToSave.apiKey = encryptApiKey(settingsToSave.apiKey);
		}

		await this.saveData(settingsToSave);

		// Update command map when settings change
		this.updateCommandMap();
		initializeLogger(this.settings); // Re-initialize logger with new settings
		this.lastSettingsHash = this.getSettingsHash();
	}

	/**
	 * Creates a hash string representing the current command phrase settings
	 * to detect when settings change.
	 */
	private getSettingsHash(): string {
		return [
			this.settings.chatCommandPhrase,
			this.settings.archiveCommandPhrase,
			this.settings.modelCommandPhrase,
			this.settings.newChatCommandPhrase,
		].join('|');
	}

	/**
	 * Updates the command map based on current settings.
	 */
	private updateCommandMap() {
		this.commandMap = {};

		if (this.settings.chatCommandPhrase) {
			this.commandMap[this.settings.chatCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerChatCommand(editor, view, this.settings, line);
		}
		if (this.settings.archiveCommandPhrase) {
			this.commandMap[this.settings.archiveCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerArchiveCommand(editor, view, this.settings, line);
		}
		if (this.settings.modelCommandPhrase) {
			this.commandMap[this.settings.modelCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerModelCommand(editor, view, this.settings, line);
		}
		if (this.settings.newChatCommandPhrase) {
			this.commandMap[this.settings.newChatCommandPhrase] =
				(editor, view, line) => this.editorHandler.triggerNewChatCommand(editor, view, this.settings, line);
		}
	}

	/**
	 * Handles keydown events for stream cancellation and command triggers.
	 * @param view The MarkdownView instance where the event occurred.
	 * @param evt The keyboard event.
	 */
	private handleKeyDown(view: MarkdownView, evt: KeyboardEvent): void {
		const file = view.file;

		// 1. Basic checks
		if (!file) {
			log.debug("Keydown ignored: No file associated with the view.");
			return;
		}
		const filePath = file.path;

		// Refined Spacebar Timeout Clearing (Requirement 6)
		const existingTimeoutId = this.spacebarCommandTimeoutIds.get(filePath);
		if (existingTimeoutId && evt.key !== ' ') {
			clearTimeout(existingTimeoutId);
			this.spacebarCommandTimeoutIds.delete(filePath);
			log.debug(`Cleared spacebar command timeout for ${filePath} due to subsequent non-space key press: ${evt.key}`);
		}

		// Handle Escape key
		if (this.handleEscapeKey(view, evt)) {
			return; // Escape was handled
		}

		// If a stream is active, ignore further processing for Enter and Space
		if (this.chatService.isStreamActive(filePath)) {
			if (evt.key === 'Enter' || evt.key === ' ') {
				log.debug(`${evt.key} key ignored: Stream active for ${filePath}.`);
				return;
			}
		}

		// Implement Early Exit for Non-Command Keys
		const isEnterKey = evt.key === 'Enter';
		const isSpaceKeyForCommand = evt.key === ' ' && this.settings.enableSpacebarDetection;

		if (!isEnterKey && !isSpaceKeyForCommand) {
			return; // Most keystrokes exit here
		}

		// At this point, only Enter or Space (if enabled) will proceed.

		// Dispatch to specific key handlers
		if (isEnterKey) {
			this.handleEnterKey(view, evt);
			return;
		}

		if (isSpaceKeyForCommand) {
			this.handleSpaceKey(view, evt);
			return;
		}
	}

	/**
	 * Handles the Escape key press, primarily for stream cancellation.
	 * @param view The MarkdownView instance.
	 * @param evt The keyboard event.
	 * @returns True if the event was handled, false otherwise.
	 */
	private handleEscapeKey(view: MarkdownView, evt: KeyboardEvent): boolean {
		if (evt.key !== 'Escape') return false;

		const editor = view.editor;
		const file = view.file; // Already checked for null in handleKeyDown
		const filePath = file!.path;

		log.debug(`Key: Escape, File: ${filePath}`);
		const isActive = this.chatService.isStreamActive(filePath);
		if (isActive && this.chatService.cancelStream(filePath, editor, this.settings)) {
			log.debug("Stream cancellation successful via Escape.");
			evt.preventDefault();
			evt.stopPropagation();
			return true;
		} else if (isActive) {
			log.debug("Stream cancellation via Escape failed or no stream to cancel.");
			return true; // Still handled as Escape's purpose here is stream-related
		}
		return false; // No active stream to cancel
	}

	/**
	 * Handles the Enter key press for command execution.
	 * @param view The MarkdownView instance.
	 * @param evt The keyboard event.
	 */
	private handleEnterKey(view: MarkdownView, evt: KeyboardEvent): void {
		const editor = view.editor;
		const file = view.file!; // Already checked for null in handleKeyDown
		const filePath = file.path;

		log.debug(`Key: Enter, File: ${filePath}`);

		// Defer Settings Hash Check (Requirement 5)
		const currentSettingsHash = this.getSettingsHash();
		if (this.lastSettingsHash !== currentSettingsHash) {
			this.updateCommandMap();
			this.lastSettingsHash = currentSettingsHash;
			log.debug("Command map updated due to settings change (triggered by Enter).");
		}

		const cursor = editor.getCursor();
		const commandLineNum = cursor.line - 1;
		if (commandLineNum >= 0) {
			const possibleCommand = editor.getLine(commandLineNum).trim();
			const commandHandler = this.commandMap[possibleCommand];
			if (commandHandler) {
				log.debug(`Enter: Found command "${possibleCommand}" on line ${commandLineNum}`);
				evt.preventDefault();
				evt.stopPropagation();
				commandHandler(editor, view, commandLineNum);
			} else {
				log.debug(`Enter: No command found for "${possibleCommand}" on line ${commandLineNum}`);
			}
		}
	}

	/**
	 * Handles the Space key press for command execution (if enabled).
	 * @param view The MarkdownView instance.
	 * @param evt The keyboard event.
	 */
	private handleSpaceKey(view: MarkdownView, evt: KeyboardEvent): void {
		const editor = view.editor;
		const file = view.file!; // Already checked for null in handleKeyDown
		const filePath = file.path;

		log.debug(`Key: Space, File: ${filePath}, Spacebar detection enabled.`);
		// Space key itself should be typed. Do not preventDefault/stopPropagation here.

		// Defer Settings Hash Check (Requirement 5)
		const currentSettingsHash = this.getSettingsHash();
		if (this.lastSettingsHash !== currentSettingsHash) {
			this.updateCommandMap();
			this.lastSettingsHash = currentSettingsHash;
			log.debug("Command map updated due to settings change (triggered by Space).");
		}

		// Clear any existing timeout for this specific file path before setting a new one
		const oldTimeoutId = this.spacebarCommandTimeoutIds.get(filePath);
		if (oldTimeoutId) {
			clearTimeout(oldTimeoutId);
			log.debug(`Cleared previous spacebar timeout for ${filePath} due to new space press.`);
		}

		const triggerCursor = editor.getCursor(); // Store cursor position at the time space was pressed

		const newTimeoutId = window.setTimeout(() => {
			this.spacebarCommandTimeoutIds.delete(filePath);

			const commandLineNum = triggerCursor.line;
			const textBeforeSpace = editor.getLine(commandLineNum)
										.substring(0, triggerCursor.ch)
										.trim();

			log.debug(`Spacebar timeout: Checking for command "${textBeforeSpace}" on line ${commandLineNum} (cursor was at ch ${triggerCursor.ch})`);

			const commandHandler = this.commandMap[textBeforeSpace];
			if (commandHandler) {
				log.debug(`Spacebar: Found command "${textBeforeSpace}" on line ${commandLineNum}. Executing.`);
				commandHandler(editor, view, commandLineNum);
			} else {
				log.debug(`Spacebar: No command found for "${textBeforeSpace}"`);
			}
		}, this.settings.spacebarDetectionDelay * 1000);
		this.spacebarCommandTimeoutIds.set(filePath, newTimeoutId);
	}
}
