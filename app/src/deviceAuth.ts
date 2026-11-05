/**
 * @file Device owner checks before signing: the system biometric or PIN
 * prompt when one is enrolled, otherwise the in-app hold-to-confirm.
 */
import * as LocalAuthentication from 'expo-local-authentication';

/** How the user approves: system biometric/PIN prompt, or in-app 1.5 s hold. */
export type AuthMode = 'biometric' | 'hold';

/**
 * Which approval the device supports.
 * @returns `biometric` when a biometric or device PIN is enrolled, else `hold`.
 */
export async function getAuthMode(): Promise<AuthMode> {
  const level = await LocalAuthentication.getEnrolledLevelAsync().catch(() => LocalAuthentication.SecurityLevel.NONE);
  return level > LocalAuthentication.SecurityLevel.NONE ? 'biometric' : 'hold';
}

/**
 * Asks for the fingerprint or device PIN.
 * @param promptMessage Prompt title, e.g. "Confirm payment".
 * @returns True when the user authenticated.
 */
export async function authenticate(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Cancel' }).catch(() => null);
  return !!result?.success;
}

/**
 * Confirms a settings change (cap, World ID link). Prompts when a biometric or PIN is enrolled.
 * @param promptMessage Prompt title.
 * @returns True when confirmed.
 */
export async function confirmChange(promptMessage: string): Promise<boolean> {
  // ponytail: without an enrolled biometric or PIN the explicit tap is the confirmation; add a hold step if settings changes need more.
  return (await getAuthMode()) === 'hold' || authenticate(promptMessage);
}
