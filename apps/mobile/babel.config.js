module.exports = function (api) {
  api.cache(true);

  return {
    presets: [["babel-preset-expo", { jsxImportSource: "react" }]],
    plugins: [
      // Must stay last. Reanimated's plugin rewrites worklets and expects to
      // see the final AST; anything after it silently breaks animations.
      "react-native-reanimated/plugin",
    ],
  };
};
