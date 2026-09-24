const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
// Repo root: frontend/mobile-app/mercon-app -> ../../.. (same as the
// `file:../../../packages/shared-types` dependency in package.json).
const workspaceRoot = path.resolve(projectRoot, '../../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
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

module.exports = withNativeWind(config, { input: './src/global.css' });
