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
    modelDropdown: DropdownComponent | null = null; // Default chat model dropdown
    llmModelDropdown: DropdownComponent | null = null; // LLM title model dropdown

    constructor(app: App, plugin: SimpleNoteChatPlugin) {
        super(app, plugin);
        this.plugin = plugin;
        this.openRouterService = new OpenRouterService();
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
                    .onChange(async (value) => { // Use onChange for saving when input loses focus or Enter is pressed
                        const trimmedValue = value.trim();
                        if (this.plugin.settings.apiKey !== trimmedValue) {
                            this.plugin.settings.apiKey = trimmedValue;
                            await this.plugin.saveSettings();
                            // Optionally trigger model refresh after key change, maybe with a small delay or confirmation
                            // Consider adding a visual indicator that the key needs saving or validation
                            new Notice('API Key saved. Refresh models if needed.');
                            // Auto-refresh models or prompt user? Let's keep it manual for now via the button.
                            // If the key is cleared, disable/clear the dropdown
                             if (!trimmedValue && this.modelDropdown) {
                                 // Clear/disable dropdowns if API key is removed
                                 this.populateModelDropdown(this.modelDropdown, [], 'defaultModel', 'Enter API Key to load models', '-- Select a model --');
                                 if (this.llmModelDropdown) {
                                     this.populateModelDropdown(this.llmModelDropdown, [], 'llmRenameModel', 'Enter API Key to load models', 'Use Default Chat Model');
                                 }
                             } else if (trimmedValue && this.modelDropdown) {
                                 // Re-enable dropdown if it was disabled
                                 this.modelDropdown.setDisabled(false);
                                 // Maybe trigger a silent refresh?
                             }
                        }
                    });
                // Set the input type *after* creating the text component
                text.inputEl.setAttribute('type', 'password');
            });
                // Consider adding an 'onblur' event as well if debouncing isn't used,
                // or a dedicated button to validate/save the key.

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

        // --- Refresh Models Button ---
        new Setting(containerEl)
            .setName('Refresh Model List')
            .setDesc('Fetch the latest available models from OpenRouter using your API key.')
            .addButton(button => button
                .setButtonText('Refresh Models')
                .setCta() // Make button more prominent
                .onClick(async () => {
                    await this.refreshModels();
                   }));

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
                    	// Optionally revert to default or show error if empty
                    	new Notice('Stop sequence cannot be empty.');
                    	// Revert UI to current saved setting if user tries to clear it
                    	text.setValue(this.plugin.settings.stopCommandSequence);
                    }
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
                    // Ensure it ends with a slash if not empty, or is empty
                    const normalizedValue = trimmedValue ? (trimmedValue.endsWith('/') ? trimmedValue : `${trimmedValue}/`) : '';

                    if (this.plugin.settings.archiveFolderName !== normalizedValue) {
                        this.plugin.settings.archiveFolderName = normalizedValue;
                        await this.plugin.saveSettings();
                        new Notice('Archive folder setting saved.');
                        // Update the input field to show the normalized value (e.g., added slash)
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
                            // Allow empty separator? Let's assume yes for now.
                            // Trim whitespace, but allow potentially empty string
                            const trimmedValue = value.trim();
                            if (this.plugin.settings.chatSeparator !== trimmedValue) {
                                this.plugin.settings.chatSeparator = trimmedValue;
                                await this.plugin.saveSettings();
                                new Notice('Chat separator saved.');
                            }
                        }));

                // Add the notice about reloading
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
                       // Revert UI to current saved setting if user tries to clear it
                       text.setValue(this.plugin.settings.archiveRenameDateFormat);
                   }
                  }));

                // --- LLM Title Renaming Settings (within gg section) ---
                const llmSettingsContainer = containerEl.createDiv('llm-archive-rename-settings'); // Container for dynamic visibility

                new Setting(containerEl)
                 .setName('Rename Note on Archive (LLM Title)')
                 .setDesc('Use an LLM to generate a title based on note content when archiving. This happens *after* date renaming if both are enabled.')
                 .addToggle(toggle => toggle
                  .setValue(this.plugin.settings.enableArchiveRenameLlm)
                  .onChange(async (value) => {
                   this.plugin.settings.enableArchiveRenameLlm = value;
                   await this.plugin.saveSettings();
                   new Notice(`LLM title renaming ${value ? 'enabled' : 'disabled'}.`);
                   // Show/hide the container
                   llmSettingsContainer.style.display = value ? 'block' : 'none';
                  }));

                // Settings within the container
                new Setting(llmSettingsContainer)
                    .setName('LLM Title Word Limit')
                    .setDesc('Approximate maximum words for the generated title.')
                    .addText(text => text
                        .setPlaceholder('5')
                        .setValue(String(this.plugin.settings.llmRenameWordLimit)) // Convert number to string for input
                        .onChange(async (value) => {
                            const numValue = parseInt(value, 10);
                            if (!isNaN(numValue) && numValue >= 1) {
                                this.plugin.settings.llmRenameWordLimit = numValue;
                                await this.plugin.saveSettings();
                                new Notice('LLM title word limit saved.');
                            } else {
                                new Notice('Please enter a valid number (1 or greater).');
                                // Optionally revert the input value if invalid
                                text.setValue(String(this.plugin.settings.llmRenameWordLimit));
                            }
                        }))
                    // Set input type to number for better UX (though validation is still needed)
                    .then(setting => {
                        // Access the input element after it's added
                        const inputEl = setting.controlEl.querySelector('input');
                        if (inputEl) {
                            inputEl.setAttribute('type', 'number');
                            inputEl.setAttribute('min', '1'); // Set minimum value for browser validation
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

                // Set initial visibility of the container
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
        // Attempt to load models when the tab is displayed if an API key exists
        if (this.plugin.settings.apiKey) {
            // Load models silently in the background on initial display
            this.loadAndPopulateModels(false); // false = don't show explicit notices unless error
        } else {
             // Ensure dropdowns are cleared and show appropriate message if no key
             if (this.modelDropdown) {
                 this.populateModelDropdown(this.modelDropdown, [], 'defaultModel', 'Enter API Key to load models', '-- Select a model --');
             }
             if (this.llmModelDropdown) {
                 this.populateModelDropdown(this.llmModelDropdown, [], 'llmRenameModel', 'Enter API Key to load models', 'Use Default Chat Model');
             }
        }
    }

    /**
     * Helper function to populate the model dropdown menu.
     * @param dropdown The DropdownComponent instance.
     * @param dropdown The DropdownComponent instance.
     * @param models Array of models (OpenRouterModel) to populate with.
     * @param settingKey The key in PluginSettings that this dropdown controls.
     * @param noApiKeyText Text to display when API key is missing.
     * @param placeholderText Default placeholder text when models are loaded.
     */
    private populateModelDropdown(
        dropdown: DropdownComponent,
        models: OpenRouterModel[],
        settingKey: keyof PluginSettings, // Use keyof for type safety
        noApiKeyText: string,
        placeholderText: string
    ): void {
        dropdown.selectEl.empty(); // Clear existing options first

        if (!this.plugin.settings.apiKey) {
             dropdown.addOption('', noApiKeyText);
             dropdown.setDisabled(true);
             return;
        }

        if (models.length === 0) {
            // Handles API errors or empty model list
            dropdown.addOption('', 'No models found or API key invalid');
            // Keep dropdown enabled but show placeholder, maybe disable? Let's keep enabled for now.
            // dropdown.setDisabled(true);
            // Set value to empty to ensure placeholder is selected
            dropdown.setValue('');
            // We don't return here, allow the placeholder to be added below
        }

        // If we have models, enable the dropdown and add the placeholder first
        // Enable dropdown and add the specific placeholder text
        dropdown.setDisabled(false);
        dropdown.addOption('', placeholderText);

        // Add each model to the dropdown
        models.forEach(model => {
            // Display format: "Model Name (model/id)"
            const displayName = model.name ? `${model.name} (${model.id})` : model.id;
            dropdown.addOption(model.id, displayName);
        });

        // Try to re-select the currently saved model for this specific setting
        // @ts-ignore - Accessing setting dynamically, TS might complain but it's valid here
        const savedModel = this.plugin.settings[settingKey] as string;
        if (savedModel && models.some(m => m.id === savedModel)) {
            dropdown.setValue(savedModel);
        } else {
            // If saved model isn't in the list (or no model saved), ensure placeholder is selected
            dropdown.setValue('');
        }
    }

    /**
     * Fetches models from OpenRouter, sorts them, and updates the dropdown.
     * Handles showing notices to the user during the process.
     * @param showNotices If true, displays "Fetching..." and success/error notices.
     */
    private async loadAndPopulateModels(showNotices: boolean = true): Promise<void> {
        if (!this.plugin.settings.apiKey) {
            if (showNotices) {
                new Notice('Please enter your OpenRouter API key first.');
            }
             if (this.modelDropdown) {
                 this.populateModelDropdown(this.modelDropdown, [], 'defaultModel', 'Enter API Key to load models', '-- Select a model --');
             }
             if (this.llmModelDropdown) {
                 this.populateModelDropdown(this.llmModelDropdown, [], 'llmRenameModel', 'Enter API Key to load models', 'Use Default Chat Model');
             }
            return;
        }

        let loadingNotice;
        if (showNotices) {
            // Persistent notice while loading
            loadingNotice = new Notice('Fetching models from OpenRouter...', 0);
        }

        try {
            const models = await this.openRouterService.fetchModels(this.plugin.settings.apiKey);

            // fetchModels now returns [] on error and shows its own Notice for API errors.
            // So, we just need to check the length.
            const sortedModels = this.openRouterService.sortModels(models, 'name', 'asc'); // Default sort by name

            let populatedCount = 0;
            if (this.modelDropdown) {
                this.populateModelDropdown(this.modelDropdown, sortedModels, 'defaultModel', 'Enter API Key to load models', '-- Select a model --');
                populatedCount++;
            } else {
                 console.warn("SettingsTab: Default model dropdown reference is null.");
            }
            if (this.llmModelDropdown) {
                this.populateModelDropdown(this.llmModelDropdown, sortedModels, 'llmRenameModel', 'Enter API Key to load models', 'Use Default Chat Model');
                populatedCount++;
            } else {
                 console.warn("SettingsTab: LLM title model dropdown reference is null.");
            }

            if (showNotices) {
                if (models.length > 0 && populatedCount > 0) {
                    new Notice('Model list updated successfully.');
                } else if (models.length === 0 && populatedCount > 0) {
                    // Notice handled by populateModelDropdown
                } else if (populatedCount === 0) {
                     new Notice('Error: Could not update model dropdown UI elements.');
                }
            }

        } catch (error) {
            // Catch unexpected errors during sorting or populating
            console.error("SettingsTab: Error processing models:", error);
            if (showNotices) {
                new Notice('An unexpected error occurred while updating model list.');
            }
             if (this.modelDropdown) {
                 this.populateModelDropdown(this.modelDropdown, [], 'defaultModel', 'Enter API Key to load models', '-- Select a model --');
             }
              if (this.llmModelDropdown) {
                 this.populateModelDropdown(this.llmModelDropdown, [], 'llmRenameModel', 'Enter API Key to load models', 'Use Default Chat Model');
             }
        } finally {
            // Hide the persistent "Fetching..." notice
            loadingNotice?.hide();
        }
    }

     /**
      * Public method called by the refresh button's onClick handler.
      */
     public async refreshModels(): Promise<void> {
         // Always show notices when the button is clicked manually
         await this.loadAndPopulateModels(true);
     }
}
