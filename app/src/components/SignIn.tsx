/**
 * @file Full-screen sign-in shown instead of the tabs while signed out.
 * Three calm views with a short fade-and-slide between
 * them: welcome, email, then the 6-digit Privy email code (auto-submits, with
 * a resend countdown and Privy's error reason surfaced). Hardware back steps
 * back through the views.
 */
import { Feather } from '@expo/vector-icons';
import { useLoginWithEmail } from '@privy-io/expo';
import * as Haptics from 'expo-haptics';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NETWORK } from '../config';
import { colors, fonts, HIT, radius, space, type as typeScale } from '../theme';
import { BrandMark } from './BrandMark';
import { NetworkMark } from './NetworkPill';
import { Button, Text } from './ui';

/** Network brand without the "Testnet" suffix, e.g. "Arc". */
const NETWORK_BRAND = NETWORK.name.replace(/\s*Testnet$/, '');
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;
const TRANSITION_MS = 240;

type Step = 'welcome' | 'email' | 'code';

/**
 * Appends Privy's reason to a sign-in error, so config problems (wrong client
 * ID, app identifier not allowed) are visible instead of a generic message.
 * @param summary User-facing summary.
 * @param e Whatever the Privy call threw.
 * @returns e.g. "Couldn't send the code. Invalid app client ID".
 */
function withCause(summary: string, e: unknown): string {
  const cause = e instanceof Error ? e.message.replace(/^\[[^\]]*\]\s*[^:]*:\s*/, '').split('\n')[0].slice(0, 140) : '';
  return cause ? `${summary} ${cause}` : summary;
}

/**
 * Inline error line.
 * @param props.text Message.
 * @returns Red caption with an icon, announced politely.
 */
function FieldError({ text }: { text: string }) {
  return (
    <View style={styles.inline} accessibilityLiveRegion="polite">
      <Feather name="alert-circle" size={14} color={colors.danger} style={styles.inlineIcon} />
      <Text variant="caption" color="danger" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Top-left back chevron with a 48-pt target, aligned to the text gutter.
 * @param props.onPress Goes to the previous view.
 * @returns The button.
 */
function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
    >
      <Feather name="chevron-left" size={26} color={colors.text} />
    </Pressable>
  );
}

/**
 * Title and one supporting line at the top of the email and code views.
 * @param props.title Screen title, announced as a header.
 * @param props.children Subtitle content.
 * @returns The heading block.
 */
function Heading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.heading}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" color="textSecondary">
        {children}
      </Text>
    </View>
  );
}

/**
 * Six digit boxes driven by one transparent TextInput laid over them, so
 * paste and SMS/email autofill work like a normal field.
 * @param props.value Digits typed so far.
 * @param props.onChange New digits (non-digits stripped, max 6).
 * @param props.invalid Shows the boxes in the error color.
 * @returns The code field.
 */
function CodeBoxes({ value, onChange, invalid }: { value: string; onChange: (v: string) => void; invalid: boolean }) {
  const [focused, setFocused] = useState(true);
  return (
    <View style={styles.boxes}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const active = focused && i === Math.min(value.length, CODE_LENGTH - 1);
        return (
          <View
            key={i}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
            style={[styles.box, value[i] ? styles.boxFilled : null, active && styles.boxActive, invalid && styles.boxError]}
          >
            <Text variant="title" style={styles.digit}>
              {value[i] ?? ''}
            </Text>
          </View>
        );
      })}
      <TextInput
        value={value}
        onChangeText={(raw) => onChange(raw.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH}
        autoFocus
        caretHidden
        accessibilityLabel="6-digit code"
        style={styles.hiddenInput}
      />
    </View>
  );
}

/**
 * Tracks the on-screen keyboard height. Used instead of KeyboardAvoidingView,
 * which keeps stale bottom padding after the keyboard hides on Android
 * edge-to-edge (the welcome view ended up shifted up).
 * @returns Keyboard height in dp, 0 while hidden.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/**
 * Signed-out screen: welcome, email and code views.
 * @returns The full-screen sign-in flow.
 */
export function SignIn() {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { sendCode, loginWithCode, state } = useLoginWithEmail();
  const [view, setView] = useState<Step>('welcome');
  /** 1 slides the next view in from the right, -1 from the left, 0 just fades (first render). */
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const sending = state.status === 'sending-code';
  const verifying = state.status === 'submitting-code';
  const emailValid = EMAIL.test(email.trim());

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const go = (next: Step, dir: -1 | 1) => {
    setDirection(dir);
    setView(next);
    setError(null);
  };

  const back = () => {
    if (view === 'code') {
      setCode('');
      go('email', -1);
    } else if (view === 'email') {
      go('welcome', -1);
    }
  };

  // Android back steps through the views instead of leaving the app.
  useEffect(() => {
    if (view === 'welcome') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      back();
      return true;
    });
    return () => sub.remove();
  });

  const requestCode = async () => {
    const address = email.trim();
    if (!EMAIL.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    try {
      await sendCode({ email: address });
      setCode('');
      setCooldown(RESEND_SECONDS);
      if (view !== 'code') go('code', 1);
    } catch (e) {
      setError(withCause("Couldn't send the code.", e));
    }
  };

  const submitCode = async (value: string) => {
    setError(null);
    try {
      await loginWithCode({ code: value, email: email.trim() });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setCode('');
      setError(withCause("That code didn't work. Check it or send a new one.", e));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const onCodeChange = (digits: string) => {
    setCode(digits);
    if (digits.length > 0) setError(null);
    if (digits.length === CODE_LENGTH) void submitCode(digits);
  };

  let content: ReactNode;
  if (view === 'welcome') {
    content = (
      <>
        <View style={styles.hero}>
          <BrandMark size={72} />
          <View style={styles.heroText}>
            <Text variant="display" accessibilityRole="header" align="center">
              Beam
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              Pay anyone on your screen.
            </Text>
          </View>
        </View>
        <View style={styles.footer}>
          <Button label="Continue with email" onPress={() => go('email', 1)} />
          <View style={styles.builtOn} accessible accessibilityLabel={`Built on ${NETWORK_BRAND}`}>
            <Text variant="caption" color="textTertiary">
              Built on
            </Text>
            <NetworkMark size={12} />
            <Text variant="captionStrong" color="textSecondary">
              {NETWORK_BRAND}
            </Text>
          </View>
        </View>
      </>
    );
  } else if (view === 'email') {
    content = (
      <>
        <BackButton onPress={back} />
        <Heading title="What's your email?">{"We'll send you a code to sign in."}</Heading>
        <TextInput
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (error) setError(null);
          }}
          onFocus={() => setEmailFocused(true)}
          onBlur={() => setEmailFocused(false)}
          placeholder="name@example.com"
          placeholderTextColor={colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          autoFocus
          returnKeyType="go"
          onSubmitEditing={() => void requestCode()}
          accessibilityLabel="Email address"
          style={[styles.field, emailFocused && styles.fieldFocused, error ? styles.fieldError : null]}
        />
        {error ? <FieldError text={error} /> : null}
        <Button label="Continue" loading={sending} disabled={!emailValid} onPress={() => void requestCode()} style={styles.pinned} />
      </>
    );
  } else {
    content = (
      <>
        <BackButton onPress={back} />
        <Heading title="Enter the code">
          Sent to{' '}
          <Text variant="bodyStrong" color="text">
            {email.trim()}
          </Text>
        </Heading>
        <CodeBoxes value={code} onChange={onCodeChange} invalid={!!error} />
        {error ? <FieldError text={error} /> : null}
        {verifying ? (
          <View style={styles.inline} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="caption" color="textSecondary">
              Signing in…
            </Text>
          </View>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          label={cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          disabled={cooldown > 0 || sending || verifying}
          onPress={() => void requestCode()}
          style={styles.resend}
        />
      </>
    );
  }

  const entering = (direction === 0 ? FadeIn : direction > 0 ? FadeInRight : FadeInLeft).duration(TRANSITION_MS);

  return (
    <View style={styles.screen}>
      <Animated.View
        key={view}
        entering={entering}
        // Edge-to-edge Android reports the keyboard height without the nav-bar inset beneath it, so both pad the bottom.
        style={[styles.page, { paddingTop: insets.top + space.sm, paddingBottom: keyboard + insets.bottom + space.lg }]}
      >
        {content}
      </Animated.View>
    </View>
  );
}

const BOX_HEIGHT = 60;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  page: { flex: 1, paddingHorizontal: space.xl, gap: space.xl },
  flex: { flex: 1 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xxl },
  heroText: { alignItems: 'center', gap: space.sm },
  footer: { gap: space.lg },
  builtOn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs + 1 },
  back: {
    width: HIT,
    height: HIT,
    marginLeft: -space.md,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: { backgroundColor: colors.surfaceMuted },
  heading: { gap: space.sm },
  field: {
    ...typeScale.headline,
    fontFamily: fonts.regular,
    minHeight: HIT + space.sm,
    paddingHorizontal: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  fieldFocused: { borderColor: colors.primary },
  fieldError: { borderColor: colors.danger },
  pinned: { marginTop: 'auto' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: -space.sm },
  inlineIcon: { alignSelf: 'flex-start', marginTop: space.xxs },
  boxes: { flexDirection: 'row', gap: space.sm },
  box: {
    flex: 1,
    height: BOX_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: colors.borderStrong },
  boxActive: { borderColor: colors.primary, borderWidth: 1.5 },
  boxError: { borderColor: colors.danger },
  digit: { fontVariant: ['tabular-nums'] },
  // Covers the boxes so taps, paste and autofill reach the real input; invisible.
  hiddenInput: { ...StyleSheet.absoluteFillObject, opacity: 0, color: 'transparent' },
  resend: { alignSelf: 'flex-start', marginLeft: -space.md },
});
