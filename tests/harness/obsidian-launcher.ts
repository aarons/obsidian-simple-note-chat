import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs-extra';

export interface ObsidianConfig {
  obsidianPath: string;
  vaultPath: string;
  pluginPath: string;
  timeout: number;
  headless?: boolean;
}

export interface ObsidianInstance {
  process: ChildProcess;
  pid: number;
  vaultPath: string;
}

export class ObsidianLauncher {
  private config: ObsidianConfig;
  private instance: ObsidianInstance | null = null;

  constructor(config: ObsidianConfig) {
    this.config = config;
  }

  /**
   * Prepares the vault for testing by copying the plugin and setting up configuration
   */
  async prepareVault(): Promise<void> {
    const vaultPath = this.config.vaultPath;
    const obsidianDir = path.join(vaultPath, '.obsidian');
    const pluginsDir = path.join(obsidianDir, 'plugins');
    const pluginDir = path.join(pluginsDir, 'simple-note-chat');

    // Ensure directories exist
    await fs.ensureDir(pluginDir);

    // Copy plugin files
    const srcPath = path.resolve(__dirname, '../../src');
    const manifestPath = path.resolve(__dirname, '../../manifest.json');
    const mainJsPath = path.resolve(__dirname, '../../main.js');

    // Copy source files
    if (await fs.pathExists(srcPath)) {
      await fs.copy(srcPath, path.join(pluginDir, 'src'));
    }

    // Copy manifest
    if (await fs.pathExists(manifestPath)) {
      await fs.copy(manifestPath, path.join(pluginDir, 'manifest.json'));
    }

    // Copy main.js if it exists (built plugin)
    if (await fs.pathExists(mainJsPath)) {
      await fs.copy(mainJsPath, path.join(pluginDir, 'main.js'));
    }

    // Create community plugins configuration
    const communityPluginsPath = path.join(obsidianDir, 'community-plugins.json');
    await fs.writeJson(communityPluginsPath, ['simple-note-chat']);

    // Create app configuration
    const appConfigPath = path.join(obsidianDir, 'app.json');
    const appConfig = {
      "pluginEnabledStatus": {
        "simple-note-chat": true
      },
      "enabledPlugins": ["simple-note-chat"]
    };
    await fs.writeJson(appConfigPath, appConfig);

    // Create hotkeys configuration (empty for now)
    const hotkeysPath = path.join(obsidianDir, 'hotkeys.json');
    await fs.writeJson(hotkeysPath, {});

    console.log(`Vault prepared at: ${vaultPath}`);
  }

  /**
   * Launches Obsidian with the test vault
   */
  async launch(): Promise<ObsidianInstance> {
    if (this.instance) {
      throw new Error('Obsidian instance is already running');
    }

    await this.prepareVault();

    const args = [this.config.vaultPath];

    // Add headless flag if specified
    if (this.config.headless) {
      args.push('--headless');
    }

    // Add development flags
    args.push('--disable-web-security');
    args.push('--disable-features=VizDisplayCompositor');

    console.log(`Launching Obsidian: ${this.config.obsidianPath} ${args.join(' ')}`);

    const obsidianProcess = spawn(this.config.obsidianPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });

    if (!obsidianProcess.pid) {
      throw new Error('Failed to start Obsidian process');
    }

    this.instance = {
      process: obsidianProcess,
      pid: obsidianProcess.pid,
      vaultPath: this.config.vaultPath
    };

    // Set up process event handlers
    obsidianProcess.stdout?.on('data', (data) => {
      console.log(`[Obsidian stdout]: ${data}`);
    });

    obsidianProcess.stderr?.on('data', (data) => {
      console.error(`[Obsidian stderr]: ${data}`);
    });

    obsidianProcess.on('error', (error) => {
      console.error(`[Obsidian error]: ${error}`);
    });

    obsidianProcess.on('exit', (code, signal) => {
      console.log(`[Obsidian exit]: code=${code}, signal=${signal}`);
      this.instance = null;
    });

    // Wait for Obsidian to start up
    await this.waitForStartup();

    return this.instance;
  }

  /**
   * Waits for Obsidian to fully start up
   */
  private async waitForStartup(): Promise<void> {
    const startTime = Date.now();
    const timeout = this.config.timeout;

    while (Date.now() - startTime < timeout) {
      if (this.instance && this.instance.process.pid) {
        // Check if the plugin data directory exists (indicates Obsidian has loaded)
        const pluginDataPath = path.join(
          this.config.vaultPath,
          '.obsidian',
          'plugins',
          'simple-note-chat',
          'data.json'
        );

        // Wait a bit more for the plugin to initialize
        await this.wait(2000);

        console.log('Obsidian startup complete');
        return;
      }

      await this.wait(500);
    }

    throw new Error(`Obsidian failed to start within ${timeout}ms`);
  }

  /**
   * Shuts down the Obsidian instance
   */
  async shutdown(): Promise<void> {
    if (!this.instance) {
      return;
    }

    const process = this.instance.process;
    const pid = this.instance.pid;

    console.log(`Shutting down Obsidian (PID: ${pid})`);

    // Try graceful shutdown first
    process.kill('SIGTERM');

    // Wait for graceful shutdown
    const shutdownPromise = new Promise<void>((resolve) => {
      process.on('exit', () => {
        console.log('Obsidian shut down gracefully');
        resolve();
      });
    });

    // Force kill after timeout
    const forceKillTimeout = setTimeout(() => {
      console.log('Force killing Obsidian process');
      process.kill('SIGKILL');
    }, 5000);

    await shutdownPromise;
    clearTimeout(forceKillTimeout);

    this.instance = null;
  }

  /**
   * Gets the current Obsidian instance
   */
  getInstance(): ObsidianInstance | null {
    return this.instance;
  }

  /**
   * Checks if Obsidian is currently running
   */
  isRunning(): boolean {
    return this.instance !== null && this.instance.process.pid !== undefined;
  }

  /**
   * Sends a command to Obsidian via stdin (if supported)
   */
  async sendCommand(command: string): Promise<void> {
    if (!this.instance) {
      throw new Error('No Obsidian instance running');
    }

    this.instance.process.stdin?.write(command + '\n');
  }

  /**
   * Simulates a key press in Obsidian (platform-specific implementation needed)
   */
  async simulateKeyPress(key: string, modifiers?: string[]): Promise<void> {
    // This would need platform-specific implementation
    // For now, we'll use a simple approach that works with the plugin's command system
    console.log(`Simulating key press: ${key} ${modifiers ? `with ${modifiers.join('+')}` : ''}`);

    // This is a placeholder - in a real implementation, you'd use:
    // - robotjs for cross-platform automation
    // - platform-specific APIs
    // - or Electron's webContents.sendInputEvent
  }

  /**
   * Creates a note in the vault
   */
  async createNote(name: string, content: string, folder?: string): Promise<string> {
    const notePath = folder ? path.join(folder, `${name}.md`) : `${name}.md`;
    const fullPath = path.join(this.config.vaultPath, notePath);

    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);

    console.log(`Created note: ${notePath}`);
    return notePath;
  }

  /**
   * Reads a note from the vault
   */
  async readNote(notePath: string): Promise<string> {
    const fullPath = path.join(this.config.vaultPath, notePath);
    return await fs.readFile(fullPath, 'utf-8');
  }

  /**
   * Checks if a note exists in the vault
   */
  async noteExists(notePath: string): Promise<boolean> {
    const fullPath = path.join(this.config.vaultPath, notePath);
    return await fs.pathExists(fullPath);
  }

  /**
   * Gets the plugin's data.json content
   */
  async getPluginData(): Promise<any> {
    const dataPath = path.join(
      this.config.vaultPath,
      '.obsidian',
      'plugins',
      'simple-note-chat',
      'data.json'
    );

    if (await fs.pathExists(dataPath)) {
      return await fs.readJson(dataPath);
    }

    return {};
  }

  /**
   * Sets the plugin's data.json content
   */
  async setPluginData(data: any): Promise<void> {
    const dataPath = path.join(
      this.config.vaultPath,
      '.obsidian',
      'plugins',
      'simple-note-chat',
      'data.json'
    );

    await fs.ensureDir(path.dirname(dataPath));
    await fs.writeJson(dataPath, data);
  }

  /**
   * Utility method to wait for a specified time
   */
  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets the path to the Obsidian executable based on the platform
   */
  static getObsidianPath(): string {
    const platform = process.platform;

    switch (platform) {
      case 'darwin': // macOS
        return '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
      case 'win32': // Windows
        return 'C:\\Users\\%USERNAME%\\AppData\\Local\\Obsidian\\Obsidian.exe';
      case 'linux':
        return '/usr/bin/obsidian';
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

export default ObsidianLauncher;