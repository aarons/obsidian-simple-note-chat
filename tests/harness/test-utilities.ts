import * as fs from 'fs-extra';
import * as path from 'path';
import { expect } from 'chai';

export interface TestConfig {
  testVaultPath: string;
  obsidianPath: string;
  mockApiPort: number;
  testTimeout: number;
}

export interface TestNote {
  name: string;
  content: string;
  path?: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export class TestUtilities {
  private config: TestConfig;

  constructor(config: TestConfig) {
    this.config = config;
  }

  /**
   * Creates a clean test vault from the template
   */
  async setupTestVault(): Promise<void> {
    const templatePath = path.join(__dirname, '../test-vault-template');
    const testVaultPath = this.config.testVaultPath;

    // Remove existing test vault if it exists
    if (await fs.pathExists(testVaultPath)) {
      await fs.remove(testVaultPath);
    }

    // Copy template to test vault location
    if (await fs.pathExists(templatePath)) {
      await fs.copy(templatePath, testVaultPath);
    } else {
      // Create minimal vault structure if template doesn't exist
      await fs.ensureDir(testVaultPath);
      await fs.ensureDir(path.join(testVaultPath, '.obsidian'));
      await fs.ensureDir(path.join(testVaultPath, 'archive'));
      await fs.ensureDir(path.join(testVaultPath, 'new_chats'));

      // Create basic vault config
      const vaultConfig = {
        "plugins": {
          "simple-note-chat": true
        }
      };
      await fs.writeJson(path.join(testVaultPath, '.obsidian', 'community-plugins.json'), ["simple-note-chat"]);
      await fs.writeJson(path.join(testVaultPath, '.obsidian', 'app.json'), vaultConfig);
    }

    console.log(`Test vault setup complete at: ${testVaultPath}`);
  }

  /**
   * Creates a test note in the vault
   */
  async createTestNote(note: TestNote): Promise<string> {
    const notePath = note.path || `${note.name}.md`;
    const fullPath = path.join(this.config.testVaultPath, notePath);

    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, note.content);

    console.log(`Created test note: ${notePath}`);
    return fullPath;
  }

  /**
   * Reads the content of a note from the vault
   */
  async readTestNote(notePath: string): Promise<string> {
    const fullPath = path.join(this.config.testVaultPath, notePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Checks if a note exists in the vault
   */
  async noteExists(notePath: string): Promise<boolean> {
    const fullPath = path.join(this.config.testVaultPath, notePath);
    return await fs.pathExists(fullPath);
  }

  /**
   * Reads the plugin's data.json file
   */
  async readPluginData(): Promise<any> {
    const dataPath = path.join(this.config.testVaultPath, '.obsidian', 'plugins', 'simple-note-chat', 'data.json');
    if (await fs.pathExists(dataPath)) {
      return await fs.readJson(dataPath);
    }
    return {};
  }

  /**
   * Writes to the plugin's data.json file
   */
  async writePluginData(data: any): Promise<void> {
    const dataPath = path.join(this.config.testVaultPath, '.obsidian', 'plugins', 'simple-note-chat', 'data.json');
    await fs.ensureDir(path.dirname(dataPath));
    await fs.writeJson(dataPath, data);
  }

  /**
   * Cleans up test vault and temporary files
   */
  async cleanup(): Promise<void> {
    if (await fs.pathExists(this.config.testVaultPath)) {
      await fs.remove(this.config.testVaultPath);
      console.log('Test vault cleaned up');
    }
  }

  /**
   * Waits for a specified amount of time
   */
  async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Waits for a condition to be true with timeout
   */
  async waitFor(condition: () => Promise<boolean>, timeoutMs: number = 5000, intervalMs: number = 100): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      if (await condition()) {
        return true;
      }
      await this.wait(intervalMs);
    }

    return false;
  }

  /**
   * Asserts that a condition is true with a custom message
   */
  assert(condition: boolean, message: string): void {
    expect(condition, message).to.be.true;
  }

  /**
   * Asserts that two values are equal
   */
  assertEqual<T>(actual: T, expected: T, message?: string): void {
    expect(actual, message).to.equal(expected);
  }

  /**
   * Asserts that a string contains a substring
   */
  assertContains(text: string, substring: string, message?: string): void {
    expect(text, message).to.include(substring);
  }

  /**
   * Asserts that a file exists
   */
  async assertFileExists(filePath: string, message?: string): Promise<void> {
    const exists = await this.noteExists(filePath);
    expect(exists, message || `File should exist: ${filePath}`).to.be.true;
  }

  /**
   * Asserts that a file does not exist
   */
  async assertFileNotExists(filePath: string, message?: string): Promise<void> {
    const exists = await this.noteExists(filePath);
    expect(exists, message || `File should not exist: ${filePath}`).to.be.false;
  }

  /**
   * Gets the current timestamp for test logging
   */
  getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Logs a test message with timestamp
   */
  log(message: string): void {
    console.log(`[${this.getTimestamp()}] ${message}`);
  }

  /**
   * Logs an error message with timestamp
   */
  logError(message: string, error?: any): void {
    console.error(`[${this.getTimestamp()}] ERROR: ${message}`);
    if (error) {
      console.error(error);
    }
  }
}

export default TestUtilities;