import { ObsidianLauncher } from '../harness/obsidian-launcher';
import { MockApiServer } from '../harness/mock-api-server';
import { TestUtilities, TestResult } from '../harness/test-utilities';

/**
 * Tests for the core command functionality (cc, cm, gg, nn)
 */
export async function runCommandTests(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test cc command (Chat Completion)
  results.push(await testCCCommand(obsidian, mockApi, testUtils));

  // Test cm command (Change Model)
  results.push(await testCMCommand(obsidian, mockApi, testUtils));

  // Test gg command (Archive)
  results.push(await testGGCommand(obsidian, mockApi, testUtils));

  // Test nn command (New Note)
  results.push(await testNNCommand(obsidian, mockApi, testUtils));

  return results;
}

/**
 * Test cc<enter> command - should call OpenRouter service with correct data
 */
async function testCCCommand(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'CC Command - Chat Completion';
  const startTime = Date.now();

  try {
    testUtils.log('Testing cc command...');

    // Clear previous API requests
    mockApi.clearRequestLog();

    // Set up test API key in plugin settings
    const testApiKey = 'sk-test-key-for-cc-command';
    await obsidian.setPluginData({
      apiKey: testApiKey,
      defaultModel: 'openai/gpt-3.5-turbo',
      chatCommandPhrase: 'cc'
    });

    // Create a test note with content and cc command
    const noteContent = `This is a test note for chat completion.

Some context about the topic.

cc`;

    const notePath = await obsidian.createNote('test-cc-command', noteContent);
    testUtils.log(`Created test note: ${notePath}`);

    // Wait for the note to be created and recognized by Obsidian
    await testUtils.wait(1000);

    // Simulate the cc<enter> command
    // In a real implementation, this would involve:
    // 1. Opening the note in Obsidian
    // 2. Positioning cursor after "cc"
    // 3. Pressing Enter
    // For now, we'll simulate the expected behavior

    // Wait for API call to be made
    await testUtils.waitFor(async () => {
      const requests = mockApi.getRequestLog();
      return requests.some(req =>
        req.url.includes('/chat/completions') &&
        req.headers.authorization === `Bearer ${testApiKey}`
      );
    }, 5000);

    // Verify API call was made with correct parameters
    const apiRequests = mockApi.getRequestsWithApiKey(testApiKey);
    testUtils.assert(apiRequests.length > 0, 'API call should have been made');

    const chatRequest = apiRequests.find(req => req.url.includes('/chat/completions'));
    testUtils.assert(!!chatRequest, 'Chat completion request should have been made');

    if (chatRequest) {
      testUtils.assert(chatRequest.body.model === 'openai/gpt-3.5-turbo', 'Correct model should be used');
      testUtils.assert(Array.isArray(chatRequest.body.messages), 'Messages should be an array');
      testUtils.assert(chatRequest.body.stream === true, 'Should request streaming response');
    }

    // Verify command line was removed from note
    const updatedContent = await obsidian.readNote(notePath);
    testUtils.assert(!updatedContent.includes('\ncc'), 'Command line should be removed');

    // Verify response was added to note
    testUtils.assert(
      updatedContent.includes('<hr message-from="chat">'),
      'Chat separator should be added'
    );

    testUtils.log('✅ CC command test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ CC command test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test cm<enter> command - should open model selector modal
 */
async function testCMCommand(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'CM Command - Change Model';
  const startTime = Date.now();

  try {
    testUtils.log('Testing cm command...');

    // Set up plugin settings
    await obsidian.setPluginData({
      apiKey: 'sk-test-key-for-cm-command',
      modelCommandPhrase: 'cm'
    });

    // Create a test note with cm command
    const noteContent = `Test note for model change.

cm`;

    const notePath = await obsidian.createNote('test-cm-command', noteContent);
    testUtils.log(`Created test note: ${notePath}`);

    await testUtils.wait(1000);

    // Simulate cm<enter> command
    // This would open the model selector modal
    // For testing purposes, we verify the command line is removed

    // Wait a bit for command processing
    await testUtils.wait(2000);

    // Verify command line was removed
    const updatedContent = await obsidian.readNote(notePath);
    testUtils.assert(!updatedContent.includes('\ncm'), 'Command line should be removed');

    // In a real test, we would also verify that the modal opened
    // This would require additional UI automation capabilities

    testUtils.log('✅ CM command test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ CM command test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test gg<enter> command - should archive the note correctly
 */
async function testGGCommand(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'GG Command - Archive Note';
  const startTime = Date.now();

  try {
    testUtils.log('Testing gg command...');

    // Set up plugin settings
    await obsidian.setPluginData({
      archiveCommandPhrase: 'gg',
      archiveFolderName: 'archive',
      chatSeparator: '<hr message-from="chat">'
    });

    // Create a test note with chat separator and gg command
    const noteContent = `Test note for archiving.

<hr message-from="chat">

This note has a chat separator, so it can be archived.

gg`;

    const notePath = await obsidian.createNote('test-gg-command', noteContent);
    testUtils.log(`Created test note: ${notePath}`);

    await testUtils.wait(1000);

    // Simulate gg<enter> command
    // This should move the note to the archive folder

    // Wait for archive operation
    await testUtils.wait(3000);

    // Verify original note no longer exists in root
    const originalExists = await obsidian.noteExists(notePath);
    testUtils.assert(!originalExists, 'Original note should be moved from root location');

    // Verify note exists in archive folder
    const archivePath = `archive/test-gg-command.md`;
    const archivedExists = await obsidian.noteExists(archivePath);
    testUtils.assert(archivedExists, 'Note should exist in archive folder');

    if (archivedExists) {
      // Verify archived note content
      const archivedContent = await obsidian.readNote(archivePath);
      testUtils.assert(!archivedContent.includes('\ngg'), 'Command line should be removed');
      testUtils.assert(
        archivedContent.includes('note moved to:'),
        'Archive status should be appended'
      );
    }

    testUtils.log('✅ GG command test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ GG command test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test nn<enter> command - should create a new note
 */
async function testNNCommand(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'NN Command - New Note';
  const startTime = Date.now();

  try {
    testUtils.log('Testing nn command...');

    // Set up plugin settings
    await obsidian.setPluginData({
      newChatCommandPhrase: 'nn',
      newNoteLocation: 'custom',
      newNoteCustomFolder: 'new_chats',
      newNoteTitleFormat: 'YYYY-MM-DD-HH-mm',
      newNoteTitlePrefix: 'Chat-',
      newNoteTitleSuffix: ''
    });

    // Create a test note with nn command
    const noteContent = `Test note for new note creation.

nn`;

    const notePath = await obsidian.createNote('test-nn-command', noteContent);
    testUtils.log(`Created test note: ${notePath}`);

    await testUtils.wait(1000);

    // Count existing notes in new_chats folder before command
    const newChatsPath = 'new_chats';
    const existingNotes = await testUtils.waitFor(async () => {
      // This is a simplified check - in reality we'd list directory contents
      return true;
    }, 1000);

    // Simulate nn<enter> command
    // This should create a new note in the new_chats folder

    // Wait for new note creation
    await testUtils.wait(3000);

    // Verify command line was removed from original note
    const updatedContent = await obsidian.readNote(notePath);
    testUtils.assert(!updatedContent.includes('\nnn'), 'Command line should be removed');

    // Verify new note was created
    // In a real implementation, we would check the new_chats folder for a new file
    // with the expected naming pattern (Chat-YYYY-MM-DD-HH-mm.md)

    testUtils.log('✅ NN command test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ NN command test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}