/**
 * @file "Receive" bottom sheet: the Beam handle as the title when claimed, a QR
 * of the handle (or the address) with the brand mark in the middle, the full
 * grouped address, and Copy / Share actions.
 */
import { Share, StyleSheet, View } from 'react-native';
import QRCodeStyled from 'react-native-qrcode-styled';
import type { Address } from 'viem';
import { NETWORK } from '../config';
import { colors, radius, space } from '../theme';
import { AddressText } from './AddressText';
import { BrandMark } from './BrandMark';
import { Sheet } from './Sheet';
import { Button, Pill, Text } from './ui';
import { useCopy } from './useCopy';

/** QR module size in pt; an address at the default level M is 29 modules (~203 pt), a handle fewer. */
const PIECE = 7;
/** Logo backing; ~3% of the code's area, well inside level M's 15% error correction. */
const LOGO = 36;

/**
 * Receive sheet.
 * @param props.address Wallet address to show and share.
 * @param props.handle Beam handle (the full name the server registered), or null/undefined when none.
 * @param props.visible Whether the sheet is open.
 * @param props.onClose Closes the sheet.
 * @returns The sheet.
 */
export function ReceiveSheet({
  address,
  handle,
  visible,
  onClose,
}: {
  address: Address;
  handle: string | null | undefined;
  visible: boolean;
  onClose: () => void;
}) {
  const { copied, copy } = useCopy();

  return (
    <Sheet visible={visible} onClose={onClose} title={handle ?? `Receive ${NETWORK.symbol}`}>
      <View style={styles.body}>
        <Pill label={`${NETWORK.name} only`} tone="primary" dot />
        <View
          style={styles.qrFrame}
          accessible
          accessibilityRole="image"
          accessibilityLabel={handle ? `QR code of your handle ${handle}` : 'QR code of your wallet address'}
        >
          <QRCodeStyled
            data={handle ?? address}
            pieceSize={PIECE}
            pieceBorderRadius={PIECE / 3}
            isPiecesGlued
            color={colors.ink}
            outerEyesOptions={{ borderRadius: PIECE * 2, color: colors.primary }}
            innerEyesOptions={{ borderRadius: PIECE, color: colors.ink }}
          />
          <View style={styles.logo} pointerEvents="none">
            <BrandMark size={LOGO - space.sm} />
          </View>
        </View>
        <View style={styles.address}>
          <AddressText address={address} align="center" />
        </View>
        <Text variant="caption" color="textSecondary" align="center">
          {handle ? 'Share your handle or address. ' : ''}Only send {NETWORK.symbol} on {NETWORK.name}.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon={copied ? 'check' : 'copy'}
          label={copied ? 'Copied' : 'Copy'}
          accessibilityLabel={copied ? 'Address copied' : 'Copy address'}
          onPress={() => void copy(address)}
          style={styles.action}
        />
        <Button
          icon="share-2"
          label="Share"
          accessibilityLabel={handle ? 'Share handle and address' : 'Share address'}
          onPress={() => void Share.share({ message: handle ? `${handle}\n${address}` : address })}
          style={styles.action}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: space.lg },
  qrFrame: {
    padding: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    position: 'absolute',
    width: LOGO,
    height: LOGO,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  address: {
    alignSelf: 'stretch',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  actions: { flexDirection: 'row', gap: space.md },
  action: { flex: 1 },
});
