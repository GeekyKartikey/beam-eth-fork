/**
 * @file Profile avatar: pick an image, upload it to the server, and the URL to
 * show it. The image lives on the server (`/profile/avatar/<wallet>`); the device
 * keeps a version stamp so the cached image refreshes after a new upload.
 *
 * The version is a small shared store with listeners, so one upload updates every
 * avatar on screen at once (the Wallet header, Profile, anywhere else) without a
 * remount, and it is hydrated from storage so it survives a restart.
 */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { config } from './config';
import { readJson, writeJson } from './storage';

const key = (address: string) => `avatar:${address.toLowerCase()}`;
const isVersion = (v: unknown): v is number => typeof v === 'number';

/** address(lowercased) -> version stamp of its current avatar. */
const versions = new Map<string, number>();
/** Addresses already read from storage, so we hydrate each once. */
const hydrated = new Set<string>();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/**
 * Records a new avatar version for a wallet: updates every live avatar and persists it.
 * @param address Wallet the avatar belongs to.
 * @param version Version stamp (an upload time).
 * @returns Resolves once stored.
 */
export async function setAvatarVersion(address: string, version: number): Promise<void> {
  const a = address.toLowerCase();
  versions.set(a, version);
  hydrated.add(a);
  notify();
  await writeJson(key(address), version);
}

/**
 * The server URL for a wallet's avatar, cache-busted by the shared version stamp.
 * Re-renders whenever any avatar upload happens, so it stays in sync across screens.
 * @param address Wallet address, or null when signed out.
 * @returns The image URL (null when none has been uploaded) and a manual reload.
 */
export function useAvatarUri(address: string | null): { uri: string | null; reload: () => void } {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    const a = address?.toLowerCase();
    if (a && !hydrated.has(a)) {
      hydrated.add(a);
      void readJson(key(a), isVersion).then((v) => {
        if (v) {
          versions.set(a, v);
          notify();
        }
      });
    }
    return () => void listeners.delete(l);
  }, [address]);
  const reload = useCallback(() => bump((n) => n + 1), []);
  const v = address ? versions.get(address.toLowerCase()) : undefined;
  const uri = address && v && config.agentUrl ? `${config.agentUrl}/profile/avatar/${address}?v=${v}` : null;
  return { uri, reload };
}

/** Outcome of an avatar pick-and-upload. */
export type AvatarResult = 'uploaded' | 'cancelled' | 'failed';

/**
 * Lets the user pick an image and uploads it as the wallet's avatar.
 *
 * Uses the system photo picker (no media permission needed on Android 13+ / iOS),
 * so it never gates on a runtime permission that the manifest may not declare.
 * @param address Wallet the avatar belongs to.
 * @returns `uploaded` on success, `cancelled` if the user backed out, `failed` on error.
 */
export async function pickAndUploadAvatar(address: string): Promise<AvatarResult> {
  if (!config.agentUrl) return 'failed';
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 }).catch(
    () => null,
  );
  if (!picked || picked.canceled) return 'cancelled';
  const asset = picked.assets?.[0];
  if (!asset) return 'cancelled';

  const form = new FormData();
  form.append('wallet', address);
  // React Native's FormData takes a file as { uri, name, type }; fetch sets the multipart boundary.
  form.append('image', { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  const res = await fetch(`${config.agentUrl}/profile/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.agentToken}` },
    body: form,
  }).catch(() => null);
  if (!res || !res.ok) return 'failed';
  await setAvatarVersion(address, Date.now());
  return 'uploaded';
}
