// src/SettingsTab.ts
import { App, PluginSettingTab, Setting, Notice, DropdownComponent } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { OpenRouterService, OpenRouterModel } from './OpenRouterService';
import { PluginSettings } from './types'; // Import PluginSettings
import {
	DEFAULT_STOP_SEQUENCE,
	DEFAULT_ARCHIVE_FOLDER,
	DEFAULT_NN_TITLE_FORMAT,
	CC_COMMAND_DEFAULT,
	GG_COMMAND_DEFAULT,
	DD_COMMAND_DEFAULT,
	NN_COMMAND_DEFAULT,
	CHAT_SEPARATOR_DEFAULT
} from './constants'; // Import constants

export class SimpleNoteChatSettingsTab extends PluginSettingTab {
	plugin: SimpleNoteChatPlugin;
	openRouterService: OpenRouterService;
	private availableModels: OpenRouterModel[] = []; // Store fetched models
	private modelDropdown: DropdownComponent | null = null; // Default chat model dropdown
	private llmModelDropdown: DropdownComponent | null = null; // LLM title model dropdown
	private sortDropdown: DropdownComponent | null = null; // Model sort dropdown

	constructor(app: App, plugin: SimpleNoteChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		// Use the plugin's instance of OpenRouterService if available, otherwise create new
		// This assumes OpenRouterService doesn't hold state specific to the settings tab instance
		this.openRouterService = plugin.openRouterService || new OpenRouterService();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Simple Note Chat - Settings' });

		// --- API Key Setting ---
		new Setting(containerEl)
			.setName('OpenRouter API Key')
			.setDesc('Enter your OpenRouter API key. Get one from openrouter.ai')
			.addText(text => {
				text
					.setPlaceholder('sk-or-v1-...')
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						const trimmedValue = value.trim();
						if (this.plugin.settings.apiKey !== trimmedValue) {
							this.plugin.settings.apiKey = trimmedValue;
							await this.plugin.saveSettings();
							new Notice('API Key saved. Refreshing models...');
							// Clear available models and trigger refresh
							this.availableModels = [];
							this.populateModelDropdowns(); // Clear dropdowns first
							await this.fetchAndStoreModels(false); // Fetch new models silently
						}
					});
				text.inputEl.setAttribute('type', 'password');
			});

		// --- Refresh Models Button ---
		new Setting(containerEl)
			.setName('Refresh Model List')
			.setDesc('Fetch the latest available models from OpenRouter using your API key.')
			.addButton(button => button
				.setButtonText('Refresh Models')
				.setCta()
				.onClick(async () => {
					await this.fetchAndStoreModels(true); // Use the updated method
				}));

		// --- Sort Model Lists Setting --- ADDED HERE ---
		new Setting(containerEl)
			.setName('Sort Model Lists By')
			.setDesc('Choose how to sort the OpenRouter model lists in the dropdowns below.')
			.addDropdown(dropdown => {
				this.sortDropdown = dropdown; // Store reference
				dropdown
					.addOption('alphabetical', 'Alphabetical (A-Z)')
					.addOption('price_asc', 'Price: Prompt + Completion (Ascending)')
					.addOption('price_desc', 'Price: Prompt + Completion (Descending)')
					.setValue(this.plugin.settings.modelSortOrder)
					.onChange(async (value) => {
						this.plugin.settings.modelSortOrder = value;
						await this.plugin.saveSettings();
						new Notice(`Model sort order set to: ${dropdown.selectEl.selectedOptions[0]?.text || value}`);
						// Re-populate dropdowns with new sort order
						this.populateModelDropdowns();
					});
			});

		// --- Default Model Setting ---
		const modelSetting = new Setting(containerEl)
			.setName('Default Chat Model')
			.setDesc('Select the default model to use for new chats.');

		modelSetting.addDropdown(dropdown => {
			this.modelDropdown = dropdown; // Store reference
			dropdown.addOption('', '-- Select a model --'); // Initial placeholder
			dropdown.setValue(this.plugin.settings.defaultModel);
			dropdown.onChange(async (value) => {
				this.plugin.settings.defaultModel = value;
				await this.plugin.saveSettings();
			});
			// Dropdown will be populated by initial load or refresh button
		});


		// --- Stop Sequence Setting ---
		new Setting(containerEl)
			.setName('Stop Sequence')
			.setDesc('Type this sequence anywhere in the note while a response is streaming to stop it.')
			.addText(text => text
				.setPlaceholder(DEFAULT_STOP_SEQUENCE)
				.setValue(this.plugin.settings.stopCommandSequence)
				.onChange(async (value) => {
					const trimmedValue = value.trim(); // Trim whitespace
					if (trimmedValue) { // Ensure it's not empty
						this.plugin.settings.stopCommandSequence = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Stop sequence saved.');
					} else {
						new Notice('Stop sequence cannot be empty.');
						text.setValue(this.plugin.settings.stopCommandSequence);
					}
				}));

		// --- Viewport Scrolling Setting ---
		new Setting(containerEl)
			.setName('Enable Viewport Scrolling')
			.setDesc('Automatically scroll the note to the bottom as the chat response streams in.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableViewportScrolling)
				.onChange(async (value) => {
					this.plugin.settings.enableViewportScrolling = value;
					await this.plugin.saveSettings();
					new Notice(`Viewport scrolling ${value ? 'enabled' : 'disabled'}.`);
				}));

		// --- Archive Folder Setting ---
		new Setting(containerEl)
			.setName('Archive Folder')
			.setDesc('Folder where notes will be moved when using the archive command (relative to vault root).')
			.addText(text => text
				.setPlaceholder(DEFAULT_ARCHIVE_FOLDER)
				.setValue(this.plugin.settings.archiveFolderName)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					const normalizedValue = trimmedValue ? (trimmedValue.endsWith('/') ? trimmedValue : `${trimmedValue}/`) : '';

					if (this.plugin.settings.archiveFolderName !== normalizedValue) {
						this.plugin.settings.archiveFolderName = normalizedValue;
						await this.plugin.saveSettings();
						new Notice('Archive folder setting saved.');
						text.setValue(normalizedValue);
					}
				}));

		// --- Enable Delete Command (dd) Setting ---
		new Setting(containerEl)
			.setName('Enable Delete Command (`dd`)')
			.setDesc('Allow deleting notes using the \'dd\' command. Notes are moved to system trash. USE WITH CAUTION!')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDeleteCommand)
				.onChange(async (value) => {
					this.plugin.settings.enableDeleteCommand = value;
					await this.plugin.saveSettings();
					new Notice(`Delete command ('dd') ${value ? 'enabled' : 'disabled'}.`);
				}));

		// --- dd Bypass Separator Check Setting ---
		new Setting(containerEl)
			.setName('Bypass Separator Check for `dd`')
			.setDesc('Allow the \'dd\' command to work even if the note doesn\'t contain a chat separator. USE WITH EXTREME CAUTION!')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.ddBypassSeparatorCheck)
				.onChange(async (value) => {
					this.plugin.settings.ddBypassSeparatorCheck = value;
					await this.plugin.saveSettings();
					new Notice(`'dd' separator bypass ${value ? 'enabled' : 'disabled'}.`);
				}));

		// --- Custom Phrases & Separator Settings ---
		containerEl.createEl('h3', { text: 'Custom Phrases & Separator' });

		new Setting(containerEl)
			.setName('`cc` Command Phrase')
			.setDesc('Phrase to trigger chat completion.')
			.addText(text => text
				.setPlaceholder(CC_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.ccCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.ccCommandPhrase !== trimmedValue) {
						this.plugin.settings.ccCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('`cc` command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.ccCommandPhrase); // Revert if empty
					}
				}));

		// --- Enable cc Shortcut Setting ---
		new Setting(containerEl)
			.setName('Enable `cc` Keyboard Shortcut')
			.setDesc('Make the \'Trigger Chat Completion (cc)\' command available for assigning a keyboard shortcut in Obsidian\'s hotkey settings.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCcShortcut)
				.onChange(async (value) => {
					this.plugin.settings.enableCcShortcut = value;
					await this.plugin.saveSettings();
					new Notice(`'cc' keyboard shortcut command ${value ? 'enabled' : 'disabled'}. Configure in Obsidian Hotkeys.`);
				}));

		new Setting(containerEl)
			.setName('`gg` Command Phrase')
			.setDesc('Phrase to trigger archiving the current chat note.')
			.addText(text => text
				.setPlaceholder(GG_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.ggCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.ggCommandPhrase !== trimmedValue) {
						this.plugin.settings.ggCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('`gg` command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.ggCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('`dd` Command Phrase')
			.setDesc('Phrase to trigger deleting the current chat note (if enabled).')
			.addText(text => text
				.setPlaceholder(DD_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.ddCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.ddCommandPhrase !== trimmedValue) {
						this.plugin.settings.ddCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('`dd` command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.ddCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('`nn` Command Phrase')
			.setDesc('Phrase to trigger creating a new chat note (if enabled).')
			.addText(text => text
				.setPlaceholder(NN_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.nnCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.nnCommandPhrase !== trimmedValue) {
						this.plugin.settings.nnCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('`nn` command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.nnCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('Chat Separator')
			.setDesc(`Markdown or text used to separate messages in chat notes. Default: ${CHAT_SEPARATOR_DEFAULT}`)
			.addText(text => text
				.setPlaceholder(CHAT_SEPARATOR_DEFAULT)
				.setValue(this.plugin.settings.chatSeparator)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (this.plugin.settings.chatSeparator !== trimmedValue) {
						this.plugin.settings.chatSeparator = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Chat separator saved.');
					}
				}));

		new Setting(containerEl)
			.setName('Note on Custom Phrases & Separator')
			.setDesc('Changing command phrases or the separator may require Obsidian to be reloaded for the changes to take full effect in the editor detection.');

		// --- Archive Chat (gg) Command Settings ---
		containerEl.createEl('h3', { text: 'Archive Chat (`gg`) Command Settings' });

		new Setting(containerEl)
			.setName('Rename Note on Archive (Date/Time)')
			.setDesc('Rename the note using a date/time format when archiving.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameDate)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameDate = value;
					await this.plugin.saveSettings();
					new Notice(`Archive renaming ${value ? 'enabled' : 'disabled'}.`);
				}));

		new Setting(containerEl)
			.setName('Date/Time Format')
			.setDesc('Moment.js format string for renaming archived notes (e.g., YYYY-MM-DD-HH-mm).')
			.addText(text => text
				.setPlaceholder(DEFAULT_NN_TITLE_FORMAT)
				.setValue(this.plugin.settings.archiveRenameDateFormat)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue) {
						this.plugin.settings.archiveRenameDateFormat = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Archive rename format saved.');
					} else {
						new Notice('Archive rename format cannot be empty.');
						text.setValue(this.plugin.settings.archiveRenameDateFormat);
					}
				}));

		// --- LLM Title Renaming Settings (within gg section) ---
		const llmSettingsContainer = containerEl.createDiv('llm-archive-rename-settings');

		new Setting(containerEl)
			.setName('Rename Note on Archive (LLM Title)')
			.setDesc('Use an LLM to generate a title based on note content when archiving. This happens *after* date renaming if both are enabled.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameLlm)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameLlm = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title renaming ${value ? 'enabled' : 'disabled'}.`);
					llmSettingsContainer.style.display = value ? 'block' : 'none';
				}));

		new Setting(llmSettingsContainer)
			.setName('LLM Title Word Limit')
			.setDesc('Approximate maximum words for the generated title.')
			.addText(text => text
				.setPlaceholder('5')
				.setValue(String(this.plugin.settings.llmRenameWordLimit))
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue >= 1) {
						this.plugin.settings.llmRenameWordLimit = numValue;
						await this.plugin.saveSettings();
						new Notice('LLM title word limit saved.');
					} else {
						new Notice('Please enter a valid number (1 or greater).');
						text.setValue(String(this.plugin.settings.llmRenameWordLimit));
					}
				}))
			.then(setting => {
				const inputEl = setting.controlEl.querySelector('input');
				if (inputEl) {
					inputEl.setAttribute('type', 'number');
					inputEl.setAttribute('min', '1');
				}
			});


		new Setting(llmSettingsContainer)
			.setName('Include Emojis in LLM Title')
			.setDesc('Allow the LLM to include relevant emojis in the title.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.llmRenameIncludeEmojis)
				.onChange(async (value) => {
					this.plugin.settings.llmRenameIncludeEmojis = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title emoji inclusion ${value ? 'enabled' : 'disabled'}.`);
				}));

		const llmModelSetting = new Setting(llmSettingsContainer)
			.setName('LLM Title Model')
			.setDesc('Model to use for generating the title. Uses default chat model if left blank.');

		llmModelSetting.addDropdown(dropdown => {
			this.llmModelDropdown = dropdown; // Store reference
			dropdown.addOption('', 'Use Default Chat Model'); // Specific placeholder
			dropdown.setValue(this.plugin.settings.llmRenameModel);
			dropdown.onChange(async (value) => {
				this.plugin.settings.llmRenameModel = value;
				await this.plugin.saveSettings();
			});
			// Dropdown will be populated by initial load or refresh button
		});

		llmSettingsContainer.style.display = this.plugin.settings.enableArchiveRenameLlm ? 'block' : 'none';


		// --- New Chat (nn) Command Settings ---
		containerEl.createEl('h3', { text: 'New Chat (`nn`) Command Triggers' });

		new Setting(containerEl)
			.setName('Enable `nn` Phrase Trigger')
			.setDesc('Type \'nn\' at the end of any note to trigger the \'Create New Chat Note\' command.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNnCommandPhrase)
				.onChange(async (value) => {
					this.plugin.settings.enableNnCommandPhrase = value;
					await this.plugin.saveSettings();
					new Notice(`'nn' phrase trigger ${value ? 'enabled' : 'disabled'}.`);
				}));

		new Setting(containerEl)
			.setName('Enable Ribbon Button Trigger')
			.setDesc('Add a button to the left ribbon bar to trigger the \'Create New Chat Note\' command.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNnRibbonButton)
				.onChange(async (value) => {
					this.plugin.settings.enableNnRibbonButton = value;
					await this.plugin.saveSettings();
					new Notice(`Ribbon button trigger ${value ? 'enabled' : 'disabled'}. Reload Obsidian for the change to take full effect.`);
				}));

		new Setting(containerEl)
			.setName('Enable Keyboard Shortcut Trigger')
			.setDesc('Allow assigning a keyboard shortcut in Obsidian\'s hotkey settings for the \'Create New Chat Note\' command.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNnKeyboardShortcut)
				.onChange(async (value) => {
					this.plugin.settings.enableNnKeyboardShortcut = value;
					await this.plugin.saveSettings();
					new Notice(`Keyboard shortcut availability ${value ? 'enabled' : 'disabled'}. Configure the shortcut in Obsidian Hotkeys.`);
				}));

		// --- Archive Previous Note on nn Setting ---
		new Setting(containerEl)
			.setName('Archive Current Note on `nn`')
			.setDesc('Automatically archive the current note (like using \'gg\') before creating the new one when using the \'nn\' command/phrase/button.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.archivePreviousNoteOnNn)
				.onChange(async (value) => {
					this.plugin.settings.archivePreviousNoteOnNn = value;
					await this.plugin.saveSettings();
					new Notice(`Archive on 'nn' ${value ? 'enabled' : 'disabled'}.`);
				}));

		// --- Initial Model Load ---
		if (this.plugin.settings.apiKey) {
			this.fetchAndStoreModels(false); // Use updated method
		} else {
			this.populateModelDropdowns(); // Ensure dropdowns show "Enter API Key..."
		}
	}

	/**
	 * Populates a single model dropdown menu.
	 * @param dropdown The DropdownComponent instance.
	 * @param models Array of models (OpenRouterModel) to populate with.
	 * @param settingKey The key in PluginSettings that this dropdown controls.
	 * @param noApiKeyText Text to display when API key is missing.
	 * @param placeholderText Default placeholder text when models are loaded.
	 */
	private populateModelDropdown(
		dropdown: DropdownComponent | null,
		models: OpenRouterModel[],
		settingKey: keyof PluginSettings,
		noApiKeyText: string,
		placeholderText: string
	): void {
		if (!dropdown) {
			console.warn(`SettingsTab: Dropdown for setting key "${String(settingKey)}" is null.`);
			return; // Exit if dropdown doesn't exist
		}

		const currentSelectedValue = dropdown.getValue(); // Store current selection before clearing
		dropdown.selectEl.empty(); // Clear existing options first

		if (!this.plugin.settings.apiKey) {
			dropdown.addOption('', noApiKeyText);
			dropdown.setDisabled(true);
			dropdown.setValue(''); // Ensure placeholder is selected
			return;
		}

		dropdown.setDisabled(false); // Ensure dropdown is enabled if API key exists

		if (models.length === 0) {
			// Handles API errors, empty model list, or models not yet loaded
			dropdown.addOption('', 'No models found or API key invalid');
			dropdown.setValue(''); // Ensure placeholder is selected
			return; // Don't add the regular placeholder if no models
		}

		// Add the specific placeholder text first
		dropdown.addOption('', placeholderText);

		// Add each model to the dropdown
		models.forEach(model => {
			// Display format: "Model Name (model/id)" - Consider adding price later if needed
			const displayName = model.name ? `${model.name} (${model.id})` : model.id;
			dropdown.addOption(model.id, displayName);
		});

		// Try to re-select the previously selected model OR the currently saved setting
		// @ts-ignore - Accessing setting dynamically
		const savedModel = this.plugin.settings[settingKey] as string;
		const valueToSelect = models.some(m => m.id === currentSelectedValue) ? currentSelectedValue : savedModel;

		if (valueToSelect && models.some(m => m.id === valueToSelect)) {
			dropdown.setValue(valueToSelect);
		} else {
			// If saved/previous model isn't in the list, ensure placeholder is selected
			dropdown.setValue('');
		}
	}

	/**
	 * Sorts the available models based on the current setting and populates both dropdowns.
	 */
	private populateModelDropdowns(): void {
		let sortedModels: OpenRouterModel[] = [];
		if (this.plugin.settings.apiKey && this.availableModels.length > 0) {
			try {
				// Pass the sort criteria string directly
				sortedModels = this.openRouterService.sortModels(
					this.availableModels,
					this.plugin.settings.modelSortOrder // Pass 'alphabetical', 'price_asc', or 'price_desc'
				);
			} catch (error) {
				console.error("SettingsTab: Error sorting models:", error);
				new Notice("Error sorting models. Check console.");
				// Use unsorted models as a fallback? Or leave dropdowns empty?
				// Let's populate with unsorted for now.
				sortedModels = this.availableModels;
			}
		} else {
			// If no API key or no models fetched yet, sortedModels remains empty
			// populateModelDropdown handles the "Enter API Key" or "No models" message.
		}

		// Populate both dropdowns with the (potentially sorted) models
		this.populateModelDropdown(
			this.modelDropdown,
			sortedModels,
			'defaultModel',
			'Enter API Key to load models',
			'-- Select a model --'
		);
		this.populateModelDropdown(
			this.llmModelDropdown,
			sortedModels,
			'llmRenameModel',
			'Enter API Key to load models',
			'Use Default Chat Model'
		);
	}


	/**
	 * Fetches models from OpenRouter, stores them, and triggers dropdown population.
	 * Handles showing notices to the user during the process.
	 * @param showNotices If true, displays "Fetching..." and success/error notices.
	 */
	private async fetchAndStoreModels(showNotices: boolean = true): Promise<void> {
		if (!this.plugin.settings.apiKey) {
			if (showNotices) {
				new Notice('Please enter your OpenRouter API key first.');
			}
			this.availableModels = []; // Clear stored models
			this.populateModelDropdowns(); // Update dropdowns to show "Enter API Key..."
			return;
		}

		let loadingNotice;
		if (showNotices) {
			loadingNotice = new Notice('Fetching models from OpenRouter...', 0); // Persistent notice
		}

		try {
			const models = await this.openRouterService.fetchModels(this.plugin.settings.apiKey);
			this.availableModels = models; // Store fetched models

			// fetchModels now returns [] on error and shows its own Notice for API errors.
			// So, we just need to check the length.

			this.populateModelDropdowns(); // Populate dropdowns using the stored models and current sort order

			if (showNotices) {
				if (this.availableModels.length > 0) {
					new Notice('Model list updated successfully.');
				} else {
					// Notice handled by populateModelDropdowns -> populateModelDropdown
				}
			}

		} catch (error) {
			// Catch unexpected errors during fetching or storing (less likely now)
			console.error("SettingsTab: Error fetching or storing models:", error);
			if (showNotices) {
				new Notice('An unexpected error occurred while updating model list.');
			}
			this.availableModels = []; // Clear potentially partial data
			this.populateModelDropdowns(); // Update dropdowns to show error/empty state
		} finally {
			loadingNotice?.hide(); // Hide the persistent "Fetching..." notice
		}
	}

	/**
	 * Public method called by the refresh button's onClick handler.
	 * Kept for clarity, just calls fetchAndStoreModels.
	 */
	public async refreshModels(): Promise<void> {
		// Always show notices when the button is clicked manually
		await this.fetchAndStoreModels(true);
	}
}
