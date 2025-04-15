#!/bin/bash

# Ensure dependencies are installed (including fs-extra)
echo "Making sure dependencies are installed..."
npm install
if [ $? -ne 0 ]; then
  echo "npm install failed. Please check for errors."
  exit 1
fi

# Create test-vault directory if it doesn't exist
if [ ! -d "test-vault" ]; then
  echo "Creating test-vault directory..."
  mkdir -p test-vault
fi

# Create welcome.md file in test-vault if it doesn't exist
if [ ! -f "test-vault/welcome.md" ]; then
  echo "Creating welcome.md file in test-vault..."
  if [ -f "welcome.md.template" ]; then
    cp welcome.md.template test-vault/welcome.md
    echo "Created welcome.md from template."
  else
    # Create a basic welcome file if template doesn't exist
    echo "# Welcome to Simple Note Chat" > test-vault/welcome.md
    echo "" >> test-vault/welcome.md
    echo "This is a sample note to help you test the plugin." >> test-vault/welcome.md
    echo "Created welcome.md with default content."
  fi
fi

# Run the development build/watch process defined in esbuild.config.mjs
# This will build, copy to the test vault, and watch for changes.
echo "Starting development build and watch process..."
npm run dev

# The 'npm run dev' command will keep running in watch mode.
# Press Ctrl+C to stop the process.
