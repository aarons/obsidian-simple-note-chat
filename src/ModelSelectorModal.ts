import { App, Modal, Setting, Notice } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { OpenRouterService, ModelSortOption } from './OpenRouterService';
import { log } from './utils/logger';

export class ModelSelectorModal extends Modal {
	plugin: SimpleNoteChatPlugin;
	ors: OpenRouterService;

	constructor(plugin: SimpleNoteChatPlugin) {
		super(plugin.app);
		this.plugin = plugin;
		this.ors = plugin.openRouterService ?? new OpenRouterService();
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Select Default Chat Model' });
		contentEl.createEl('p', {
			text: 'This changes the default model used for all chat notes. Currently, setting models per-note is not supported (but maybe someday!). You can change this default model again at any time using this dialog or the settings.'
		});

		const notice = new Notice('Loading models…', 0); // Indefinite notice

		try {
			const encryptedApiKey = this.plugin.settings.encryptedApiKey;
			if (!encryptedApiKey) {
				contentEl.createEl('p', { text: 'Error: OpenRouter API Key is not set in plugin settings.' });
				notice.hide();
				return;
			}

			const decryptedApiKey = await this.plugin.encryptionService.decrypt(encryptedApiKey);
			if (!decryptedApiKey) {
				contentEl.createEl('p', { text: 'Error: Failed to decrypt the API Key. You may need to set the API key in Simple Chat settings.' });
				notice.hide();
				return;
			}

			// Use cached models if available
			let models = await this.ors.getCachedModels(decryptedApiKey);
			if (models.length === 0) {
				contentEl.createEl('p', { text: 'No models loaded. Check your API key, network connection, or try refreshing the model list in settings.' });
				notice.hide();
				return;
			}

			// Sort models based on the setting
			models = this.ors.sortModels(models, this.plugin.settings.modelSortOrder as ModelSortOption);
			const formatted = this.ors.getFormattedModels(models);

			new Setting(contentEl)
				.setName('Default Model')
				.setDesc('Choose the LLM to use for chat completions.')
				.addDropdown(dd => {
					formatted.forEach(m => dd.addOption(m.id, m.displayName));
					dd.setValue(this.plugin.settings.defaultModel);
					dd.onChange(async (val) => {
						this.plugin.settings.defaultModel = val;
						await this.plugin.saveSettings();
						// Find the display name for the notice
						const selectedModelInfo = formatted.find(m => m.id === val);
						const modelDisplayName = selectedModelInfo ? selectedModelInfo.displayName.split('|')[0].trim() : val; // Extract name before price
						new Notice(`Default chat model set to "${modelDisplayName}".`);
						this.close();
					});
				});

		} catch (error) {
			log.error('Error loading models in modal:', error);
			contentEl.createEl('p', { text: 'An error occurred while loading models. Check the console for details.' });
		} finally {
			notice.hide();
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
