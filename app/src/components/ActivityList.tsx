/**
 * @file Payment list used by the Wallet tab (latest few) and the Activity tab
 * (all): payments sent from the app, newest first, with the in-flight payment
 * (if any) on top. Tapping a row opens the transaction on the explorer.
 */
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';
import { NETWORK } from '../config';
import { shortAddress } from '../intent';
import { txUrl } from '../network';
import type { PendingStatus } from '../pendingTx';
import type { ActivityTx } from '../storage';
import { colors, space } from '../theme';
import { money, timeAgo } from './format';
import { UsdcMark } from './logos';
import { Button, Card, ListRow, Pill, Text, type Tone } from './ui';

type RowStatus = ActivityTx['status'] | 'pending' | 'unknown';
type Row = Omit<ActivityTx, 'status'> & { status: RowStatus };

const STATUS: Record<RowStatus, { verb: string; label: string; tone: Extract<Tone, 'primary' | 'warning' | 'danger' | 'neutral'> }> = {
  confirmed: { verb: 'Sent to', label: 'Confirmed', tone: 'primary' },
  pending: { verb: 'Sending to', label: 'Pending', tone: 'warning' },
  unknown: { verb: 'Payment to', label: 'Unconfirmed', tone: 'neutral' },
  failed: { verb: 'Payment to', label: 'Failed', tone: 'danger' },
};

/**
 * Merges the pending slot into the stored list.
 * @param items Finished payments, newest first.
 * @param pending Pending-slot status.
 * @returns Rows to render, newest first, without duplicate hashes.
 */
function toRows(items: ActivityTx[], pending: PendingStatus): Row[] {
  if (pending.kind !== 'pending' && pending.kind !== 'unknown') return items;
  const { hash, to, toName, amountWei, sentAt } = pending.tx;
  if (items.some((t) => t.hash === hash)) return items;
  return [{ hash, to, ...(toName ? { toName } : {}), amountWei, at: sentAt, status: pending.kind }, ...items];
}

/**
 * One payment row.
 * @param props.row Payment.
 * @param props.divider Hairline above the row.
 * @returns A pressable list row.
 */
function ActivityRow({ row, divider }: { row: Row; divider: boolean }) {
  const s = STATUS[row.status];
  const amount = `−${money(BigInt(row.amountWei))}`;
  const when = timeAgo(row.at);
  const who = row.toName ?? shortAddress(row.to);
  return (
    <ListRow
      icon="arrow-up-right"
      tone={s.tone}
      title={`${s.verb} ${who}`}
      subtitle={`${when} · ${s.label}`}
      divider={divider}
      accessibilityLabel={`${s.verb} ${who}, ${amount}, ${when}, ${s.label}. Opens explorer.`}
      onPress={() => void Linking.openURL(txUrl(NETWORK, row.hash))}
      trailing={
        <View style={styles.trailing}>
          <Text variant="amount" color={row.status === 'confirmed' ? 'text' : 'textTertiary'}>
            {amount}
          </Text>
          {row.status !== 'confirmed' ? <Pill label={s.label} tone={s.tone} /> : null}
        </View>
      }
    />
  );
}

/**
 * Payment list card.
 * @param props.items Finished payments, newest first; null while loading.
 * @param props.pending Pending-slot status, shown as the top row when in flight.
 * @param props.limit Show at most this many rows (default all).
 * @param props.emptyAction Optional button under the empty state.
 * @returns A card of rows, a loading card or an empty state.
 */
export function ActivityList({
  items,
  pending,
  limit,
  emptyAction,
}: {
  items: ActivityTx[] | null;
  pending: PendingStatus;
  limit?: number;
  emptyAction?: { label: string; onPress: () => void };
}) {
  const rows = items ? toRows(items, pending).slice(0, limit) : null;
  if (!rows) {
    return (
      <Card style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card style={styles.empty}>
        <UsdcMark size={48} />
        <Text variant="headline" align="center">
          No payments yet
        </Text>
        <Text variant="callout" color="textSecondary" align="center">
          Payments you confirm from the beam show up here.
        </Text>
        {emptyAction ? (
          <Button size="sm" variant="secondary" label={emptyAction.label} onPress={emptyAction.onPress} style={styles.emptyAction} />
        ) : null}
      </Card>
    );
  }
  return (
    <Card style={styles.list}>
      {rows.map((row, i) => (
        <ActivityRow key={row.hash} row={row} divider={i > 0} />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { paddingVertical: space.xs },
  trailing: { alignItems: 'flex-end', gap: space.xs },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl, paddingHorizontal: space.xxl },
  emptyAction: { marginTop: space.sm },
});
