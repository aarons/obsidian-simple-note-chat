#!/bin/bash

# Ensure dependencies are installed (including fs-extra)
echo "Making sure dependencies are installed..."
npm install
if [ $? -ne 0 ]; then
  echo "npm install failed. Please check for errors."
  exit 1
fi

# Run the development build/watch process defined in esbuild.config.mjs
# This will build, copy to the test vault, and watch for changes.
echo "Starting development build and watch process..."
npm run dev

# The 'npm run dev' command will keep running in watch mode.
# Press Ctrl+C to stop the process.