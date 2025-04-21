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

# Install hot-reload plugin
HOT_RELOAD_REPO="pjeby/hot-reload"
HOT_RELOAD_DIR="$TARGET_VAULT_PATH/.obsidian/plugins/hot-reload"
GITHUB_API_URL="https://api.github.com/repos/$HOT_RELOAD_REPO/releases/latest"

echo "Fetching latest hot-reload release tag from GitHub API..."
# Use curl to fetch, grep to find the tag_name line, sed to extract the version string
LATEST_TAG=$(curl -s "$GITHUB_API_URL" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$LATEST_TAG" ]; then
  echo "Error: Could not fetch the latest release tag for $HOT_RELOAD_REPO."
  echo "Please check network connection or if the repository exists and has releases."
  # Decide if you want to exit or fallback to a default version
  # exit 1 # Uncomment to exit if fetching fails
  echo "Falling back to default version 0.2.1 (this might be outdated)."
  LATEST_TAG="0.2.1" # Fallback version
fi

echo "Latest hot-reload tag: $LATEST_TAG"

# Construct download URLs using the latest tag
HOT_RELOAD_BASE_URL="https://github.com/$HOT_RELOAD_REPO/releases/download/$LATEST_TAG"
HOT_RELOAD_MAIN_URL="$HOT_RELOAD_BASE_URL/main.js"
HOT_RELOAD_MANIFEST_URL="$HOT_RELOAD_BASE_URL/manifest.json"

echo "Ensuring hot-reload plugin directory exists: $HOT_RELOAD_DIR"
mkdir -p "$HOT_RELOAD_DIR"

echo "Downloading hot-reload main.js ($LATEST_TAG)..."
curl -L "$HOT_RELOAD_MAIN_URL" -o "$HOT_RELOAD_DIR/main.js"
if [ $? -ne 0 ]; then
  echo "Failed to download hot-reload main.js. Please check the URL or network connection."
  # Optionally exit here if hot-reload is critical
  # exit 1
fi

echo "Downloading hot-reload manifest.json ($LATEST_TAG)..."
curl -L "$HOT_RELOAD_MANIFEST_URL" -o "$HOT_RELOAD_DIR/manifest.json"
if [ $? -ne 0 ]; then
  echo "Failed to download hot-reload manifest.json. Please check the URL or network connection."
  # Optionally exit here if hot-reload is critical
  # exit 1
fi

echo "Hot-reload plugin installed/updated."

# Run the development build/watch process defined in esbuild.config.mjs
# Pass the target vault path as an environment variable
# This will build, copy to the target vault, and watch for changes.
echo "Starting development build and watch process for vault: $TARGET_VAULT_PATH..."
TARGET_VAULT_PATH="$TARGET_VAULT_PATH" npm run dev

# The 'npm run dev' command will keep running in watch mode.
# Press Ctrl+C to stop the process.
