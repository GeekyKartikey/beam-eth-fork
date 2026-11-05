/**
 * @file React hooks shared by the tabs and the Ask sheet: Privy session and
 * embedded wallet, balance, BeamPay account (cap and World ID link), Beam
 * handle, server status, the pending-payment slot and the World ID approval flow.
 */
import {
  useEmbeddedEthereumWallet,
  usePrivy,
  type ConnectedEthereumWallet,
  type PrivyEmailAccount,
  type PrivyUser,
} from '@privy-io/expo';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Address } from 'viem';
import { validateHandleLabel, type ApprovalRequest, type ApprovalStart, type HandleAvailability } from './api';
import { runApproval, type ApprovalOutcome } from './approvals';
import { publicClient } from './chain';
import { config } from './config';
import { confirmChange } from './deviceAuth';
import { checkHandle, lookupHandle } from './handles';
import { toChecksumAddress } from './intent';
import { readAccount, sendAccountCall, type AccountCall, type BeamPayAccount } from './beamPayClient';
import { checkPending, type PendingStatus } from './pendingTx';
import { loadServerStatus, type ServerStatus } from './serverApi';

type WalletState = {
  /** Privy has restored (or failed to restore) the session. */
  ready: boolean;
  user: PrivyUser | null;
  /** First embedded Ethereum wallet; null until created. */
  wallet: ConnectedEthereumWallet | null;
  address: Address | null;
  /** Linked email, or null for non-email logins. */
  email: string | null;
};

/**
 * Current Privy user and embedded wallet.
 * @returns Session and wallet state.
 */
export function useWallet(): WalletState {
  const { user, isReady } = usePrivy();
  const { wallets } = useEmbeddedEthereumWallet();
  const wallet = (user && wallets[0]) || null;
  const email = user?.linked_accounts.find((a): a is PrivyEmailAccount => a.type === 'email')?.address ?? null;
  return { ready: isReady, user, wallet, address: wallet ? toChecksumAddress(wallet.address) : null, email };
}

/** A value loaded from the network: null until loaded, plus a failure flag and a reload. */
type Loaded<T> = { value: T | null; error: boolean; refresh: () => Promise<void> };

/**
 * Loads a value for the signed-in wallet, dropping stale responses.
 * @param load Loader, or null when there is nothing to load (signed out, feature off).
 * @returns The value, error flag and reload.
 */
function useLoaded<T>(load: (() => Promise<T>) | null): Loaded<T> {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const call = ++latest.current;
    if (!load) {
      setValue(null);
      return;
    }
    try {
      const next = await load();
      if (call !== latest.current) return;
      setValue(next);
      setError(false);
    } catch {
      if (call === latest.current) setError(true);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { value, error, refresh };
}

/**
 * Native balance of an address, fetched on change and on demand.
 * @param address Wallet address, or null when signed out.
 * @returns Balance in wei (null until loaded), load error flag and a refresh function.
 */
export function useBalance(address: Address | null): Loaded<bigint> {
  const load = useMemo(() => (address ? () => publicClient.getBalance({ address }) : null), [address]);
  return useLoaded(load);
}

/**
 * Resumes the pending-payment slot on mount.
 * @returns The slot status and a re-check function.
 */
export function usePendingTx(): { status: PendingStatus; recheck: () => Promise<PendingStatus> } {
  const [status, setStatus] = useState<PendingStatus>({ kind: 'none' });

  const recheck = useCallback(async () => {
    const next = await checkPending(publicClient).catch((): PendingStatus => ({ kind: 'none' }));
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  return { status, recheck };
}

/**
 * The server's `/health` status (fetched once per process, retried while unreachable).
 * @returns Status; `loading` until the first answer.
 */
export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    void loadServerStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}

/**
 * BeamPay cap and World ID link of the wallet.
 * @param address Wallet address, or null when signed out.
 * @returns The account (null until loaded or when BeamPay isn't configured), error flag and reload.
 */
export function useBeamPayAccount(address: Address | null): Loaded<BeamPayAccount> {
  const { beamPay } = config;
  const load = useMemo(() => (beamPay && address ? () => readAccount(beamPay, address) : null), [beamPay, address]);
  return useLoaded(load);
}

/**
 * The wallet's Beam handle.
 * @param address Wallet address, or null when signed out.
 * @param enabled False when the server has handles off.
 * @returns `{ name }` (null name when none) once loaded, error flag and reload.
 */
export function useHandle(address: Address | null, enabled: boolean): Loaded<{ name: string | null }> {
  const load = useMemo(
    () => (address && enabled ? async () => ({ name: await lookupHandle(address) }) : null),
    [address, enabled],
  );
  return useLoaded(load);
}

/** What the World ID approval sheet shows: creating the approval, waiting for the proof, or how it ended. */
export type ApprovalPhase = { kind: 'starting' } | { kind: 'waiting'; start: ApprovalStart } | ApprovalOutcome;

/**
 * State machine behind `ApprovalSheet`: starts an approval whenever `open`
 * turns true (or on `retry`), polls it while the app is in the foreground and
 * at once when it returns to the foreground (back from World App), and stops
 * and aborts on close. Never throws.
 * @param request What to approve; the flow waits while null.
 * @param open Whether the sheet is open.
 * @param onApproved Receives the approved outcome as soon as the server signs.
 * @returns Current phase and `retry()`.
 */
export function useApprovalFlow(
  request: ApprovalRequest | null,
  open: boolean,
  onApproved: (outcome: Extract<ApprovalOutcome, { kind: 'approved' }>) => void,
): { phase: ApprovalPhase; retry: () => void } {
  const [phase, setPhase] = useState<ApprovalPhase>({ kind: 'starting' });
  const [attempt, setAttempt] = useState(0);
  // Callers build `request` inline, so the effect reads it from a ref and restarts only on open, presence or retry.
  const requestRef = useRef(request);
  requestRef.current = request;
  const approvedRef = useRef(onApproved);
  approvedRef.current = onApproved;
  const ready = open && !!request;

  useEffect(() => {
    const req = requestRef.current;
    if (!ready || !req) return;
    setPhase({ kind: 'starting' });
    const run = runApproval(req, {
      onWaiting: (start) => setPhase({ kind: 'waiting', start }),
      onDone: (outcome) => {
        setPhase(outcome);
        if (outcome.kind === 'approved') approvedRef.current(outcome);
      },
      canPoll: () => AppState.currentState === 'active',
    });
    const sub = AppState.addEventListener('change', (state) => state === 'active' && run.poll());
    return () => {
      sub.remove();
      run.stop();
    };
  }, [ready, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { phase, retry };
}

/**
 * Sends account-level BeamPay calls from Profile (lower or raise the cap, link
 * World ID): device confirmation, send, wait. One at a time.
 * @param onDone Called after a call succeeds (reload the account).
 * @returns `sending`, the last error copy, `run(call, prompt)` resolving true on success, and `clearError()`.
 */
export function useAccountCall(onDone: () => void): {
  sending: boolean;
  error: string | null;
  run: (call: AccountCall, prompt: string) => Promise<boolean>;
  clearError: () => void;
} {
  const { wallet, address } = useWallet();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const run = useCallback(
    async (call: AccountCall, prompt: string) => {
      const { beamPay } = config;
      if (busy.current || !wallet || !address || !beamPay) return false;
      busy.current = true;
      setError(null);
      try {
        if (!(await confirmChange(prompt))) return false;
        setSending(true);
        await sendAccountCall(await wallet.getProvider(), beamPay, address, call);
        doneRef.current();
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
        return false;
      } finally {
        busy.current = false;
        setSending(false);
      }
    },
    [wallet, address],
  );

  return { sending, error, run, clearError: useCallback(() => setError(null), []) };
}

/** Live state of a handle label as the user types. */
export type HandleCheck =
  | { kind: 'empty' }
  /** Fails the local label rules; `message` is user-facing. */
  | { kind: 'invalid'; message: string }
  | { kind: 'checking'; label: string }
  | { kind: 'result'; label: string; availability: HandleAvailability }
  | { kind: 'error'; label: string };

const HANDLE_DEBOUNCE_MS = 400;

/**
 * Validates a label locally on every keystroke and checks availability on the server after a short pause.
 * @param raw Label as typed.
 * @returns The current check.
 */
export function useHandleAvailability(raw: string): HandleCheck {
  const valid = raw.trim() ? validateHandleLabel(raw) : null;
  const label = valid && 'label' in valid ? valid.label : null;
  const [remote, setRemote] = useState<Extract<HandleCheck, { kind: 'result' | 'error' }> | null>(null);

  useEffect(() => {
    if (!label) return;
    let alive = true;
    const timer = setTimeout(() => {
      checkHandle(label).then(
        (availability) => alive && setRemote({ kind: 'result', label, availability }),
        () => alive && setRemote({ kind: 'error', label }),
      );
    }, HANDLE_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [label]);

  if (!valid) return { kind: 'empty' };
  if ('error' in valid) return { kind: 'invalid', message: valid.error };
  // A result for an earlier label is stale until the new check lands.
  return remote?.label === valid.label ? remote : { kind: 'checking', label: valid.label };
}
