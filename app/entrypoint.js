/**
 * @file App entry point. Installs the polyfills Privy and viem expect
 * (`crypto.getRandomValues`, `Buffer`, ethers shims, `TextEncoder`) before
 * expo-router loads any app code. Order matters.
 */
import 'react-native-get-random-values';

import { Buffer } from 'buffer';
global.Buffer = Buffer;

import '@ethersproject/shims';
import 'fast-text-encoding';

import 'expo-router/entry';
