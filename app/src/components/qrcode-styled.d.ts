/**
 * @file Points TypeScript at the typings `react-native-qrcode-styled` ships
 * but does not declare in its package.json (no `types` field), so imports
 * stay fully typed instead of `any`.
 */
declare module 'react-native-qrcode-styled' {
  export * from 'react-native-qrcode-styled/lib/typescript/module/src/index';
  export { default } from 'react-native-qrcode-styled/lib/typescript/module/src/index';
}
