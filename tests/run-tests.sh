#!/bin/bash

# Obsidian Simple Chat Plugin - Test Runner Script
# This script helps set up and run the test suite

set -e

echo "🧪 Obsidian Simple Chat Plugin Test Suite"
echo "========================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16 or higher."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

# Check if we're in the tests directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the tests directory."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing test dependencies..."
    npm install
fi

# Check if the main plugin is built
if [ ! -f "../main.js" ]; then
    echo "🔨 Building plugin..."
    cd ..
    npm run build
    cd tests
fi

# Parse command line arguments
SUITE=""
HEADLESS=""
TIMEOUT=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --suite=*)
            SUITE="${1#*=}"
            shift
            ;;
        --headless)
            HEADLESS="--headless"
            shift
            ;;
        --timeout=*)
            TIMEOUT="${1#*=}"
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --suite=<suites>     Run specific test suites (comma-separated)"
            echo "                       Available: commands, encryption, settings, file-operations"
            echo "  --headless          Run Obsidian in headless mode"
            echo "  --timeout=<ms>      Set test timeout in milliseconds"
            echo "  --help              Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                    # Run all tests"
            echo "  $0 --suite=commands                  # Run command tests only"
            echo "  $0 --suite=commands,encryption       # Run specific suites"
            echo "  $0 --headless                        # Run in headless mode"
            echo "  $0 --timeout=60000                   # Set 60 second timeout"
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $1"
            echo "Use --help for usage information."
            exit 1
            ;;
    esac
done

# Build the test command
TEST_CMD="npm test"

if [ -n "$SUITE" ] || [ -n "$HEADLESS" ] || [ -n "$TIMEOUT" ]; then
    TEST_CMD="$TEST_CMD --"

    if [ -n "$SUITE" ]; then
        TEST_CMD="$TEST_CMD --suite=$SUITE"
    fi

    if [ -n "$HEADLESS" ]; then
        TEST_CMD="$TEST_CMD $HEADLESS"
    fi

    if [ -n "$TIMEOUT" ]; then
        TEST_CMD="$TEST_CMD --timeout=$TIMEOUT"
    fi
fi

echo "🚀 Running tests..."
echo "Command: $TEST_CMD"
echo ""

# Run the tests
eval $TEST_CMD

echo ""
echo "✅ Test run completed!"