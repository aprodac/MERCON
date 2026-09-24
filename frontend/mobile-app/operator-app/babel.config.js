module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // react-native-worklets requires its babel plugin to be listed LAST.
    // Without this the worklets JS runtime is not initialized and the app
    // crashes at startup with a "Worklets not initialized" error.
    // Per-icon lucide imports (see ../shared/tooling/babel-plugin-lucide-icons.js) - keeps the
    // bundle from shipping every icon. Must stay before the worklets plugin.
    plugins: ['../shared/tooling/babel-plugin-lucide-icons', 'react-native-worklets/plugin'],
  };
};
