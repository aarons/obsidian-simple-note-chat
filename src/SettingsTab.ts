import { App, PluginSettingTab, Setting, Notice, DropdownComponent, moment } from 'obsidian';
import SimpleNoteChatPlugin from './main';
import { OpenRouterService, OpenRouterModel, FormattedModelInfo, ModelSortOption } from './OpenRouterService';
import { PluginSettings } from './types';
import { log, initializeLogger } from './utils/logger';
import {
	DEFAULT_ARCHIVE_FOLDER,
	DEFAULT_NN_TITLE_FORMAT,
	CHAT_COMMAND_DEFAULT,
	ARCHIVE_COMMAND_DEFAULT,
	NEW_CHAT_COMMAND_DEFAULT,
	MODEL_COMMAND_DEFAULT
} from './constants';
import { LogLevel } from './types'; // Import LogLevel

export class SimpleNoteChatSettingsTab extends PluginSettingTab {
	plugin: SimpleNoteChatPlugin;
	openRouterService: OpenRouterService;
	private availableModels: OpenRouterModel[] = [];
	private modelDropdown: DropdownComponent | null = null;
	private llmModelDropdown: DropdownComponent | null = null;
	private newNotePreviewEl: HTMLElement | null = null;

	constructor(app: App, plugin: SimpleNoteChatPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.openRouterService = plugin.openRouterService || new OpenRouterService();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ========== CONNECTIONS ==========
		new Setting(containerEl).setName('Connections').setHeading();
		containerEl.createEl('p', { text: 'Configure connection to LLM providers.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('OpenRouter API key')
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
							new Notice('API key saved. Refreshing models...');
							this.availableModels = [];
							this.populateModelDropdowns();
							await this.fetchAndStoreModels(false);
						}
					});
				text.inputEl.setAttribute('type', 'password');
			});

		// ========== MODEL MANAGEMENT ==========
		new Setting(containerEl).setName('Model management').setHeading();
		containerEl.createEl('p', { text: 'Configure model selection and sorting options.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Model sorting')
			.setDesc('Choose how to sort the OpenRouter model lists in the dropdowns below.')
			.addDropdown(dropdown => {
				// Add options based on the ModelSortOption enum
				dropdown
					.addOption(ModelSortOption.ALPHABETICAL, 'Alphabetical')
					.addOption(ModelSortOption.PROMPT_PRICE_ASC, 'Prompt price: ascending')
					.addOption(ModelSortOption.PROMPT_PRICE_DESC, 'Prompt price: descending')
					.addOption(ModelSortOption.COMPLETION_PRICE_ASC, 'Completion price: ascending')
					.addOption(ModelSortOption.COMPLETION_PRICE_DESC, 'Completion price: descending')
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
			.setName('Chat model')
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
		.setName('Refresh model list')
		.setDesc('Fetch the latest available models from OpenRouter. The list automatically refreshes once every 24 hours in the background, as well as when the plugin first starts with Obsidian; so the list should stay pretty current on its own.')
		.addButton(button => button
			.setButtonText('Refresh models')
			.setCta()
			.onClick(async () => {
				await this.fetchAndStoreModels(true);
			}));

		// ========== COMMAND PHRASES ==========
		new Setting(containerEl).setName('Command phrases').setHeading();
		containerEl.createEl('p', { text: 'The plugin will look for these command phrases in order to take action. Phrases are recognzied when entered on their own line, and will activate after you hit the <enter> key. Deleting the phrase will disable it from being recognized, although the hotkey (if set) will still work.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Chat phrase')
			.setDesc(`This phrase will call the AI model and get a response. Previous conversation in the note is included and parsed into user and assistant messages, so the model can clearly follow the conversation. Default: (${CHAT_COMMAND_DEFAULT})`)
			.addText(text => text
				.setPlaceholder(CHAT_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.chatCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					this.plugin.settings.chatCommandPhrase = trimmedValue;
					await this.plugin.saveSettings();
					this.updateNewNotePathPreview(); // Update preview
				}));

		new Setting(containerEl)
			.setName('Change model phrase')
			.setDesc(`This will open an AI model selection dialog, to enable quickly changing the active model used for chats. Default: (${MODEL_COMMAND_DEFAULT}).`)
			.addText(t => t
				.setPlaceholder(MODEL_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.modelCommandPhrase)
				.onChange(async (v) => {
					const trimmed = v.trim();
					this.plugin.settings.modelCommandPhrase = trimmed;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
		.setName('New chat phrase')
		.setDesc(`This quickly creates a new chat note, for when you want to start a new chat from anywhere in your vault. By default, the chat note is created in the archive directory with the current date and time. It's behavior can be configured in the New note settings section below. Default: (${NEW_CHAT_COMMAND_DEFAULT}).`)
		.addText(text => text
			.setPlaceholder(NEW_CHAT_COMMAND_DEFAULT)
			.setValue(this.plugin.settings.newChatCommandPhrase)
			.onChange(async (value) => {
				const trimmedValue = value.trim();
				if (this.plugin.settings.newChatCommandPhrase !== trimmedValue) {
					this.plugin.settings.newChatCommandPhrase = trimmedValue;
					await this.plugin.saveSettings();
				}
			}));

		new Setting(containerEl)
			.setName('Archive phrase')
			.setDesc(`This phrase, when typed on its own line, will archive the current chat note. Leave blank to disable this phrase trigger (command still available via hotkey/palette). Default: (${ARCHIVE_COMMAND_DEFAULT}).`)
			.addText(text => text
				.setPlaceholder(ARCHIVE_COMMAND_DEFAULT)
				.setValue(this.plugin.settings.archiveCommandPhrase)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (this.plugin.settings.archiveCommandPhrase !== trimmedValue) {
						this.plugin.settings.archiveCommandPhrase = trimmedValue;
						await this.plugin.saveSettings();
					}
				}));

		// ========== BEHAVIOR SETTINGS ==========
		new Setting(containerEl).setName('Behavior').setHeading();
		containerEl.createEl('p', { text: 'Configure how the plugin reacts to user input.', cls: 'snc-setting-section-description' });

		let spacebarDelaySetting: Setting; // Declare here to be accessible in both scopes

		new Setting(containerEl)
			.setName('Enable spacebar command detection')
			.setDesc('Detect command phrases after pressing spacebar. Defaults to 0.5 seconds wait before acting (configurable below).')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSpacebarDetection)
				.onChange(async (value) => {
					this.plugin.settings.enableSpacebarDetection = value;
					await this.plugin.saveSettings();
					new Notice(`Spacebar command detection ${value ? 'enabled' : 'disabled'}.`);
					if (spacebarDelaySetting) { // Check if spacebarDelaySetting is initialized
						spacebarDelaySetting.settingEl.toggleClass('snc-hidden', !value);
					}
				}));

		spacebarDelaySetting = new Setting(containerEl) // Assign here
			.setName('Spacebar detection delay')
			.setDesc('Wait time in seconds before acting after spacebar detection (e.g., 0.5 for half a second).')
			.addText(text => text
				.setPlaceholder('0.5')
				.setValue(String(this.plugin.settings.spacebarDetectionDelay))
				.onChange(async (value) => {
					const floatValue = parseFloat(value);
					if (!isNaN(floatValue) && floatValue >= 0) {
						this.plugin.settings.spacebarDetectionDelay = floatValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Please enter a valid number (e.g., 0.5).');
						text.setValue(String(this.plugin.settings.spacebarDetectionDelay));
					}
				}))
			.then(setting => {
				const inputEl = setting.controlEl.querySelector('input');
				if (inputEl) {
					inputEl.setAttribute('type', 'number');
					inputEl.setAttribute('step', '0.1');
					inputEl.setAttribute('min', '0');
				}
			});

		// Set initial visibility of the delay setting
		if (spacebarDelaySetting) { // Check if spacebarDelaySetting is initialized
			spacebarDelaySetting.settingEl.toggleClass('snc-hidden', !this.plugin.settings.enableSpacebarDetection);
		}


		// ========== ARCHIVE SETTINGS ==========
		new Setting(containerEl).setName('Archiving').setHeading();
		containerEl.createEl('p', { text: 'Configure how notes are handled when using the Archive command phrase.', cls: 'snc-setting-section-description' });

		new Setting(containerEl)
			.setName('Archive folder')
			.setDesc('Move notes to this directory when the archive command is used.')
			.addText(text => text
				.setPlaceholder(DEFAULT_ARCHIVE_FOLDER)
				.setValue(this.plugin.settings.archiveFolderName)
				.onChange(async (value) => {
					const trimmedValue = value.trim();

					if (this.plugin.settings.archiveFolderName !== trimmedValue) {
						this.plugin.settings.archiveFolderName = trimmedValue;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Rename note on archive (date/time)')
			.setDesc('When this is enabled, the archived note will be renamed using the current date and time.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameDate)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameDate = value;
					await this.plugin.saveSettings();
					new Notice(`Archive renaming ${value ? 'enabled' : 'disabled'}.`);
					// Show/hide the date format setting
					if (dateTimeFormatSetting) {
						dateTimeFormatSetting.settingEl.toggleClass('snc-hidden', !value);
					}
				}));

		// Store the setting instance to control its visibility
		const dateTimeFormatSetting = new Setting(containerEl)
			.setName('Date and time format')
			.setDesc('This uses moment.js for specifying the date and time format to use on the archived note. Default: (YYYY-MM-DD-HH-mm)')
			.addText(text => text
				.setPlaceholder(DEFAULT_NN_TITLE_FORMAT)
				.setValue(this.plugin.settings.archiveRenameDateFormat)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (trimmedValue) {
						this.plugin.settings.archiveRenameDateFormat = trimmedValue;
						await this.plugin.saveSettings();
					} else {
						new Notice('Archive rename format cannot be empty.');
						text.setValue(this.plugin.settings.archiveRenameDateFormat);
					}
				}));

		// Set initial visibility based on the toggle state
		dateTimeFormatSetting.settingEl.toggleClass('snc-hidden', !this.plugin.settings.enableArchiveRenameDate);

		new Setting(containerEl)
			.setName('Generate a title')
			.setDesc(`This will generate a title based on the note's content. This is added after the date if both are enabled.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableArchiveRenameLlm)
				.onChange(async (value) => {
					this.plugin.settings.enableArchiveRenameLlm = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title renaming ${value ? 'enabled' : 'disabled'}.`);
					// No need to update description here anymore
					llmSettingsContainer.toggleClass('snc-hidden', !value);
				}));

		const llmSettingsContainer = containerEl.createDiv('llm-archive-rename-settings');

		new Setting(llmSettingsContainer)
			.setName('Note title model')
			.setDesc('Choose which model will generate the note title. By default, it uses the same model as your chat conversations.')
			.addDropdown(dropdown => {
				this.llmModelDropdown = dropdown; // Assign to the class property
				dropdown.addOption('', 'Use current chat model');
				dropdown.setValue(this.plugin.settings.llmRenameModel);
				dropdown.onChange(async (value) => {
					this.plugin.settings.llmRenameModel = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(llmSettingsContainer)
			.setName('Title word limit')
			.setDesc('The maximum number of words allowed for the generated title.')
			.addText(text => text
				.setPlaceholder('3')
				.setValue(String(this.plugin.settings.llmRenameWordLimit))
				.onChange(async (value) => {
					const numValue = parseInt(value, 10);
					if (!isNaN(numValue) && numValue >= 1) {
						this.plugin.settings.llmRenameWordLimit = numValue;
						await this.plugin.saveSettings();
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
			.setName('Allow emojis in LLM title?')
			.setDesc(`For those that like the occasional flair. This feature works on MacOS, I'm unsure about: iOS, Android, Linux, and Windows. Note that this doesn't actually ask for emojis; so you will only see them if the model likes to use them.`)
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.llmRenameIncludeEmojis)
				.onChange(async (value) => {
					this.plugin.settings.llmRenameIncludeEmojis = value;
					await this.plugin.saveSettings();
					new Notice(`LLM title emoji inclusion ${value ? 'enabled' : 'disabled'}.`);
				}));

		llmSettingsContainer.toggleClass('snc-hidden', !this.plugin.settings.enableArchiveRenameLlm);


				// ========== NEW NOTE SETTINGS ==========
		new Setting(containerEl).setName('New chat notes').setHeading();
		containerEl.createEl('p', { text: 'Configure how new chat notes are created and where they are placed in your vault.', cls: 'snc-setting-section-description' });
		this.newNotePreviewEl = containerEl.createEl('p', { cls: 'snc-setting-section-description' });

		// Initial update for the consolidated preview
		this.updateNewNotePathPreview();

		new Setting(containerEl)
			.setName('New note folder')
			.setDesc('Choose where new chat notes should be created.')
			.addDropdown(dropdown => {
				dropdown
					.addOption('archive', 'Archive folder')
					.addOption('current', 'Current folder')
					.addOption('custom', 'Custom folder')
					.setValue(this.plugin.settings.newNoteLocation)
					.onChange(async (value) => {
						if (value === 'current' || value === 'archive' || value === 'custom') {
							this.plugin.settings.newNoteLocation = value;
							await this.plugin.saveSettings();
							new Notice(`New note location set to: ${dropdown.selectEl.selectedOptions[0]?.text || value}`);
							customFolderSetting.settingEl.toggleClass('snc-hidden', value !== 'custom');
							this.updateNewNotePathPreview(); // Update the consolidated preview
						} else {
							log.warn(`SettingsTab: Invalid new note location selected: ${value}`);
							dropdown.setValue(this.plugin.settings.newNoteLocation); // Revert
						}
					});
			});

		// --- Custom Folder Setting (only shown when location is 'custom') ---
		const customFolderSetting = new Setting(containerEl)
			.setName('Custom folder')
			.setDesc(`Which folder should new chat notes be placed in? If the folder doesn't exist then it will get created when the next chat note is created.`)
			.addText(text => text
				.setPlaceholder('e.g., chats/')
				.setValue(this.plugin.settings.newNoteCustomFolder)
				.onChange(async (value) => {
					const trimmedValue = value.trim();
					if (this.plugin.settings.newNoteCustomFolder !== trimmedValue) {
						this.plugin.settings.newNoteCustomFolder = trimmedValue;
						await this.plugin.saveSettings();
						this.updateNewNotePathPreview(); // Update preview when custom folder changes
					}
				}));

		// Initially hide the custom folder setting
		customFolderSetting.settingEl.toggleClass('snc-hidden', this.plugin.settings.newNoteLocation !== 'custom');

		// --- New Note Date & Time ---
		new Setting(containerEl) // Store the setting instance
			.setName('Optional date & time')
			.setDesc('Uses moment.js format for date/time in the title. Leave empty if no date/time is desired. Default: (YYYY-MM-DD-HH-mm)')
			.addText(text => { text
				.setPlaceholder('YYYY-MM-DD-HH-mm')
				.setValue(this.plugin.settings.newNoteTitleFormat)
				.onChange(async (value) => {
					this.plugin.settings.newNoteTitleFormat = value.trim();
					await this.plugin.saveSettings();
					this.updateNewNotePathPreview();
				});
			});

		// --- New Note Title Prefix ---
		new Setting(containerEl) // Store the setting instance
		.setName('Optional prefix')
		.setDesc('Text to add before the date/time in the new chat note title.')
		.addText(text => { text
			.setPlaceholder('e.g., Chat-')
			.setValue(this.plugin.settings.newNoteTitlePrefix)
			.onChange(async (value) => {
				this.plugin.settings.newNoteTitlePrefix = value;
				await this.plugin.saveSettings();
				this.updateNewNotePathPreview();
			});
		});

		// --- New Note Title Suffix ---
		new Setting(containerEl) // Store the setting instance
			.setName('Optional suffix')
			.setDesc('Text to add after the date/time in the new chat note title.')
			.addText(text => { text
				.setPlaceholder('e.g., -Meeting')
				.setValue(this.plugin.settings.newNoteTitleSuffix)
				.onChange(async (value) => {
					this.plugin.settings.newNoteTitleSuffix = value;
					await this.plugin.saveSettings();
					this.updateNewNotePathPreview();
				});
			});

		// Initial update for the consolidated preview
		this.updateNewNotePathPreview();

		// Fetch models and populate dropdowns on display (handles missing API key internally)
		this.fetchAndStoreModels(false);
		new Setting(containerEl).setName('Logging').setHeading();
		containerEl.createEl('p', {
			text: 'Enable logging to help troubleshoot issues. Logs will appear in the developer console (View -> Toggle Developer Tools -> Console).',
			cls: 'snc-setting-section-description'
		});

		const loggingLevelSetting = new Setting(containerEl)
			.setName('Logging level')
			.setDesc('Select the level of detail for logs.')
			.addDropdown(dropdown => {
				dropdown
					.addOption(LogLevel.ERROR, 'Errors only')
					.addOption(LogLevel.WARN, 'Warnings & errors')
					.addOption(LogLevel.INFO, 'Info, warnings & errors')
					.addOption(LogLevel.DEBUG, 'Debug (all logs)')
					.setValue(this.plugin.settings.logLevel)
					.onChange(async (value) => {
						if (Object.values(LogLevel).includes(value as LogLevel)) {
							this.plugin.settings.logLevel = value as LogLevel;
							await this.plugin.saveSettings();
							initializeLogger(this.plugin.settings); // Update logger immediately
							new Notice(`Log level set to ${value}`);
						} else {
							log.warn(`SettingsTab: Invalid log level selected: ${value}`);
							dropdown.setValue(this.plugin.settings.logLevel); // Revert
						}
					});
			});

		new Setting(containerEl)
			.setName('Enable logging')
			.setDesc('Turn on logging to the developer console.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableLogging)
				.onChange(async (value) => {
					this.plugin.settings.enableLogging = value;
					await this.plugin.saveSettings();
					initializeLogger(this.plugin.settings); // Update logger immediately
					loggingLevelSetting.settingEl.toggleClass('snc-hidden', !value); // Show/hide level dropdown
					new Notice(`Logging ${value ? 'enabled' : 'disabled'}.`);
				}));

		// Set initial visibility of the logging level dropdown
		loggingLevelSetting.settingEl.toggleClass('snc-hidden', !this.plugin.settings.enableLogging);
	} // End of display() method



	/**
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
			dropdown.addOption('', 'Enter API key to load models'); // Assuming noApiKeyText was 'Enter API Key to load models'
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
			dropdown.addOption(model.id, model.displayName);
		});

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

	/** Generates a preview filename based on current settings */
	private generateFilenamePreview(): { filename: string, error: boolean } {
		const format = this.plugin.settings.newNoteTitleFormat;
		const prefix = this.plugin.settings.newNoteTitlePrefix;
		const suffix = this.plugin.settings.newNoteTitleSuffix;

		if (!prefix && !suffix && !format) {
			return { filename: 'Untitled.md', error: false };
		}

		let formattedDate = '';
		if (format) {
			try {
				formattedDate = moment().format(format);
			} catch (e) {
				log.warn("SettingsTab: Invalid moment format string for title preview:", format, e);
				return { filename: 'Invalid date format', error: true };
			}
		}

		const filename = `${prefix}${formattedDate}${suffix}.md`;

		// Basic check for potentially invalid characters in filename
		if (/[\\/:]/.test(filename)) {
			log.warn("SettingsTab: Generated filename contains potentially invalid characters:", filename);
			return { filename: 'Invalid characters in filename', error: true };
		}

		return { filename: filename, error: false };
	}

	/** Updates the new note path preview */
	private updateNewNotePathPreview(): void {
		if (!this.newNotePreviewEl) {
			log.warn("SettingsTab: New Note Preview element not available for update.");
			return;
		}

		const { filename, error: filenameError } = this.generateFilenamePreview();
		let folderPath = '';
		let previewText = '';
		let previewClass = 'snc-filename-preview';

		const location = this.plugin.settings.newNoteLocation;

		if (filenameError) {
			previewText = `Preview: ${filename}`;
			previewClass = 'snc-preview-error';
		} else {
			switch (location) {
				case 'archive':
					folderPath = this.plugin.settings.archiveFolderName || DEFAULT_ARCHIVE_FOLDER;
					if (folderPath && !folderPath.endsWith('/')) {
						folderPath += '/';
					}
					previewText = `Preview: ${folderPath}${filename}`;
					break;
				case 'custom':
					folderPath = this.plugin.settings.newNoteCustomFolder || '';
					// Ensure trailing slash if folder path exists and doesn't have one
					if (folderPath && !folderPath.endsWith('/')) {
						folderPath += '/';
					}
					previewText = `Preview: ${folderPath}${filename}`;
					break;
				case 'current':
				default:
					previewText = `Preview: ${filename} (created in the folder of the currently active note, or root folder if none)`;
					break;
			}
			// Basic check for invalid characters in folder path (relevant for custom/archive)
			if ((location === 'custom' || location === 'archive') && /[\\:*?"<>|]/.test(folderPath)) {
				previewText = `Preview: Invalid characters in folder path: ${folderPath}`;
				previewClass = 'snc-preview-error';
			}
		}

		this.newNotePreviewEl.textContent = previewText;
		this.newNotePreviewEl.className = `snc-setting-section-description ${previewClass}`;
	}

	/**
	 * Sorts models, formats them, and populates dropdown menus
	 */
	private populateModelDropdowns(): void {
		let formattedModels: FormattedModelInfo[] = [];
		if (this.plugin.settings.apiKey && this.availableModels.length > 0) {
			try {
				const sortedModels = this.openRouterService.sortModels(
					this.availableModels,
					this.plugin.settings.modelSortOrder as ModelSortOption
				);
				formattedModels = this.openRouterService.getFormattedModels(sortedModels);

			} catch (error) {
				log.error("SettingsTab: Error sorting or formatting models:", error);
				new Notice("Error preparing model list. Check console.");
				// Format unsorted models as fallback
				try {
					formattedModels = this.openRouterService.getFormattedModels(this.availableModels);
				} catch (formatError) {
					log.error("SettingsTab: Fallback formatting failed:", formatError);
					formattedModels = []; // Ensure it's an empty array on complete failure
				}
			}
		}

		this.populateModelDropdown(
			this.modelDropdown,
			formattedModels,
			'defaultModel',
			'Enter API key to load models',
			'-- Select a model --'
		);
		this.populateModelDropdown(
			this.llmModelDropdown,
			formattedModels,
			'llmRenameModel',
			'Enter API key to load models',
			'Use default chat model'
		);
	}


	/**
	 * Fetches models from OpenRouter and updates dropdowns
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
			const models = await this.openRouterService.fetchModels(
				this.plugin.settings.apiKey,
				showNotices
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
