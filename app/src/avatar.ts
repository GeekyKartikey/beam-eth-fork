/**
 * @file Profile avatar: pick an image, upload it to the server, and the URL to
 * show it. The image lives on the server (`/profile/avatar/<wallet>`); the device
 * only keeps a version stamp so the cached image refreshes after a new upload.
 */
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useState } from 'react';
import { config } from './config';
import { readJson, writeJson } from './storage';

const key = (address: string) => `avatar:${address.toLowerCase()}`;
const isVersion = (v: unknown): v is number => typeof v === 'number';

/**
 * The server URL for a wallet's avatar, cache-busted by the local version stamp.
 * @param address Wallet address, or null when signed out.
 * @returns The image URL (null when none has been uploaded on this device) and a reload.
 */
export function useAvatarUri(address: string | null): { uri: string | null; reload: () => void } {
  const [version, setVersion] = useState<number | null>(null);
  const reload = useCallback(() => {
    if (address) void readJson(key(address), isVersion).then((v) => setVersion(v ?? null));
    else setVersion(null);
  }, [address]);
  useEffect(reload, [reload]);
  const uri = address && version && config.agentUrl ? `${config.agentUrl}/profile/avatar/${address}?v=${version}` : null;
  return { uri, reload };
}

/**
 * Lets the user pick an image and uploads it as the wallet's avatar.
 * @param address Wallet the avatar belongs to.
 * @returns True on a successful upload, false if cancelled, denied or failed.
 */
export async function pickAndUploadAvatar(address: string): Promise<boolean> {
  if (!config.agentUrl) return false;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return false;
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return false;

  const form = new FormData();
  form.append('wallet', address);
  // React Native's FormData takes a file as { uri, name, type }; fetch sets the multipart boundary.
  form.append('image', { uri: asset.uri, name: asset.fileName ?? 'avatar.jpg', type: asset.mimeType ?? 'image/jpeg' } as unknown as Blob);
  const res = await fetch(`${config.agentUrl}/profile/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.agentToken}` },
    body: form,
  }).catch(() => null);
  if (!res || !res.ok) return false;
  await writeJson(key(address), Date.now());
  return true;
}
