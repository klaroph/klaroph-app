const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)
config.resolver.sourceExts.push('sql')
// expo-sqlite's web build imports wa-sqlite.wasm; Metro only serves it as an asset.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm')

module.exports = config
