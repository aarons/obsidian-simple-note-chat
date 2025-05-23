import { ObsidianLauncher } from '../harness/obsidian-launcher';
import { MockApiServer } from '../harness/mock-api-server';
import { TestUtilities, TestResult } from '../harness/test-utilities';

/**
 * Tests for API key encryption and obfuscation functionality
 */
export async function runEncryptionTests(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test API key encryption when saving settings
  results.push(await testApiKeyEncryption(obsidian, mockApi, testUtils));

  // Test API key decryption when loading settings
  results.push(await testApiKeyDecryption(obsidian, mockApi, testUtils));

  // Test API calls use decrypted key
  results.push(await testApiCallsUseDecryptedKey(obsidian, mockApi, testUtils));

  // Test backward compatibility with unencrypted keys
  results.push(await testBackwardCompatibility(obsidian, mockApi, testUtils));

  return results;
}

/**
 * Test that API keys are base64 encoded when saved to data.json
 */
async function testApiKeyEncryption(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'API Key Encryption - Settings Save';
  const startTime = Date.now();

  try {
    testUtils.log('Testing API key encryption on save...');

    const testApiKey = 'sk-test-encryption-key-12345';
    const expectedPrefix = 'snc_encrypted:';

    // Set the API key in plugin settings (simulating user input)
    await obsidian.setPluginData({
      apiKey: testApiKey,
      defaultModel: 'openai/gpt-3.5-turbo'
    });

    // Wait for settings to be processed
    await testUtils.wait(1000);

    // Read the raw data.json file to verify encryption
    const savedData = await obsidian.getPluginData();

    testUtils.assert(!!savedData.apiKey, 'API key should be saved');
    testUtils.assert(
      savedData.apiKey.startsWith(expectedPrefix),
      `API key should be encrypted with prefix: ${expectedPrefix}`
    );
    testUtils.assert(
      savedData.apiKey !== testApiKey,
      'Saved API key should not be in plain text'
    );

    // Verify the encrypted key is base64 encoded
    const encryptedPart = savedData.apiKey.substring(expectedPrefix.length);
    try {
      const decoded = Buffer.from(encryptedPart, 'base64').toString();
      testUtils.assertEqual(decoded, testApiKey, 'Decrypted key should match original');
    } catch (error) {
      throw new Error('Encrypted API key is not valid base64');
    }

    testUtils.log('✅ API key encryption test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ API key encryption test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test that encrypted API keys are properly decrypted when loaded
 */
async function testApiKeyDecryption(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'API Key Decryption - Settings Load';
  const startTime = Date.now();

  try {
    testUtils.log('Testing API key decryption on load...');

    const originalKey = 'sk-test-decryption-key-67890';
    const encryptedKey = 'snc_encrypted:' + Buffer.from(originalKey).toString('base64');

    // Manually set encrypted key in data.json
    await obsidian.setPluginData({
      apiKey: encryptedKey,
      defaultModel: 'openai/gpt-3.5-turbo'
    });

    // Wait for plugin to reload settings
    await testUtils.wait(2000);

    // The plugin should have decrypted the key in memory
    // We can verify this by checking if API calls work with the original key
    mockApi.clearRequestLog();

    // Trigger an API call (simulate cc command)
    const noteContent = `Test note for decryption.

encryption-test

cc`;

    await obsidian.createNote('test-decryption', noteContent);
    await testUtils.wait(1000);

    // Wait for API call
    await testUtils.waitFor(async () => {
      const requests = mockApi.getRequestLog();
      return requests.some(req => req.url.includes('/chat/completions'));
    }, 5000);

    // Verify API call was made with the original (decrypted) key
    const apiRequests = mockApi.getRequestsWithApiKey(originalKey);
    testUtils.assert(apiRequests.length > 0, 'API call should use decrypted key');

    // Verify no API calls were made with the encrypted key
    const encryptedKeyRequests = mockApi.getRequestsWithApiKey(encryptedKey);
    testUtils.assert(encryptedKeyRequests.length === 0, 'API call should not use encrypted key');

    testUtils.log('✅ API key decryption test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ API key decryption test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test that API calls always use the decrypted key, never the encrypted version
 */
async function testApiCallsUseDecryptedKey(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'API Calls Use Decrypted Key';
  const startTime = Date.now();

  try {
    testUtils.log('Testing API calls use decrypted key...');

    const originalKey = 'sk-test-api-calls-key-abcdef';

    // Set up plugin with API key (will be encrypted automatically)
    await obsidian.setPluginData({
      apiKey: originalKey,
      defaultModel: 'openai/gpt-3.5-turbo',
      chatCommandPhrase: 'cc'
    });

    await testUtils.wait(1000);

    // Verify the key is encrypted in storage
    const savedData = await obsidian.getPluginData();
    testUtils.assert(
      savedData.apiKey.startsWith('snc_encrypted:'),
      'API key should be encrypted in storage'
    );

    // Clear API request log
    mockApi.clearRequestLog();

    // Set up mock response for this test
    mockApi.setMockResponse('encryption-test', 'API key encryption test successful.');

    // Create note and trigger API call
    const noteContent = `Test note for API call encryption.

This is a test to verify the API gets called with the decrypted key.
encryption-test

cc`;

    await obsidian.createNote('test-api-encryption', noteContent);
    await testUtils.wait(1000);

    // Wait for API call to be made
    await testUtils.waitFor(async () => {
      const requests = mockApi.getRequestLog();
      return requests.some(req =>
        req.url.includes('/chat/completions') &&
        req.headers.authorization === `Bearer ${originalKey}`
      );
    }, 5000);

    // Verify API call was made with original key
    const correctKeyRequests = mockApi.getRequestsWithApiKey(originalKey);
    testUtils.assert(correctKeyRequests.length > 0, 'API should be called with original key');

    // Verify no calls were made with encrypted key
    const encryptedKey = savedData.apiKey;
    const encryptedKeyRequests = mockApi.getRequestsWithApiKey(encryptedKey);
    testUtils.assert(encryptedKeyRequests.length === 0, 'API should not be called with encrypted key');

    // Verify the request contains the expected content
    const chatRequest = correctKeyRequests.find(req => req.url.includes('/chat/completions'));
    if (chatRequest) {
      testUtils.assert(
        JSON.stringify(chatRequest.body).includes('encryption-test'),
        'Request should contain the test content'
      );
    }

    testUtils.log('✅ API calls use decrypted key test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ API calls use decrypted key test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}

/**
 * Test backward compatibility with unencrypted API keys
 */
async function testBackwardCompatibility(
  obsidian: ObsidianLauncher,
  mockApi: MockApiServer,
  testUtils: TestUtilities
): Promise<TestResult> {
  const testName = 'Backward Compatibility - Unencrypted Keys';
  const startTime = Date.now();

  try {
    testUtils.log('Testing backward compatibility with unencrypted keys...');

    const plainTextKey = 'sk-test-backward-compatibility-key';

    // Manually set a plain text key (simulating old data format)
    await obsidian.setPluginData({
      apiKey: plainTextKey,
      defaultModel: 'openai/gpt-3.5-turbo'
    });

    await testUtils.wait(1000);

    // Clear API request log
    mockApi.clearRequestLog();

    // Trigger an API call to verify the plain text key works
    const noteContent = `Test note for backward compatibility.

encryption-test

cc`;

    await obsidian.createNote('test-backward-compat', noteContent);
    await testUtils.wait(1000);

    // Wait for API call
    await testUtils.waitFor(async () => {
      const requests = mockApi.getRequestLog();
      return requests.some(req =>
        req.url.includes('/chat/completions') &&
        req.headers.authorization === `Bearer ${plainTextKey}`
      );
    }, 5000);

    // Verify API call was made with the plain text key
    const apiRequests = mockApi.getRequestsWithApiKey(plainTextKey);
    testUtils.assert(apiRequests.length > 0, 'Plain text API key should work');

    // After the plugin processes the settings, the key should be encrypted
    await testUtils.wait(2000);

    const updatedData = await obsidian.getPluginData();
    testUtils.assert(
      updatedData.apiKey.startsWith('snc_encrypted:'),
      'Plain text key should be encrypted after processing'
    );

    testUtils.log('✅ Backward compatibility test passed');
    return {
      name: testName,
      passed: true,
      duration: Date.now() - startTime
    };

  } catch (error) {
    testUtils.logError('❌ Backward compatibility test failed', error);
    return {
      name: testName,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime
    };
  }
}