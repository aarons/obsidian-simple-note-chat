#!/bin/bash

# Ensure dependencies are installed (including fs-extra)
echo "Making sure dependencies are installed..."
npm install
if [ $? -ne 0 ]; then
  echo "npm install failed. Please check for errors."
  exit 1
fi

# Determine target vault path
TARGET_VAULT_PATH="test-vault" # Default vault
if [ -n "$1" ]; then
  TARGET_VAULT_PATH="$1"
  echo "Using custom vault path: $TARGET_VAULT_PATH"
else
  echo "Using default vault path: $TARGET_VAULT_PATH"
  # Create default test-vault directory if it doesn't exist and we're using it
  if [ ! -d "$TARGET_VAULT_PATH" ]; then
    echo "Creating $TARGET_VAULT_PATH directory..."
    mkdir -p "$TARGET_VAULT_PATH"
  fi

  # Create welcome.md file in the default test-vault if it doesn't exist
  WELCOME_FILE="$TARGET_VAULT_PATH/welcome.md"
  if [ ! -f "$WELCOME_FILE" ]; then
    echo "Creating $WELCOME_FILE file..."
    if [ -f "welcome.md.template" ]; then
      cp welcome.md.template "$WELCOME_FILE"
      echo "Created $WELCOME_FILE from template."
    else
      # Create a basic welcome file if template doesn't exist
      echo "# Welcome to Simple Note Chat" > "$WELCOME_FILE"
      echo "" >> "$WELCOME_FILE"
      echo "This is a sample note to help you test the plugin." >> "$WELCOME_FILE"
      echo "Created $WELCOME_FILE with default content."
    fi
  fi
fi

# Run the development build/watch process defined in esbuild.config.mjs
# Pass the target vault path as an environment variable
# This will build, copy to the target vault, and watch for changes.
echo "Starting development build and watch process for vault: $TARGET_VAULT_PATH..."
TARGET_VAULT_PATH="$TARGET_VAULT_PATH" npm run dev

# The 'npm run dev' command will keep running in watch mode.
# Press Ctrl+C to stop the process.
