/**
 * @file Profile "Spending limits" section: the per-payment cap (onchain in
 * BeamPay: lowering is instant, raising needs a World ID approval), the daily
 * limit (on this device), each edited in a bottom sheet with presets, plus
 * today's spend.
 */
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { Address } from 'viem';
import type { ApprovalRequest } from '../api';
import { NETWORK } from '../config';
import { useAccountCall } from '../hooks';
import { parseAmount } from '../intent';
import { capError, dailyLimitError, saveDailyLimit, type LimitState } from '../limits';
import type { NetworkKey } from '../network';
import type { BeamPayAccount } from '../beamPayClient';
import { toDecimal } from '../prepare';
import type { WorldMode } from '../serverApi';
import { colors, fonts, HIT, radius, space, type as typeScale } from '../theme';
import { WORLD_OFF } from '../validateIntent';
import { ApprovalSheet } from './ApprovalSheet';
import { money } from './format';
import { WorldMark } from './logos';
import { Sheet } from './Sheet';
import { Button, Card, ListRow, ProgressBar, SectionHeader, Text } from './ui';

/** Quick picks per network, in the network's token. */
const PRESETS: Record<NetworkKey, { cap: string[]; daily: string[] }> = {
  arc: { cap: ['10', '25', '50', '100'], daily: ['50', '100', '250', '500'] },
};

/** Share of the daily limit after which the bar turns amber. */
const WARN_AT = 0.8;

/**
 * Amount editor body: input with the unit, inline error, presets and actions.
 * @param props.label Accessible name of the input.
 * @param props.value Current text.
 * @param props.onChange Text change handler.
 * @param props.error Validation error, or null.
 * @param props.presets Quick picks.
 * @param props.children Action buttons under the presets.
 * @returns The editor.
 */
function AmountEditor({
  label,
  value,
  onChange,
  error,
  presets,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  presets: string[];
  children: ReactNode;
}) {
  return (
    <>
      <View style={[styles.amountBox, value !== '' && error ? styles.amountBoxError : null]}>
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(',', '.'))}
          keyboardType="decimal-pad"
          maxLength={10}
          autoFocus
          selectTextOnFocus
          accessibilityLabel={`${label} in ${NETWORK.symbol}`}
          style={styles.amountInput}
        />
        <Text variant="headline" color="textTertiary">
          {NETWORK.symbol}
        </Text>
      </View>
      {value !== '' && error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.presets}>
        {presets.map((p) => {
          const active = value === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${p} ${NETWORK.symbol}`}
              onPress={() => onChange(p)}
              style={({ pressed }) => [styles.preset, active && styles.presetActive, pressed && styles.presetPressed]}
            >
              <Text variant="button" color={active ? 'primary' : 'text'}>
                {p}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.actions}>{children}</View>
    </>
  );
}

/**
 * Daily limit editor. Remount it (via `key`) for each edit so the input starts from the saved value.
 * @param props.visible Whether the sheet is open.
 * @param props.initial Saved limit.
 * @param props.onClose Closes without saving.
 * @param props.onSaved Called after the limit is stored.
 * @returns The sheet.
 */
function DailySheet({ visible, initial, onClose, onSaved }: { visible: boolean; initial: string; onClose: () => void; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const error = dailyLimitError(value);

  const save = async () => {
    setSaving(true);
    await saveDailyLimit(value);
    setSaving(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSaved();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Daily limit">
      <Text variant="callout" color="textSecondary">
        Total Beam can send in a day from this phone, whatever the agent proposes.
      </Text>
      <AmountEditor label="Daily limit" value={value} onChange={setValue} error={error} presets={PRESETS[NETWORK.key].daily}>
        <Button variant="secondary" label="Cancel" onPress={onClose} style={styles.flex} />
        <Button label="Save" loading={saving} disabled={!!error} onPress={() => void save()} style={styles.flex} />
      </AmountEditor>
    </Sheet>
  );
}

type CapSheetProps = {
  visible: boolean;
  address: Address;
  account: BeamPayAccount;
  world: WorldMode | null;
  onClose: () => void;
  onChanged: () => void;
};

/**
 * Per-payment cap editor: lowering sends `lowerCap` after a fingerprint;
 * raising needs a World ID approval, then sends `raiseCap`. Remount per edit.
 * @param props.visible Whether the sheet is open.
 * @param props.address Wallet address.
 * @param props.account Current cap and World ID link.
 * @param props.world World ID mode on the server (null when unreachable).
 * @param props.onClose Closes the sheet.
 * @param props.onChanged Called after the cap changed onchain.
 * @returns The editor sheet plus its approval sheet.
 */
function CapSheet({ visible, address, account, world, onClose, onChanged }: CapSheetProps) {
  const [value, setValue] = useState(toDecimal(account.cap));
  const [approving, setApproving] = useState(false);
  const call = useAccountCall(onChanged);
  const wei = parseAmount(value, NETWORK);
  const error = capError(value);
  const raising = wei !== null && wei > account.cap;
  const unchanged = wei === account.cap;
  const raiseBlocked = raising && (world === 'off' || !account.linked);
  const request: ApprovalRequest | null = wei !== null && raising ? { kind: 'cap', wallet: address, cap: { capWei: wei.toString() } } : null;

  let note: string;
  if (world === 'off' && raising) note = WORLD_OFF;
  else if (!account.linked && raising) note = 'Link World ID above to raise your cap.';
  else note = 'Payments above this need a fresh World ID approval. Lowering it is instant.';

  return (
    <>
      <Sheet visible={visible && !approving} onClose={onClose} title="Per-payment cap">
        <Text variant="callout" color="textSecondary">
          {`Enforced onchain by BeamPay, so a bug or a stolen PIN can't skip it. ${note}`}
        </Text>
        <AmountEditor label="Per-payment cap" value={value} onChange={setValue} error={error} presets={PRESETS[NETWORK.key].cap}>
          {raising ? (
            <Button
              label="Raise with World ID"
              leading={<WorldMark size={18} color={colors.textInverse} />}
              disabled={!!error || raiseBlocked || call.sending}
              loading={call.sending}
              onPress={() => setApproving(true)}
              style={styles.flex}
            />
          ) : (
            <Button
              label="Lower cap"
              icon="shield"
              disabled={!!error || unchanged || wei === null}
              loading={call.sending}
              onPress={() => wei !== null && void call.run({ kind: 'lowerCap', cap: wei }, 'Lower your cap').then((ok) => ok && onClose())}
              style={styles.flex}
            />
          )}
        </AmountEditor>
        {call.error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {call.error}
          </Text>
        ) : null}
      </Sheet>
      <ApprovalSheet
        visible={approving}
        request={request}
        title="Raise your cap"
        detail={wei !== null ? `Approve a per-payment cap of ${money(wei)}.` : ''}
        onApproved={({ result }) => {
          if (wei === null || !result.signature || result.deadline === undefined) return;
          void call
            .run({ kind: 'raiseCap', cap: wei, approval: { signature: result.signature, deadline: result.deadline } }, 'Raise your cap')
            .then((ok) => ok && onClose());
        }}
        onClose={() => setApproving(false)}
      />
    </>
  );
}

type Props = {
  state: LimitState | null;
  address: Address | null;
  /** BeamPay account; null while loading or without BeamPay. */
  account: BeamPayAccount | null;
  world: WorldMode | null;
  onSaved: () => void;
  onCapChanged: () => void;
};

/**
 * Spending limits section.
 * @param props.state Daily limit and spend; null while loading.
 * @param props.address Wallet address.
 * @param props.account BeamPay cap and link; null while loading or without BeamPay.
 * @param props.world World ID mode on the server.
 * @param props.onSaved Called after the daily limit is stored (to reload state).
 * @param props.onCapChanged Called after the onchain cap changed (to reload the account).
 * @returns Section header plus card.
 */
export function LimitsCard({ state, address, account, world, onSaved, onCapChanged }: Props) {
  const [editing, setEditing] = useState<'cap' | 'daily' | null>(null);
  const [session, setSession] = useState(0);
  const edit = (field: 'cap' | 'daily') => {
    setSession((n) => n + 1);
    setEditing(field);
  };

  if (!state) {
    return (
      <View>
        <SectionHeader title="Spending limits" />
        <Card style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </Card>
      </View>
    );
  }

  const used = state.dailyWei > 0n ? Number((state.spentWei * 1000n) / state.dailyWei) / 1000 : 0;
  const spentLabel = `${money(state.spentWei)} of ${money(state.dailyWei)}`;
  const cap = account ? money(account.cap) : '…';

  return (
    <View>
      <SectionHeader title="Spending limits" />
      <Card style={styles.card}>
        <ListRow
          icon="lock"
          tone="neutral"
          title="Per payment"
          subtitle="Onchain. Raising it needs World ID"
          accessibilityLabel={`Per payment cap, ${cap}, onchain. Edit`}
          onPress={account && address ? () => edit('cap') : undefined}
          trailing={<Value text={cap} editable={!!account && !!address} />}
        />
        <ListRow
          icon="calendar"
          tone="neutral"
          title="Daily limit"
          subtitle="On this phone"
          divider
          accessibilityLabel={`Daily limit, ${money(state.dailyWei)}. Edit`}
          onPress={() => edit('daily')}
          trailing={<Value text={money(state.dailyWei)} editable />}
        />
        <View style={styles.spend} accessible accessibilityLabel={`Spent today ${spentLabel}`}>
          <View style={styles.spendHead}>
            <Text variant="captionStrong" color="textSecondary">
              Spent today
            </Text>
            <Text variant="captionStrong" color={used >= WARN_AT ? 'warning' : 'text'} style={styles.tabular}>
              {spentLabel}
            </Text>
          </View>
          <ProgressBar value={used} tone={used >= WARN_AT ? 'warning' : 'primary'} />
        </View>
      </Card>
      <DailySheet
        key={`daily-${session}`}
        visible={editing === 'daily'}
        initial={state.daily}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onSaved();
        }}
      />
      {account && address ? (
        <CapSheet
          key={`cap-${session}`}
          visible={editing === 'cap'}
          address={address}
          account={account}
          world={world}
          onClose={() => setEditing(null)}
          onChanged={onCapChanged}
        />
      ) : null}
    </View>
  );
}

/**
 * Trailing value with an "Edit" hint.
 * @param props.text Value.
 * @param props.editable Show the hint.
 * @returns The trailing view.
 */
function Value({ text, editable }: { text: string; editable: boolean }) {
  return (
    <View style={styles.value}>
      <Text variant="mono" style={styles.valueText}>
        {text}
      </Text>
      {editable ? (
        <Text variant="overline" color="primary">
          Edit
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  loading: { alignItems: 'center', paddingVertical: space.xxl },
  card: { paddingVertical: space.xs },
  value: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  valueText: { fontFamily: fonts.monoMedium },
  spend: {
    gap: space.sm,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  spendHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 64,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
  },
  amountBoxError: { borderColor: colors.danger },
  amountInput: { ...typeScale.title, flex: 1, color: colors.text, padding: 0, fontVariant: ['tabular-nums'] },
  presets: { flexDirection: 'row', gap: space.sm },
  preset: {
    flex: 1,
    minHeight: HIT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  presetActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  presetPressed: { backgroundColor: colors.surfaceMuted },
  actions: { flexDirection: 'row', gap: space.md },
});
