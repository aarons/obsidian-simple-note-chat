# Obsidian Simple Chat Plugin - Test Suite

This directory contains a comprehensive test suite for the Obsidian Simple Chat plugin that focuses on end-to-end testing with real Obsidian behavior.

## Overview

The test suite validates:
- **Command functionality**: cc, cm, gg, nn commands
- **API key encryption**: Base64 encoding/decoding of API keys
- **Settings persistence**: Configuration saving and loading
- **File operations**: Note archiving, creation, and management

## Architecture

```
tests/
├── harness/                    # Test infrastructure
│   ├── test-runner.ts         # Main test orchestrator
│   ├── obsidian-launcher.ts   # Obsidian instance management
│   ├── mock-api-server.ts     # OpenRouter API mock
│   └── test-utilities.ts      # Helper functions
├── integration/               # Test suites
│   ├── command-tests.ts       # cc, cm, gg, nn tests
│   ├── encryption-tests.ts    # API key encryption tests
│   ├── settings-tests.ts      # Settings tab tests
│   └── file-operations-tests.ts # Archive/create tests
├── test-vault-template/       # Clean vault template
└── fixtures/                  # Test data (future)
```

## Prerequisites

1. **Obsidian installed** on your system
2. **Node.js** (version 16 or higher)
3. **Plugin built** (run `npm run build` in the root directory)

## Setup

1. Install test dependencies:
```bash
cd tests
npm install
```

2. Build the plugin (from root directory):
```bash
npm run build
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Command tests only
npm run test:commands

# Encryption tests only
npm run test:encryption

# Multiple suites
npm test -- --suite=commands,encryption
```

### Run in Headless Mode
```bash
npm test -- --headless
```

### Run with Custom Timeout
```bash
npm test -- --timeout=60000
```

## Test Suites

### Command Tests (`command-tests.ts`)
Tests the core command functionality:

- **CC Command**: Verifies `cc<enter>` triggers API call with correct data
- **CM Command**: Verifies `cm<enter>` opens model selector modal
- **GG Command**: Verifies `gg<enter>` archives notes correctly
- **NN Command**: Verifies `nn<enter>` creates new notes

### Encryption Tests (`encryption-tests.ts`)
Tests API key security:

- **Encryption on Save**: API keys are base64 encoded in data.json
- **Decryption on Load**: Encrypted keys are properly decrypted
- **API Call Security**: API calls use decrypted keys, never encrypted
- **Backward Compatibility**: Plain text keys are upgraded to encrypted

### Settings Tests (`settings-tests.ts`)
Tests configuration management:

- **Settings Persistence**: All settings save and load correctly
- **Default Values**: Proper defaults are applied
- **Command Customization**: Custom command phrases work
- **Model Selection**: Model choices persist and are used

### File Operations Tests (`file-operations-tests.ts`)
Tests file system operations:

- **Note Archiving**: Notes move to archive folder with status
- **New Note Creation**: Notes created with proper naming
- **Folder Creation**: Archive folders created automatically
- **Location Settings**: Custom locations work correctly

## Mock API Server

The test suite includes a mock OpenRouter API server that:

- Simulates streaming and non-streaming responses
- Validates API key authentication
- Logs all requests for verification
- Supports custom responses for specific test scenarios

### Manual API Testing
```bash
# Start mock server standalone
npm run mock-api

# Server runs on http://localhost:3001
# Available endpoints:
#   GET  /v1/models
#   POST /v1/chat/completions
#   POST /v1/test/set-response
#   GET  /v1/test/requests
```

## Test Configuration

Tests can be configured via command line arguments:

- `--suite=<suites>`: Run specific test suites (comma-separated)
- `--headless`: Run Obsidian in headless mode
- `--timeout=<ms>`: Set test timeout in milliseconds

## Test Reports

After running tests, detailed reports are saved to:
- `test-report.json`: Complete test results with timing and errors
- Console output: Real-time test progress and summary

## Troubleshooting

### Common Issues

1. **Obsidian not found**
   - Ensure Obsidian is installed in the default location
   - Or set custom path in test configuration

2. **Plugin not loading**
   - Build the plugin first: `npm run build`
   - Check that `main.js` exists in the root directory

3. **Tests timing out**
   - Increase timeout: `npm test -- --timeout=60000`
   - Check if Obsidian is starting properly

4. **Port conflicts**
   - Mock API server uses port 3001 by default
   - Ensure port is available or modify configuration

### Debug Mode

For verbose logging, set environment variable:
```bash
DEBUG=true npm test
```

## Development

### Adding New Tests

1. Create test functions in appropriate integration file
2. Follow the pattern of existing tests
3. Use `TestUtilities` for common operations
4. Verify both success and failure cases

### Test Utilities

The `TestUtilities` class provides:
- Vault setup and cleanup
- Note creation and reading
- Plugin data management
- Assertion helpers
- Timing utilities

### Mock API Customization

Customize mock responses:
```typescript
mockApi.setMockResponse('test-key', 'Custom response');
```

Check API calls:
```typescript
const requests = mockApi.getRequestsWithApiKey('your-api-key');
```

## Contributing

When adding new features to the plugin:

1. Add corresponding tests to validate the functionality
2. Update test documentation if needed
3. Ensure all tests pass before submitting changes
4. Consider edge cases and error conditions

## License

This test suite is part of the Obsidian Simple Chat plugin and follows the same license terms.