#!/usr/bin/env node

// Simple startup script to handle Node.js v22 compatibility
console.log('Starting RSS Feed News Tool...');
console.log('Node.js version:', process.version);

try {
  require('./server.js');
} catch (error) {
  console.error('Failed to start server:', error.message);
  console.error('Stack trace:', error.stack);
  process.exit(1);
}