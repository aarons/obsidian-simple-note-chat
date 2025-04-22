import { Editor, MarkdownView, Notice, Plugin, moment } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { OpenRouterService } from './OpenRouterService';
import { EditorHandler } from './EditorHandler';
import { FileSystemService } from './FileSystemService';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import { log } from './utils/logger';
import {
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	CHAT_SEPARATOR_DEFAULT,
	MODEL_COMMAND_DEFAULT
} from './constants';
DEFAULT_SETTINGS.chatCommandPhrase = CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.archiveCommandPhrase = ARCHIVE_COMMAND_DEFAULT;
DEFAULT_SETTINGS.newChatCommandPhrase = NEW_CHAT_COMMAND_DEFAULT;
DEFAULT_SETTINGS.modelCommandPhrase = MODEL_COMMAND_DEFAULT;
DEFAULT_SETTINGS.chatSeparator = CHAT_SEPARATOR_DEFAULT;

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

	async onload() {
		log.debug('Loading Simple Note Chat plugin');
		await this.loadSettings();

		this.updateCommandMap();
		this.lastSettingsHash = this.getSettingsHash();

		this.openRouterService = new OpenRouterService();

		// Preload models if API key is set
		if (this.settings.apiKey) {
			this.openRouterService.getCachedModels(this.settings.apiKey)
				.then(() => log.debug('Models prefetched on plugin load'))
				.catch(err => log.error('Error prefetching models:', err));
		}
		this.chatService = new ChatService(this, this.openRouterService);
		this.fileSystemService = new FileSystemService(this.app, this.openRouterService);
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-change', this.editorHandler.handleEditorChange)
		);

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
				const previousActiveFile = this.app.workspace.getActiveFile();

				try {
					const archiveFolder = this.settings.archiveFolderName.replace(/^\/|\/$/g, '');
					const title = moment().format(DEFAULT_NN_TITLE_FORMAT);
					const fullPath = `${archiveFolder}/${title}.md`;

					const newFile = await this.app.vault.create(fullPath, '');
					await this.app.workspace.openLinkText(newFile.path, '', false); // Ensure leaf is open before notice
					new Notice(`Created new chat note: ${title}.md`);

					// Archive the previous note in the background if enabled
					if (this.settings.archivePreviousNoteOnNn && previousActiveFile) {
						(async () => {
							try {
								const content = await this.app.vault.cachedRead(previousActiveFile);
								if (content.includes(this.settings.chatSeparator)) {
									const archiveResult = await this.fileSystemService.moveFileToArchive(previousActiveFile, this.settings.archiveFolderName, this.settings);
									if (archiveResult === null) {
										new Notice(`Failed to archive previous note '${previousActiveFile.name}'.`);
										log.warn(`Failed background archive for ${previousActiveFile.name}`);
									} else {
										new Notice(`Archived previous note '${previousActiveFile.name}'.`);
										log.info(`Background archive successful for ${previousActiveFile.name}`);
									}
								} else {
									log.info(`Previous note '${previousActiveFile.name}' not archived (no separator).`);
								}
							} catch (archiveError) {
								log.error(`Error during background archive attempt for ${previousActiveFile.name}:`, archiveError);
								new Notice(`Error trying to archive previous note '${previousActiveFile.name}'.`);
							}
						})();
					}

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
				this.chatService.startChat(editor, file, this.settings, cursor) // Use startChat with cursor
					.catch((error: Error) => { // Add type Error
						// Basic error handling, ChatService should show more specific notices
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
		this.activeMarkdownView = null;
		this.activeEditorKeyDownTarget = null;
		this.boundKeyDownHandler = null;
	}


	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);

		// Update command map when settings change
		this.updateCommandMap();
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
			this.settings.newChatCommandPhrase, // Always include NN command phrase
		].join('|');
	}

	/**
	 * Updates the command map based on current settings.
	 */
	private updateCommandMap() {
		this.commandMap = {};

		this.commandMap[this.settings.chatCommandPhrase] =
			(editor, view, line) => this.editorHandler.triggerChatCommand(editor, view, this.settings, line);
		this.commandMap[this.settings.archiveCommandPhrase] =
			(editor, view, line) => this.editorHandler.triggerArchiveCommand(editor, view, this.settings, line);
		this.commandMap[this.settings.modelCommandPhrase] =
			(editor, view, line) => this.editorHandler.triggerModelCommand(editor, view, this.settings, line);
		this.commandMap[this.settings.newChatCommandPhrase] =
			(editor, view, line) => this.editorHandler.triggerNewChatCommand(editor, view, this.settings, line);
	}

	/**
	 * Handles keydown events for stream cancellation and command triggers.
	 * @param view The MarkdownView instance where the event occurred.
	 * @param evt The keyboard event.
	 */
	private handleKeyDown(view: MarkdownView, evt: KeyboardEvent): void {
		if (evt.key !== 'Escape' && evt.key !== 'Enter') {
	 		return;
	 	}

		const file = view.file;
		if (!file) {
			log.debug("Keydown ignored: No file associated with the view.");
			return;
		}
		const filePath = file.path;
		const editor = view.editor;

		log.debug(`handleKeyDown triggered for key: ${evt.key}, file: ${filePath}`);

		// Escape Key: Cancel active stream
		if (evt.key === 'Escape') {
			const isActive = this.chatService.isStreamActive(filePath);
			log.debug(`Escape key pressed. Active stream for ${filePath}: ${isActive}`);
			if (isActive && this.chatService.cancelStream(filePath, editor, this.settings)) {
				log.debug("Stream cancellation successful.");
				evt.preventDefault();
				evt.stopPropagation();
			} else if (isActive) {
				log.debug("Stream cancellation failed.");
			}
			return;
		}

	 	// Enter Key: Trigger command phrases
		if (this.chatService.isStreamActive(filePath)) {
			log.debug("Enter key ignored: Stream active.");
			return;
		}

		const cursor = editor.getCursor();
		const commandLine = cursor.line - 1;

		// Command Matching
		if (cursor.line >= 1) {
			// Check if settings have changed
			const currentSettingsHash = this.getSettingsHash();
			if (this.lastSettingsHash !== currentSettingsHash) {
				this.updateCommandMap();
				this.lastSettingsHash = currentSettingsHash;
			}

			const possibleCommand = editor.getLine(commandLine).trim();

			const commandHandler = this.commandMap[possibleCommand];

			if (commandHandler) {
				evt.preventDefault(); // Prevent default Enter behavior (new line)
				evt.stopPropagation(); // Stop event propagation
				commandHandler(editor, view, commandLine);
			}
	  	}
	}
}

