const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// expo-sqlite's web entry point imports a `.wasm` asset. The driver never opens
// a database on web, but Metro still resolves the module graph, so the
// extension has to be known or the whole web bundle fails.
config.resolver.assetExts.push('wasm');

module.exports = withNativeWind(config, { input: "./global.css" });
