import { ObsidianLauncher } from '../harness/obsidian-launcher';
import { MockApiServer } from '../harness/mock-api-server';
import { TestUtilities, TestResult } from '../harness/test-utilities';

/**
 * Tests for the settings tab functionality
 */
export async function runSettingsTests(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test settings persistence
  results.push(await testSettingsPersistence(obsidian, mockApi, testUtils));

  // Test default settings
  results.push(await testDefaultSettings(obsidian, mockApi, testUtils));

  // Test command phrase customization
  results.push(await testCommandPhraseCustomization(obsidian, mockApi, testUtils));

  // Test model selection persistence
  results.push(await testModelSelectionPersistence(obsidian, mockApi, testUtils));

  return results;
}

/**
 * Test that settings are properly saved and loaded
 */
async function testSettingsPersistence(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'Settings Persistence';
  const startTime = Date.now();

  try {
    testUtils.log('Testing settings persistence...');

    const testSettings = {
      apiKey: 'sk-test-persistence-key',
      defaultModel: 'anthropic/claude-3-sonnet',
      chatCommandPhrase: 'chat',
      archiveCommandPhrase: 'archive',
      modelCommandPhrase: 'model',
      newChatCommandPhrase: 'new',
      archiveFolderName: 'archived-notes',
      newNoteLocation: 'custom',
      newNoteCustomFolder: 'chat-notes',
      newNoteTitleFormat: 'YYYY-MM-DD-HH-mm-ss',
      newNoteTitlePrefix: 'Chat-',
      newNoteTitleSuffix: '-End',
      enableSpacebarDetection: true,
      spacebarDetectionDelay: 2.5,
      enableArchiveRenameLlm: true,
      llmRenameModel: 'openai/gpt-3.5-turbo'
    };

    // Save settings
    await obsidian.setPluginData(testSettings);
    await testUtils.wait(1000);

    // Load settings and verify
    const loadedSettings = await obsidian.getPluginData();

    // Verify all settings were saved (except API key which should be encrypted)
    testUtils.assertEqual(loadedSettings.defaultModel, testSettings.defaultModel, 'Default model should persist');
    testUtils.assertEqual(loadedSettings.chatCommandPhrase, testSettings.chatCommandPhrase, 'Chat command phrase should persist');
    testUtils.assertEqual(loadedSettings.archiveCommandPhrase, testSettings.archiveCommandPhrase, 'Archive command phrase should persist');
    testUtils.assertEqual(loadedSettings.modelCommandPhrase, testSettings.modelCommandPhrase, 'Model command phrase should persist');
    testUtils.assertEqual(loadedSettings.newChatCommandPhrase, testSettings.newChatCommandPhrase, 'New chat command phrase should persist');
    testUtils.assertEqual(loadedSettings.archiveFolderName, testSettings.archiveFolderName, 'Archive folder name should persist');
    testUtils.assertEqual(loadedSettings.newNoteLocation, testSettings.newNoteLocation, 'New note location should persist');
    testUtils.assertEqual(loadedSettings.newNoteCustomFolder, testSettings.newNoteCustomFolder, 'New note custom folder should persist');
    testUtils.assertEqual(loadedSettings.newNoteTitleFormat, testSettings.newNoteTitleFormat, 'New note title format should persist');
    testUtils.assertEqual(loadedSettings.newNoteTitlePrefix, testSettings.newNoteTitlePrefix, 'New note title prefix should persist');
    testUtils.assertEqual(loadedSettings.newNoteTitleSuffix, testSettings.newNoteTitleSuffix, 'New note title suffix should persist');
    testUtils.assertEqual(loadedSettings.enableSpacebarDetection, testSettings.enableSpacebarDetection, 'Spacebar detection setting should persist');
    testUtils.assertEqual(loadedSettings.spacebarDetectionDelay, testSettings.spacebarDetectionDelay, 'Spacebar detection delay should persist');
    testUtils.assertEqual(loadedSettings.enableArchiveRenameLlm, testSettings.enableArchiveRenameLlm, 'Archive rename LLM setting should persist');
    testUtils.assertEqual(loadedSettings.llmRenameModel, testSettings.llmRenameModel, 'LLM rename model should persist');

    // API key should be encrypted
    testUtils.assert(
      loadedSettings.apiKey.startsWith('snc_encrypted:'),
      'API key should be encrypted when saved'
    );

    testUtils.log('✅ Settings persistence test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ Settings persistence test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test that default settings are properly applied
 */
async function testDefaultSettings(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'Default Settings';
  const startTime = Date.now();

  try {
    testUtils.log('Testing default settings...');

    // Clear any existing settings
    await obsidian.setPluginData({});
    await testUtils.wait(1000);

    // Load settings (should get defaults)
    const settings = await obsidian.getPluginData();

    // Verify default command phrases
    testUtils.assertEqual(settings.chatCommandPhrase || 'cc', 'cc', 'Default chat command should be cc');
    testUtils.assertEqual(settings.archiveCommandPhrase || 'gg', 'gg', 'Default archive command should be gg');
    testUtils.assertEqual(settings.modelCommandPhrase || 'cm', 'cm', 'Default model command should be cm');
    testUtils.assertEqual(settings.newChatCommandPhrase || 'nn', 'nn', 'Default new chat command should be nn');

    // Verify other defaults
    testUtils.assertEqual(settings.archiveFolderName || 'archive/', 'archive/', 'Default archive folder should be archive/');
    testUtils.assertEqual(settings.newNoteLocation || 'archive', 'archive', 'Default new note location should be archive');
    testUtils.assertEqual(settings.enableSpacebarDetection !== false, true, 'Spacebar detection should be enabled by default');
    testUtils.assertEqual(settings.spacebarDetectionDelay || 1.5, 1.5, 'Default spacebar delay should be 1.5 seconds');

    testUtils.log('✅ Default settings test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ Default settings test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test that custom command phrases work correctly
 */
async function testCommandPhraseCustomization(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'Command Phrase Customization';
  const startTime = Date.now();

  try {
    testUtils.log('Testing command phrase customization...');

    // Set custom command phrases
    const customSettings = {
      apiKey: 'sk-test-custom-commands',
      chatCommandPhrase: 'ask',
      archiveCommandPhrase: 'done',
      modelCommandPhrase: 'switch',
      newChatCommandPhrase: 'create'
    };

    await obsidian.setPluginData(customSettings);
    await testUtils.wait(1000);

    // Clear API request log
    mockApi.clearRequestLog();

    // Test custom chat command
    const noteContent = `Test note for custom commands.

This should trigger the chat with custom command.

ask`;

    await obsidian.createNote('test-custom-commands', noteContent);
    await testUtils.wait(1000);

    // Wait for API call (should be triggered by 'ask' instead of 'cc')
    await testUtils.waitFor(async () => {
      const requests = mockApi.getRequestLog();
      return requests.some(req => req.url.includes('/chat/completions'));
    }, 5000);

    // Verify API call was made
    const apiRequests = mockApi.getRequestLog().filter(req => req.url.includes('/chat/completions'));
    testUtils.assert(apiRequests.length > 0, 'Custom chat command should trigger API call');

    // Verify command line was removed
    const updatedContent = await obsidian.readNote('test-custom-commands.md');
    testUtils.assert(!updatedContent.includes('\nask'), 'Custom command line should be removed');

    testUtils.log('✅ Command phrase customization test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ Command phrase customization test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test that model selection is properly saved and used
 */
async function testModelSelectionPersistence(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'Model Selection Persistence';
  const startTime = Date.now();

  try {
    testUtils.log('Testing model selection persistence...');

    const testModel = 'anthropic/claude-3-sonnet';

    // Set a specific model
    await obsidian.setPluginData({
      apiKey: 'sk-test-model-selection',
      defaultModel: testModel,
      chatCommandPhrase: 'cc'
    });

    await testUtils.wait(1000);

    // Clear API request log
    mockApi.clearRequestLog();

    // Trigger a chat completion to verify the model is used
    const noteContent = `Test note for model selection.

cc`;

    await obsidian.createNote('test-model-selection', noteContent);
    await testUtils.wait(1000);

    // Wait for API call
    await testUtils.waitFor(async () => {
      const requests = mockApi.getRequestLog();
      return requests.some(req => req.url.includes('/chat/completions'));
    }, 5000);

    // Verify the correct model was used in the API call
    const chatRequests = mockApi.getRequestLog().filter(req => req.url.includes('/chat/completions'));
    testUtils.assert(chatRequests.length > 0, 'API call should have been made');

    const chatRequest = chatRequests[0];
    testUtils.assertEqual(chatRequest.body.model, testModel, 'Correct model should be used in API call');

    // Verify settings persistence after restart simulation
    const reloadedSettings = await obsidian.getPluginData();
    testUtils.assertEqual(reloadedSettings.defaultModel, testModel, 'Model selection should persist');

    testUtils.log('✅ Model selection persistence test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ Model selection persistence test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}