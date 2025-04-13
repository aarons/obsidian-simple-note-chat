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
		this.fileSystemService = new FileSystemService(this.app, this.openRouterService);
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-change', this.editorHandler.handleEditorChange)
		);

		this.registerDomEvent(document, 'keydown', this.handleKeyDown.bind(this));

		this.addCommand({
			id: 'create-new-chat-note',
			name: 'Create New Chat Note',
			callback: async () => {
				try {
					if (this.settings.archivePreviousNoteOnNn) {
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile) {
							try {
								const content = await this.app.vault.read(activeFile);
								if (content.includes(this.settings.chatSeparator)) {
									const archiveResult = await this.fileSystemService.moveFileToArchive(activeFile, this.settings.archiveFolderName, this.settings);
									if (archiveResult === null) {
										new Notice(`Failed to archive previous note '${activeFile.name}'. Continuing to create new note.`);
									} else {
										new Notice(`Archived '${activeFile.name}'.`);
									}
								} else {
									new Notice(`Previous note '${activeFile.name}' not archived because it lacks a chat separator.`);
								}
							} catch (archiveError) {
								console.error(`Error during pre-nn archive attempt for ${activeFile.name}:`, archiveError);
								new Notice(`Error trying to archive previous note '${activeFile.name}'. Continuing to create new note.`);
							}
						}
					}
					const parentPath = this.app.fileManager.getNewFileParent(this.app.workspace.getActiveFile()?.path || '').path;
					const title = moment().format(DEFAULT_NN_TITLE_FORMAT);
					const separator = parentPath === '/' ? '' : '/';
					const fullPath = `${parentPath}${separator}${title}.md`;

					const newFile = await this.app.vault.create(fullPath, '');
					this.app.workspace.openLinkText(newFile.path, '', false);
					new Notice(`Created new chat note: ${title}.md`);
				} catch (error) {
					console.error("Error creating new chat note:", error);
					new Notice("Error creating new chat note. Check console for details.");
				}
			}
		});
		this.addCommand({
			id: 'trigger-chat-completion-cc',
			name: 'Trigger Chat Completion (cc)',
			checkCallback: (checking: boolean) => {
				if (!this.settings.enableCcShortcut) {
					return false; // Command is disabled if setting is off
				}

				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (!activeView) {
					return false; // No active markdown view
				}

				if (checking) {
					return true;
				}

				const editor = activeView.editor;
				const docEnd = editor.offsetToPos(editor.getValue().length);
				const currentContent = editor.getValue();
				const textToInsert = (currentContent.endsWith('\n') ? '' : '\n') + this.settings.ccCommandPhrase + '\n';
				editor.replaceRange(textToInsert, docEnd, docEnd);
				const newEndPos = editor.offsetToPos(editor.posToOffset(docEnd) + textToInsert.length);
				editor.setCursor(newEndPos);

				console.log("Executed 'cc' shortcut command, inserted phrase.");
				return true;
			}
		});
		if (this.settings.enableNnRibbonButton) {
			this.addRibbonIcon('message-square-plus', 'Create New Chat Note', () => {
				// @ts-ignore - Assuming 'commands' exists on app, potentially a typing issue
				this.app.commands.executeCommandById('simple-note-chat:create-new-chat-note');
			});
		}
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
					}
				}
			}
		}
	}
}

