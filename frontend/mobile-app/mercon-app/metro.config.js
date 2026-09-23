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

module.exports = withNativeWind(config, { input: './src/global.css' });
