/**
 * @file Babel config: Expo preset with `import.meta` transform (part of Privy's
 * Expo setup) and the Reanimated plugin, which must be listed last.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { unstable_transformImportMeta: true }]],
    plugins: ['react-native-reanimated/plugin'],
  };
};
