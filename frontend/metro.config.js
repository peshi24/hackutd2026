const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
// These sibling projects have separate lockfiles, not a workspace manifest.
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../backend')];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'spacetimedb') {
    // Use the browser/WebSocket build rather than Node's socket implementation.
    return context.resolveRequest(context, path.resolve(__dirname,
      '../backend/node_modules/spacetimedb/dist/index.browser.mjs'), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};
module.exports = config;
