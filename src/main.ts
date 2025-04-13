import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab';
import { ChatService } from './ChatService';
import { EditorHandler } from './EditorHandler';
import { PluginSettings, DEFAULT_SETTINGS } from './types';

// Settings interface and defaults are now imported from './types'

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;
	chatService: ChatService;
	editorHandler: EditorHandler;

	async onload() {
		console.log('Loading Simple Note Chat plugin');
		await this.loadSettings();

		// Instantiate services
		this.chatService = new ChatService(this);
		this.editorHandler = new EditorHandler(this.app, this);

		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on('editor-change', this.editorHandler.handleEditorChange)
		);
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
}

// The SimpleNoteChatSettingTab class has been moved to src/SettingsTab.ts
// The import statement at the top of the file now brings it in.
// The this.addSettingTab call in onload() will now use the imported class.
