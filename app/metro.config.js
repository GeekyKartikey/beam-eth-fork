/**
 * @file Metro config with the module resolution Privy needs on React Native:
 * `jose` resolves to its browser build, and `@privy-io/*` packages resolve
 * through their package.json `exports` maps.
 */
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'jose') {
    const ctx = { ...context, unstable_conditionNames: ['browser'] };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  if (moduleName.startsWith('@privy-io/')) {
    const ctx = { ...context, unstable_enablePackageExports: true };
    return ctx.resolveRequest(ctx, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
