import { App, Editor, MarkdownView, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { SimpleNoteChatSettingsTab } from './SettingsTab'; // Import the new settings tab
import { ChatService } from './ChatService'; // Import ChatService
import { EditorHandler } from './EditorHandler'; // Import EditorHandler
import { PluginSettings, DEFAULT_SETTINGS } from './types'; // Import settings types

// Settings interface and defaults are now imported from './types'

export default class SimpleNoteChatPlugin extends Plugin {
	settings: PluginSettings;
	chatService: ChatService; // Add ChatService instance
	editorHandler: EditorHandler; // Add EditorHandler instance
	async onload() {
		console.log('Loading Simple Note Chat plugin');
		await this.loadSettings();

		// This adds a settings tab so the user can configure various aspects of the plugin
		// Instantiate services
		this.chatService = new ChatService(this);
		this.editorHandler = new EditorHandler(this.app, this);

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SimpleNoteChatSettingsTab(this.app, this));

		// Register the editor change listener
		this.registerEvent(
			this.app.workspace.on('editor-change', this.editorHandler.handleEditorChange)
		);

		// Add other initialization logic here if needed
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