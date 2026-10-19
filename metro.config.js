// Learn more https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Low-memory machine: with maxWorkers = 1, Metro transforms files in the main
// process instead of spawning a pool of worker threads (one per CPU core by
// default), each with its own V8 heap. Slower bundling, much lower peak memory.
// Can be overridden per run with `npx expo start --max-workers <n>`.
config.maxWorkers = 1;

module.exports = config;
