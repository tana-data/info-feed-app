#!/bin/bash

echo "🚀 Starting RSS Feed News Tool in development mode..."
echo "📋 Node.js version: $(node --version)"
echo "📋 npm version: $(npm --version)"

# Kill any existing processes on port 3000
echo "🧹 Cleaning up existing processes..."
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "node.*start.js" 2>/dev/null || true

# Wait a moment
sleep 2

# Start in development mode
echo "🔄 Starting with nodemon..."
npx nodemon start.js