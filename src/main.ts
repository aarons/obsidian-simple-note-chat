import { App, Editor, MarkdownView, Notice, Plugin, PluginSettingTab, Setting, moment } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { OpenRouterService } from './OpenRouterService';
import { EditorHandler } from './EditorHandler';
import { FileSystemService } from './FileSystemService';
import { PluginSettings, DEFAULT_SETTINGS } from './types';
import {
	DEFAULT_NN_TITLE_FORMAT,
	CC_COMMAND_DEFAULT,
	GG_COMMAND_DEFAULT,
	DD_COMMAND_DEFAULT,
	NN_COMMAND_DEFAULT,
	CHAT_SEPARATOR_DEFAULT
} from './constants';

// Settings interface and defaults are now imported from './types'
// Assign the actual defaults from constants to the imported DEFAULT_SETTINGS object
DEFAULT_SETTINGS.ccCommandPhrase = CC_COMMAND_DEFAULT;
DEFAULT_SETTINGS.ggCommandPhrase = GG_COMMAND_DEFAULT;
DEFAULT_SETTINGS.ddCommandPhrase = DD_COMMAND_DEFAULT;
DEFAULT_SETTINGS.nnCommandPhrase = NN_COMMAND_DEFAULT;
DEFAULT_SETTINGS.chatSeparator = CHAT_SEPARATOR_DEFAULT;

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;
	chatService: ChatService;
	openRouterService: OpenRouterService;
	editorHandler: EditorHandler;
	fileSystemService: FileSystemService;

	async onload() {
		console.log('Loading Simple Note Chat plugin');
		await this.loadSettings();

		this.openRouterService = new OpenRouterService();
		this.chatService = new ChatService(this, this.openRouterService);
		this.fileSystemService = new FileSystemService(this.app, this.openRouterService); // Pass OpenRouterService
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-change', this.editorHandler.handleEditorChange)
		);

		// Register Escape key listener for stopping streams
		this.registerDomEvent(document, 'keydown', this.handleKeyDown.bind(this));

		// --- Add New Chat Command ---
		this.addCommand({
			id: 'create-new-chat-note',
			name: 'Create New Chat Note',
			callback: async () => {
				try {
					// --- Optional: Archive previous note ---
					if (this.settings.archivePreviousNoteOnNn) {
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile) {
							try {
								const content = await this.app.vault.read(activeFile);
								if (content.includes(this.settings.chatSeparator)) { // Use setting
									// Pass the whole settings object now
									const archiveResult = await this.fileSystemService.moveFileToArchive(activeFile, this.settings.archiveFolderName, this.settings);
									if (archiveResult === null) {
										new Notice(`Failed to archive previous note '${activeFile.name}'. Continuing to create new note.`);
									} else {
										new Notice(`Archived '${activeFile.name}'.`); // Optional success notice
									}
								} else {
									new Notice(`Previous note '${activeFile.name}' not archived because it lacks a chat separator.`);
								}
							} catch (archiveError) {
								console.error(`Error during pre-nn archive attempt for ${activeFile.name}:`, archiveError);
								new Notice(`Error trying to archive previous note '${activeFile.name}'. Continuing to create new note.`);
							}
						}
						// If no active file, do nothing regarding archiving.
					}
					// --- End Optional Archive ---

					// --- Create New Note (Original Logic) ---
					const parentPath = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path || '').path;
					const title = moment().format(DEFAULT_NN_TITLE_FORMAT);
					// Ensure parentPath ends with a slash if it's not the root
					const separator = parentPath === '/' ? '' : '/';
					const fullPath = `${parentPath}${separator}${title}.md`;

					const newFile = await this.app.vault.create(fullPath, '');
					this.app.workspace.openLinkText(newFile.path, '', false); // Open in current leaf
					new Notice(`Created new chat note: ${title}.md`);
				} catch (error) {
					console.error("Error creating new chat note:", error);
					new Notice("Error creating new chat note. Check console for details.");
				}
			}
		});
		// --- End New Chat Command ---

		// --- Add CC Shortcut Command ---
		this.addCommand({
			id: 'trigger-chat-completion-cc',
			name: 'Trigger Chat Completion (cc)',
			checkCallback: (checking: boolean) => {
				// 1. Check if the setting is enabled
				if (!this.settings.enableCcShortcut) {
					return false; // Command is disabled if setting is off
				}

				// 2. Check if there's an active Markdown view
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView) {
					return false; // No active markdown view
				}

				// 3. If just checking, return true (command is available)
				if (checking) {
					return true;
				}

				// 4. If executing, simulate typing 'cc' at the end
				const editor = activeView.editor;
				const docEnd = editor.offsetToPos(editor.getValue().length);
				const currentContent = editor.getValue();
				// Ensure there's a newline before adding cc, if needed, and add the phrase + newline
				const textToInsert = (currentContent.endsWith('\n') ? '' : '\n') + this.settings.ccCommandPhrase + '\n';
				editor.replaceRange(textToInsert, docEnd, docEnd);
				// Move cursor to the end after insertion
				const newEndPos = editor.offsetToPos(editor.posToOffset(docEnd) + textToInsert.length);
				editor.setCursor(newEndPos);

				// EditorHandler will detect the change and trigger the chat
				console.log("Executed 'cc' shortcut command, inserted phrase.");
				return true; // Indicate successful execution (though the real work is done by EditorHandler)
			}
		});
		// --- End CC Shortcut Command ---

		// --- Conditionally Add Ribbon Icon for New Chat ---
		if (this.settings.enableNnRibbonButton) {
			this.addRibbonIcon('message-square-plus', 'Create New Chat Note', () => {
				// @ts-ignore - Assuming 'commands' exists on app, potentially a typing issue
				this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
			});
		}
		// --- End Ribbon Icon ---
	}

	onunload() {
		console.log('Unloading Simple Note Chat plugin');
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
		* Handles keydown events globally to catch the Escape key for stream cancellation.
		* @param evt The keyboard event.
		*/
	private handleKeyDown(evt: KeyboardEvent): void {
		if (evt.key === 'Escape') {
			const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (activeView && activeView.file) {
				const filePath = activeView.file.path;
				if (this.chatService.isStreamActive(filePath)) {
					console.log(`Escape key pressed, attempting to cancel stream for: ${filePath}`);
					if (this.chatService.cancelStream(filePath)) {
						new Notice("Chat stream cancelled.");
						// Optionally prevent other Escape key handlers
						// evt.preventDefault();
						// evt.stopPropagation();
					}
				}
			}
		}
	}
}

// The SimpleNoteChatSettingTab class has been moved to src/SettingsTab.ts
// The import statement at the top of the file now brings it in.
// The this.addSettingTab call in onload() will now use the imported class.
