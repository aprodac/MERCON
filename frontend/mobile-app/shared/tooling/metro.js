const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

/**
 * Metro config shared by both mobile apps. Each app's metro.config.js is
 * `module.exports = require('../shared/tooling/metro')(__dirname);`
 */
module.exports = function createMetroConfig(projectRoot) {
  // Mobile workspace root (frontend/mobile-app): holds the hoisted node_modules
  // and the shared package (@mercon/mobile-shared, ../shared).
  const mobileRoot = path.resolve(__dirname, '../..');
  // Repo root (frontend/mobile-app -> ../..): packages/shared-types lives there.
  const workspaceRoot = path.resolve(mobileRoot, '../..');

  const config = getDefaultConfig(projectRoot);

  // Only what the apps actually import: the mobile workspace (apps, shared,
  // node_modules) and packages/shared-types. Watching the whole repo root made
  // Metro crawl the backend and web dashboard (and their node_modules) too.
  config.watchFolders = [mobileRoot, path.resolve(workspaceRoot, 'packages/shared-types')];
  // Mobile node_modules come first so shared code gets the mobile React/React
  // Native versions, never the web dashboard's copies in the repo root.
  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(mobileRoot, 'node_modules'),
    path.resolve(workspaceRoot, 'node_modules'),
  ];
  config.resolver.extraNodeModules = {
    '@mercon/shared-types': path.resolve(workspaceRoot, 'packages/shared-types'),
};

// Deep per-icon lucide paths written by babel-plugin-lucide-icons.js are not in
// the package's `exports` map, so resolve them straight to the file.
const { DEEP_PREFIX: LUCIDE_DEEP_PREFIX, lucideRoot } = require('./babel-plugin-lucide-icons');
const lucideDir = lucideRoot();
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(LUCIDE_DEEP_PREFIX)) {
    return {
      type: 'sourceFile',
      filePath: path.join(lucideDir, 'dist/esm', moduleName.slice(LUCIDE_DEEP_PREFIX.length)),
    };
  }
  return (defaultResolveRequest || context.resolveRequest)(context, moduleName, platform);
};

return withNativeWind(config, { input: path.join(projectRoot, 'src/global.css') });
};
