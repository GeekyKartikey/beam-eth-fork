/**
 * @file Scam Shield UI: the verdict panel inside the review card and the
 * standalone "Safety check" card for "Is this safe?".
 *
 * All copy lives here, keyed by fixed signal and warning codes, so nothing on
 * the captured screen or from the model can write what the user reads.
 */
import { Icon } from './Icon';
import { Pressable, StyleSheet, View } from 'react-native';
import type { IntentWarning } from '../intent';
import type { Assessment, RiskLevel, RiskSignal } from '../risk';
import { colors, HIT, radius, space, type ColorToken } from '../theme';
import { speak, verdictSpeech } from '../voice';
import { Card, Text, type IconName } from './ui';

const LEVEL: Record<RiskLevel, { title: string; icon: IconName; fg: ColorToken; bg: string }> = {
  safe: { title: 'Looks safe', icon: 'check-circle', fg: 'success', bg: colors.successSoft },
  caution: { title: 'Be careful', icon: 'alert-triangle', fg: 'warning', bg: colors.warningSoft },
  scam: { title: 'Likely scam', icon: 'alert-octagon', fg: 'danger', bg: colors.dangerSoft },
};

/** What to do next, per level. Shown on the Safety check card. */
const ADVICE: Record<RiskLevel, string> = {
  safe: 'No common scam signs found. Still pay only people you know.',
  caution: 'Check with the sender another way, such as a call, before you pay.',
  scam: "Don't pay, share a code or install anything this message asks for.",
};

export const SIGNAL_COPY: Record<RiskSignal, string> = {
  CREDENTIAL_REQUEST: 'Asks for an OTP, PIN, password or recovery phrase.',
  REMOTE_ACCESS: 'Asks you to install an app or share your screen.',
  PAY_TO_RECEIVE: 'Asks you to pay first to receive money.',
  TOO_GOOD_TO_BE_TRUE: 'Promises a prize, airdrop or guaranteed returns.',
  URGENCY: 'Pushes you to act fast or threatens to block an account.',
  IMPERSONATION: 'Claims to be a bank, support team or official.',
  SUSPICIOUS_LINK: 'Has a shortened or disguised link.',
};

/** Plain-language copy for each payment warning. */
export const WARNING_COPY: Record<IntentWarning, string> = {
  NEW_RECIPIENT: 'First payment to this address. Check it matches what you saw.',
  RECIPIENT_IS_CONTRACT: 'This address is a contract. You may not be able to get the money back.',
  SELF_TRANSFER: 'This payment goes to your own wallet.',
  AMOUNT_NOT_IN_CONTEXT: 'This amount was not on the screen or in your message.',
  PARSED_WITHOUT_AI: 'The agent was offline, so a basic parser read this. Check every detail before you send.',
  CLOSE_TO_DAILY_LIMIT: "This payment uses most of today's limit.",
  NAME_NOT_PRIMARY: "This address doesn't use the name as its primary name.",
  NAME_ADDRESS_CHANGED: 'This name pointed to a different address the last time you paid it.',
};

/**
 * Tinted verdict: icon and title, then one line per reason.
 * @param props.level Verdict level.
 * @param props.reasons Lines under the title, most serious first.
 * @returns The panel, announced as one alert.
 */
export function RiskPanel({ level, reasons }: { level: RiskLevel; reasons: string[] }) {
  const meta = LEVEL[level];
  return (
    <View
      style={[styles.panel, { backgroundColor: meta.bg }]}
      accessible
      accessibilityRole={level === 'safe' ? 'text' : 'alert'}
      accessibilityLabel={[meta.title, ...reasons].join('. ')}
    >
      <View style={styles.title}>
        <Icon name={meta.icon} size={18} color={colors[meta.fg]} />
        <Text variant="bodyStrong" color={meta.fg}>
          {meta.title}
        </Text>
      </View>
      {reasons.map((reason) => (
        <View key={reason} style={styles.reason}>
          <View style={[styles.bullet, { backgroundColor: colors[meta.fg] }]} />
          <Text variant="caption" color="text" style={styles.flex}>
            {reason}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Standalone answer to "Is this safe?": the verdict, its reasons and what to do.
 * @param props.assessment Screen verdict.
 * @returns A card.
 */
export function SafetyCard({ assessment }: { assessment: Assessment }) {
  const reasons = assessment.signals.map((s) => SIGNAL_COPY[s]);
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text variant="overline" color="textTertiary" accessibilityRole="header">
          Safety check
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Read this safety check aloud"
          onPress={() => speak(`${verdictSpeech(assessment, reasons)}. ${ADVICE[assessment.level]}`)}
          hitSlop={space.sm}
          style={({ pressed }) => [styles.speaker, pressed && styles.speakerPressed]}
        >
          <Icon name="volume-2" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>
      <RiskPanel level={assessment.level} reasons={reasons} />
      <Text variant="callout" color="text">
        {ADVICE[assessment.level]}
      </Text>
      <Text variant="caption" color="textTertiary">
        Based on what was on your screen when you tapped the beam. It can be wrong.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.md, padding: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 },
  speaker: { width: HIT - space.md, height: HIT - space.md, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  speakerPressed: { backgroundColor: colors.surfaceMuted },
  panel: { gap: space.sm, padding: space.md, borderRadius: radius.md },
  title: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingLeft: space.xxs },
  // Centered on the 17pt caption line.
  bullet: { width: 5, height: 5, borderRadius: 3, marginTop: 6, marginLeft: 6, marginRight: 3 },
  flex: { flex: 1 },
});
