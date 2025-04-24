import { App, PluginSettingTab, Setting, Notice, DropdownComponent } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { OpenRouterService, OpenRouterModel, FormattedModelInfo, ModelSortOption } from './OpenRouterService'; // Import FormattedModelInfo and ModelSortOption
import { PluginSettings } from './types';
import { log } from './utils/logger';
import {
	DEFAULT_ARCHIVE_FOLDER,
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	MODEL_COMMAND_DEFAULT,
	CHAT_SEPARATOR_DEFAULT
} from './constants';

export class SimpleNoteChatSettingsTab extends PluginSettingTab {
	plugin: SimpleNoteChatPlugin;
	openRouterService: OpenRouterService;
	private availableModels: OpenRouterModel[] = [];
	private modelDropdown: DropdownComponent | null = null;
	private llmModelDropdown: DropdownComponent | null = null;
	private sortDropdown: DropdownComponent | null = null;

	constructor(app: App, plugin: SimpleNoteChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.openRouterService = plugin.openRouterService || new OpenRouterService();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h2', { text: 'Simple Note Chat - Settings' });

		// ========== 1. CONNECTIONS ==========
		containerEl.createEl('h3', { text: 'Connections', cls: 'snc-section-header' });
		containerEl.createEl('p', { text: 'Configure connection to LLM providers.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('OpenRouter API Key')
			.setDesc('Enter your OpenRouter API key; you can get one from openrouter.ai')
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
							this.availableModels = [];
							this.populateModelDropdowns();
							await this.fetchAndStoreModels(false);
						}
					});
				text.inputEl.setAttribute('type', 'password');
			});

		// ========== 2. MODEL MANAGEMENT ==========
		containerEl.createEl('h3', { text: 'Model Management', cls: 'snc-section-header' });
		containerEl.createEl('p', { text: 'Configure model selection and sorting options.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Model Sorting')
			.setDesc('Choose how to sort the OpenRouter model lists in the dropdowns below.')
			.addDropdown(dropdown => {
				this.sortDropdown = dropdown;
				// Add options based on the ModelSortOption enum
				dropdown
					.addOption(ModelSortOption.ALPHABETICAL, 'Alphabetical')
					.addOption(ModelSortOption.PROMPT_PRICE_ASC, 'Prompt Price: Ascending')
					.addOption(ModelSortOption.PROMPT_PRICE_DESC, 'Prompt Price: Descending')
					.addOption(ModelSortOption.COMPLETION_PRICE_ASC, 'Completion Price: Ascending')
					.addOption(ModelSortOption.COMPLETION_PRICE_DESC, 'Completion Price: Descending')
					// Set the current value from settings
					.setValue(this.plugin.settings.modelSortOrder)
					.onChange(async (value) => {
						// Ensure the value is a valid ModelSortOption before saving
						if (Object.values(ModelSortOption).includes(value as ModelSortOption)) {
							this.plugin.settings.modelSortOrder = value as ModelSortOption;
							await this.plugin.saveSettings();
							new Notice(`Model sort order set to: ${dropdown.selectEl.selectedOptions[0]?.text || value}`);
							// Re-populate dropdowns with new sort order
							this.populateModelDropdowns();
						} else {
							log.warn(`SettingsTab: Invalid sort option selected: ${value}`);
							// Optionally revert dropdown to saved setting or default
							dropdown.setValue(this.plugin.settings.modelSortOrder);
						}
					});
			});

		const modelSetting = new Setting(containerEl)
			.setName('Chat Model')
			.setDesc('Select the AI model to use for new chats.');

		modelSetting.addDropdown(dropdown => {
			this.modelDropdown = dropdown;
			dropdown.addOption('', '-- Select a model --');
			dropdown.setValue(this.plugin.settings.defaultModel);
			dropdown.onChange(async (value) => {
				this.plugin.settings.defaultModel = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl)
		.setName('Refresh Model List')
		.setDesc('Fetch the latest available models from OpenRouter. The list automatically refreshes once every 24 hours in the background, as well as when the plugin first starts with Obsidian; so the list should stay pretty current on its own.')
		.addButton(button => button
			.setButtonText('Refresh Models')
			.setCta()
			.onClick(async () => {
				await this.fetchAndStoreModels(true);
			}));

		// ========== 3. PHRASES ==========
		containerEl.createEl('h3', { text: 'Command Phrases', cls: 'snc-section-header' });
		containerEl.createEl('p', { text: 'The plugin will look for these command phrases in order to take action. Phrases are recognzied when entered on their own line, and will activate after you hit the <enter> key. Deleting the phrase will disable the command.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Chat Phrase')
			.setDesc(`This phrase will call the AI model and get a response. Previous conversation in the note is included and parsed into user and assistant messages, so the model can clearly follow the conversation. Default: (${CHAT_COMMAND_DEFAULT})`)
			.addText(text => text
				.setPlaceholder(CHAT_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.chatCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.chatCommandPhrase !== trimmedValue) {
						this.plugin.settings.chatCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Chat command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.chatCommandPhrase); // Revert if empty
					}
				}));

		new Setting(containerEl)
			.setName('Change Model Phrase')
			.setDesc(`This will open an AI model selection dialog, to enable quickly changing the active model used for chats. Default: (${MODEL_COMMAND_DEFAULT}).`)
			.addText(t => t
				.setPlaceholder(MODEL_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.modelCommandPhrase)
				.onChange(async (v) => {
					const trimmed = v.trim();
					if (trimmed && this.plugin.settings.modelCommandPhrase !== trimmed) {
						this.plugin.settings.modelCommandPhrase = trimmed;
						await this.plugin.saveSettings();
						new Notice('Model command phrase saved.');
					} else if (!trimmed) {
						new Notice('Command phrase cannot be empty.');
						t.setValue(this.plugin.settings.modelCommandPhrase);
					}
				}));

		new Setting(containerEl)
		.setName('New Note')
		.setDesc(`This quickly creates a new note for chatting, for when you are done with one topic and want to start another easily. By default, the note is created in the current directory, and title using the current date and time. It's behavior can be configured in the New Note Settings section below. Default: (${NEW_CHAT_COMMAND_DEFAULT}).`)
		.addText(text => text
			.setPlaceholder(NEW_CHAT_COMMAND_DEFAULT)
			.setValue(this.plugin.settings.newChatCommandPhrase)
			.onChange(async (value) => {
				const trimmedValue = value.trim();
				if (trimmedValue && this.plugin.settings.newChatCommandPhrase !== trimmedValue) {
					this.plugin.settings.newChatCommandPhrase = trimmedValue;
					await this.plugin.saveSettings();
					new Notice('New chat command phrase saved.');
				} else if (!trimmedValue) {
					new Notice('Command phrase cannot be empty.');
					text.setValue(this.plugin.settings.newChatCommandPhrase);
				}
			}));

		new Setting(containerEl)
			.setName('Archive Phrase')
			.setDesc(`This phrase will archive the current chat, moving the note to the archive folder, and optionally updating the title. The behavior can be configured in the Archive Section below. Default: (${ARCHIVE_COMMAND_DEFAULT}).`)
			.addText(text => text
				.setPlaceholder(ARCHIVE_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.archiveCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue && this.plugin.settings.archiveCommandPhrase !== trimmedValue) {
						this.plugin.settings.archiveCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
						new Notice('Archive command phrase saved.');
					} else if (!trimmedValue) {
						new Notice('Command phrase cannot be empty.');
						text.setValue(this.plugin.settings.archiveCommandPhrase); // Revert if empty
					}
				}));


		// ========== 4. CHAT ARCHIVE SETTINGS ==========
		containerEl.createEl('h3', { text: 'Archive Settings', cls: 'snc-section-header' });
		containerEl.createEl('p', { text: 'Configure how notes are handled after finishing with a chat.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Archive Folder')
			.setDesc('This is where notes will be moved when the archive command is used.')
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

		new Setting(containerEl)
			.setName('Rename Note on Archive (Date/Time)')
			.setDesc('When this is enabled, the note will be renamed using a date/time format at the moment of archival.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameDate)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameDate = value;
					await this.plugin.saveSettings();
					new Notice(`Archive renaming ${value ? 'enabled' : 'disabled'}.`);
					// Show/hide the date format setting
					if (dateTimeFormatSetting) {
						dateTimeFormatSetting.settingEl.style.display = value ? 'flex' : 'none';
					}
				}));

		// Store the setting instance to control its visibility
		const dateTimeFormatSetting = new Setting(containerEl)
			.setName('Date/Time Format')
			.setDesc('Moment.js format string for renaming archived notes. (Default: YYYY-MM-DD-HH-mm)')
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

		// Set initial visibility based on the toggle state
		dateTimeFormatSetting.settingEl.style.display = this.plugin.settings.enableArchiveRenameDate ? 'flex' : 'none';

		new Setting(containerEl)
			.setName('Generate a contextual title (LLM Title)')
			.setDesc(`This will use an LLM to generate a title based on the note's content. This is added after the date if both are enabled.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameLlm)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameLlm = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title renaming ${value ? 'enabled' : 'disabled'}.`);
					// No need to update description here anymore
					llmSettingsContainer.style.display = value ? 'block' : 'none';
				}));

		const llmSettingsContainer = containerEl.createDiv('llm-archive-rename-settings');

		// --- LLM Title Model Setting (Moved here) ---
		new Setting(llmSettingsContainer)
			.setName('Note Title Model')
			.setDesc('Select the model to use for generating the note title. If empty, the Default Chat Model will be used.')
			.addDropdown(dropdown => {
				this.llmModelDropdown = dropdown; // Assign to the class property
				dropdown.addOption('', 'Use Default Chat Model');
				dropdown.setValue(this.plugin.settings.llmRenameModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.llmRenameModel = value;
					await this.plugin.saveSettings();
				});
			});
		// --- End LLM Title Model Setting ---

		new Setting(llmSettingsContainer)
			.setName('Title Word Limit')
			.setDesc('The maximum number of words allowed for the generated title.')
			.addText(text => text
				.setPlaceholder('3')
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
			.setName('Allow Emojis in LLM Title?')
			.setDesc(`For those that like the occasional flair. This feature works on MacOS, I'm unsure about: iOS, Android, Linux, and Windows. Note that this doesn't actually ask for emojis; so you will only see them if the model likes to use them.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.llmRenameIncludeEmojis)
				.onChange(async (value) => {
					this.plugin.settings.llmRenameIncludeEmojis = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title emoji inclusion ${value ? 'enabled' : 'disabled'}.`);
				}));

		llmSettingsContainer.style.display = this.plugin.settings.enableArchiveRenameLlm ? 'block' : 'none';

		new Setting(containerEl)
			.setName('Automatically Archive Current Note on New Chat')
			.setDesc(`When starting a new note, this will archive the old note if it has any chat messages (triggering all the steps in the Archive Chat section). Notes that don't have any chat separators in them will be left alone.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.archivePreviousNoteOnNn)
				.onChange(async (value) => {
					this.plugin.settings.archivePreviousNoteOnNn = value;
					await this.plugin.saveSettings();
					new Notice(`Archive on New Chat ${value ? 'enabled' : 'disabled'}.`);
				}));

		// ========== 5. STYLE OPTIONS ==========
		containerEl.createEl('h3', { text: 'Style Options', cls: 'snc-section-header' });
		containerEl.createEl('p', { text: 'Configure visual and formatting elements of the chat.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Chat Separator')
			.setDesc(`This is the text used in notes to indicate separate messages between the user and AI. It is recommended to use something uncommon such as an html element, as LLMs are unlikely to use them in chat responses. If you use something more common, such as '---', and the LLM returns messages with those strings, then the parsing might get confused (not a big deal, but just FYI). Default: ${CHAT_SEPARATOR_DEFAULT}`)
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

		// Load models if API key is set
		if (this.plugin.settings.apiKey) {
			this.fetchAndStoreModels(false);
		} else {
			this.populateModelDropdowns();
		}
	}

	/**
	 * Populates a single model dropdown menu.
	 * @param dropdown The DropdownComponent instance
	 * @param formattedModels Array of formatted models to populate with
	 * @param settingKey The key in PluginSettings that this dropdown controls
	 * @param noApiKeyText Text to display when API key is missing
	 * @param placeholderText Default placeholder text when models are loaded
	 */
	private populateModelDropdown(
		dropdown: DropdownComponent | null,
		formattedModels: FormattedModelInfo[],
		settingKey: keyof PluginSettings,
		noApiKeyText: string,
		placeholderText: string
	): void {
		if (!dropdown) {
			log.warn(`SettingsTab: Dropdown for setting key "${String(settingKey)}" is null.`);
			return;
		}

		const currentSelectedValue = dropdown.getValue();
		dropdown.selectEl.empty();

		if (!this.plugin.settings.apiKey) {
			dropdown.addOption('', noApiKeyText);
			dropdown.setDisabled(true);
			dropdown.setValue('');
			return;
		}

		dropdown.setDisabled(false);

		if (formattedModels.length === 0) {
			dropdown.addOption('', 'No models found or API key invalid');
			dropdown.setValue('');
			return;
		}

		dropdown.addOption('', placeholderText);

		formattedModels.forEach(model => {
			// Use the pre-formatted displayName directly
			dropdown.addOption(model.id, model.displayName);
		});

		// @ts-ignore - Dynamic setting access
		const savedModel = this.plugin.settings[settingKey] as string;
		// Check if the current or saved model ID exists in the formatted list
		const valueToSelect = formattedModels.some(m => m.id === currentSelectedValue) ? currentSelectedValue : savedModel;

		if (valueToSelect && formattedModels.some(m => m.id === valueToSelect)) {
			dropdown.setValue(valueToSelect);
		} else {
			// If the saved model is no longer valid or wasn't set, default to empty/placeholder
			dropdown.setValue('');
		}
	}

	/**
	 * Sorts models, formats them, and populates dropdowns
	 */
	private populateModelDropdowns(): void {
		let formattedModels: FormattedModelInfo[] = [];
		if (this.plugin.settings.apiKey && this.availableModels.length > 0) {
			try {
				// 1. Sort the raw models
				const sortedModels = this.openRouterService.sortModels(
					this.availableModels,
					this.plugin.settings.modelSortOrder as ModelSortOption // Cast to satisfy TS
				);
				// 2. Format the sorted models for display
				formattedModels = this.openRouterService.getFormattedModels(sortedModels);

			} catch (error) {
				log.error("SettingsTab: Error sorting or formatting models:", error);
				new Notice("Error preparing model list. Check console.");
				// Attempt to format unsorted models as a fallback
				try {
					formattedModels = this.openRouterService.getFormattedModels(this.availableModels);
				} catch (formatError) {
					log.error("SettingsTab: Fallback formatting failed:", formatError);
					formattedModels = []; // Ensure it's an empty array on complete failure
				}
			}
		}

		// Pass the formatted models to the dropdown population function
		this.populateModelDropdown(
			this.modelDropdown,
			formattedModels,
			'defaultModel',
			'Enter API Key to load models',
			'-- Select a model --'
		);
		this.populateModelDropdown(
			this.llmModelDropdown,
			formattedModels,
			'llmRenameModel',
			'Enter API Key to load models',
			'Use Default Chat Model'
		);
	}


	/**
	 * @param showNotices If true, displays loading and result notices
	 */
	private async fetchAndStoreModels(showNotices: boolean = true): Promise<void> {
		if (!this.plugin.settings.apiKey) {
			if (showNotices) {
				new Notice('Please enter your OpenRouter API key first.');
			}
			this.availableModels = [];
			this.populateModelDropdowns();
			return;
		}

		let loadingNotice;
		if (showNotices) {
			loadingNotice = new Notice('Fetching models from OpenRouter...', 0);
		}

		try {
			// Use forceRefresh=true when "Refresh Models" button is clicked
			const models = await this.openRouterService.fetchModels(
				this.plugin.settings.apiKey,
				showNotices // showNotices indicates user-requested refresh, sets the forceRefresh parameter to true
			);
			this.availableModels = models;

			this.populateModelDropdowns();

			if (showNotices) {
				if (this.availableModels.length > 0) {
					new Notice('Model list updated successfully.');
				}
			}

		} catch (error) {
			log.error("SettingsTab: Error fetching or storing models:", error);
			if (showNotices) {
				new Notice('An unexpected error occurred while updating model list.');
			}
			this.availableModels = [];
			this.populateModelDropdowns();
		} finally {
			loadingNotice?.hide();
		}
	}

	public async refreshModels(): Promise<void> {
		await this.fetchAndStoreModels(true);
	}
}
