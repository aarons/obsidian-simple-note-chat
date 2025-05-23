import * as path from 'path';
import * as fs from 'fs-extra';
import { MockApiServer } from './mock-api-server';
import { ObsidianLauncher } from './obsidian-launcher';
import { TestUtilities, TestConfig, TestResult } from './test-utilities';

// Import test suites
import { runCommandTests } from '../integration/command-tests';
import { runEncryptionTests } from '../integration/encryption-tests';
import { runSettingsTests } from '../integration/settings-tests';
import { runFileOperationTests } from '../integration/file-operations-tests';

export interface TestRunnerConfig {
  testVaultPath: string;
  obsidianPath: string;
  mockApiPort: number;
  testTimeout: number;
  headless: boolean;
  suites?: string[];
}

export interface TestSuite {
  name: string;
  description: string;
  tests: Array<() => Promise<TestResult>>;
}

export class TestRunner {
  private config: TestRunnerConfig;
  private mockApi: MockApiServer;
  private obsidian: ObsidianLauncher;
  private testUtils: TestUtilities;
  private results: TestResult[] = [];

  constructor(config: TestRunnerConfig) {
    this.config = config;

    // Initialize components
    this.mockApi = new MockApiServer({
      port: config.mockApiPort,
      logRequests: true
    });

    this.obsidian = new ObsidianLauncher({
      obsidianPath: config.obsidianPath,
      vaultPath: config.testVaultPath,
      pluginPath: path.resolve(__dirname, '../../'),
      timeout: config.testTimeout,
      headless: config.headless
    });

    this.testUtils = new TestUtilities({
      testVaultPath: config.testVaultPath,
      obsidianPath: config.obsidianPath,
      mockApiPort: config.mockApiPort,
      testTimeout: config.testTimeout
    });
  }

  /**
   * Runs all test suites or specified suites
   */
  async run(): Promise<void> {
    console.log('🚀 Starting Obsidian Simple Chat Plugin Test Suite');
    console.log('================================================');

    try {
      // Setup phase
      await this.setup();

      // Get test suites to run
      const suitesToRun = this.getSuitesToRun();

      // Run each test suite
      for (const suite of suitesToRun) {
        await this.runTestSuite(suite);
      }

      // Generate report
      this.generateReport();

    } catch (error) {
      console.error('❌ Test runner failed:', error);
      process.exit(1);
    } finally {
      // Cleanup phase
      await this.cleanup();
    }
  }

  /**
   * Sets up the test environment
   */
  private async setup(): Promise<void> {
    console.log('🔧 Setting up test environment...');

    try {
      // Setup test vault
      await this.testUtils.setupTestVault();

      // Start mock API server
      await this.mockApi.start();
      console.log(`✅ Mock API server started on port ${this.config.mockApiPort}`);

      // Launch Obsidian
      await this.obsidian.launch();
      console.log('✅ Obsidian launched successfully');

      // Wait for plugin to load
      await this.waitForPluginLoad();
      console.log('✅ Plugin loaded successfully');

    } catch (error) {
      console.error('❌ Setup failed:', error);
      throw error;
    }
  }

  /**
   * Waits for the plugin to load in Obsidian
   */
  private async waitForPluginLoad(): Promise<void> {
    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 500; // 500ms
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const pluginData = await this.obsidian.getPluginData();
        if (pluginData || Object.keys(pluginData).length > 0) {
          return; // Plugin has loaded and created data
        }
      } catch (error) {
        // Plugin data file might not exist yet
      }

      await this.testUtils.wait(checkInterval);
    }

    // Even if no data file exists, the plugin might be loaded
    console.log('⚠️  Plugin data file not found, but continuing with tests');
  }

  /**
   * Gets the list of test suites to run
   */
  private getSuitesToRun(): TestSuite[] {
    const allSuites: TestSuite[] = [
      {
        name: 'commands',
        description: 'Command Integration Tests (cc, cm, gg, nn)',
        tests: []
      },
      {
        name: 'encryption',
        description: 'API Key Encryption Tests',
        tests: []
      },
      {
        name: 'settings',
        description: 'Settings Tab Tests',
        tests: []
      },
      {
        name: 'file-operations',
        description: 'File Operations Tests',
        tests: []
      }
    ];

    // Filter suites if specific ones are requested
    if (this.config.suites && this.config.suites.length > 0) {
      return allSuites.filter(suite => this.config.suites!.includes(suite.name));
    }

    return allSuites;
  }

  /**
   * Runs a specific test suite
   */
  private async runTestSuite(suite: TestSuite): Promise<void> {
    console.log(`\n📋 Running ${suite.description}`);
    console.log('─'.repeat(50));

    const suiteStartTime = Date.now();
    let suiteResults: TestResult[] = [];

    try {
      // Run the appropriate test suite
      switch (suite.name) {
        case 'commands':
          suiteResults = await runCommandTests(this.obsidian, this.mockApi, this.testUtils);
          break;
        case 'encryption':
          suiteResults = await runEncryptionTests(this.obsidian, this.mockApi, this.testUtils);
          break;
        case 'settings':
          suiteResults = await runSettingsTests(this.obsidian, this.mockApi, this.testUtils);
          break;
        case 'file-operations':
          suiteResults = await runFileOperationTests(this.obsidian, this.mockApi, this.testUtils);
          break;
        default:
          console.log(`⚠️  Unknown test suite: ${suite.name}`);
          return;
      }

      // Add results to overall results
      this.results.push(...suiteResults);

      // Print suite summary
      const passed = suiteResults.filter(r => r.passed).length;
      const failed = suiteResults.filter(r => !r.passed).length;
      const duration = Date.now() - suiteStartTime;

      console.log(`\n📊 Suite Summary: ${passed} passed, ${failed} failed (${duration}ms)`);

    } catch (error) {
      console.error(`❌ Test suite '${suite.name}' failed:`, error);

      // Add a failed result for the entire suite
      this.results.push({
        name: `${suite.name} (suite failure)`,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - suiteStartTime
      });
    }
  }

  /**
   * Generates and displays the final test report
   */
  private generateReport(): void {
    console.log('\n📈 Final Test Report');
    console.log('===================');

    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} ✅`);
    console.log(`Failed: ${failedTests} ❌`);
    console.log(`Total Duration: ${totalDuration}ms`);

    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`  • ${result.name}: ${result.error}`);
        });
    }

    // Save detailed report to file
    this.saveReportToFile();

    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);
  }

  /**
   * Saves the detailed test report to a file
   */
  private saveReportToFile(): void {
    const reportPath = path.join(__dirname, '../test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      results: this.results,
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        duration: this.results.reduce((sum, r) => sum + r.duration, 0)
      }
    };

    fs.writeJsonSync(reportPath, report, { spaces: 2 });
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
  }

  /**
   * Cleans up the test environment
   */
  private async cleanup(): Promise<void> {
    console.log('\n🧹 Cleaning up test environment...');

    try {
      // Shutdown Obsidian
      if (this.obsidian.isRunning()) {
        await this.obsidian.shutdown();
        console.log('✅ Obsidian shut down');
      }

      // Stop mock API server
      await this.mockApi.stop();
      console.log('✅ Mock API server stopped');

      // Clean up test vault
      await this.testUtils.cleanup();
      console.log('✅ Test vault cleaned up');

    } catch (error) {
      console.error('⚠️  Cleanup warning:', error);
    }
  }
}

/**
 * Main entry point for the test runner
 */
async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const suiteArg = args.find(arg => arg.startsWith('--suite='));
  const headlessArg = args.includes('--headless');
  const timeoutArg = args.find(arg => arg.startsWith('--timeout='));

  // Parse suites
  let suites: string[] | undefined;
  if (suiteArg) {
    const suiteValue = suiteArg.split('=')[1];
    suites = suiteValue.split(',').map(s => s.trim());
  }

  // Parse timeout
  let timeout = 30000; // 30 seconds default
  if (timeoutArg) {
    timeout = parseInt(timeoutArg.split('=')[1]) || timeout;
  }

  // Create test configuration
  const config: TestRunnerConfig = {
    testVaultPath: path.join(__dirname, '../../test-vault'),
    obsidianPath: ObsidianLauncher.getObsidianPath(),
    mockApiPort: 3001,
    testTimeout: timeout,
    headless: headlessArg,
    suites
  };

  // Create and run test runner
  const runner = new TestRunner(config);
  await runner.run();
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner crashed:', error);
    process.exit(1);
  });
}

export default TestRunner;