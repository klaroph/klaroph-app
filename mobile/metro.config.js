const http = require('node:http')
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname)
config.resolver.sourceExts.push('sql')
// expo-sqlite's web build imports wa-sqlite.wasm; Metro only serves it as an asset.
if (!config.resolver.assetExts.includes('wasm')) config.resolver.assetExts.push('wasm')

// Reuse one SharedArrayBuffer for wa-sqlite sync calls. expo-sqlite allocates a
// new 1MB buffer per call, which fails after a large pull on the web.
const workerChannel = path.resolve(__dirname, 'src/db/workerChannel.ts')
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = context.originModulePath ?? ''
  const fromExpoSqliteWeb = origin.includes(`${path.sep}expo-sqlite${path.sep}web${path.sep}`)
  if (fromExpoSqliteWeb && (moduleName === './WorkerChannel' || moduleName.endsWith('/WorkerChannel'))) {
    return { type: 'sourceFile', filePath: workerChannel }
  }
  return context.resolveRequest(context, moduleName, platform)
}

// SharedArrayBuffer (wa-sqlite) requires a cross-origin-isolated document.
// Expo serves the HTML shell outside Metro's middleware, so the same headers
// are also applied on every dev-server response. Native builds do not load this file.
const enhanceMiddleware = config.server.enhanceMiddleware
config.server.enhanceMiddleware = (middleware, metroServer) => {
  const enhancedMiddleware = enhanceMiddleware ? enhanceMiddleware(middleware, metroServer) : middleware
  return (req, res, next) => {
    isolate(res)
    return enhancedMiddleware(req, res, next)
  }
}

const writeHead = http.ServerResponse.prototype.writeHead
if (!writeHead.__klaroIsolate) {
  http.ServerResponse.prototype.writeHead = function klaroWriteHead(...args) {
    isolate(this)
    return writeHead.apply(this, args)
  }
  http.ServerResponse.prototype.writeHead.__klaroIsolate = true
}

function isolate(res) {
  if (res.headersSent) return
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless')
}

module.exports = config
