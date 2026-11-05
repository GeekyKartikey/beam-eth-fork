/**
 * @file Ask sheet: opened by the beam via `bubbleagent://ask?ctx=<id>`
 * over whatever app the user was in (the activity is translucent), and by an
 * external agent's payment link `bubbleagent://review?p=<base64url>`.
 *
 * On mount it consumes the screen context once (or decodes the review link),
 * gates on the Privy session and resumes any pending payment. A review link is
 * untrusted: its payment is rebuilt with `prepareTransfer` (origin `mcp`, so it
 * always needs World ID approval). Dismissing (scrim, close, hardware back)
 * aborts the in-flight request, resets the stack to the Wallet tab and moves
 * the task to back.
 */
import { Feather } from '@expo/vector-icons';
import type { NavigationProp, ParamListBase } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BubbleOverlay } from '../modules/bubble-overlay';
import { planTurn, type AgentContext, type AgentErrorKind, type ChatTurn, type Clarification } from '../src/agentApi';
import { decodeReviewLink, type ReviewLinkPayload } from '../src/api';
import { PendingBanner, SetupBanner } from '../src/components/Banner';
import { BrandMark } from '../src/components/BrandMark';
import { ContextChip, type CapturedContext, type ContextState } from '../src/components/ContextChip';
import { IntentCard } from '../src/components/IntentCard';
import { MessageBubble, NoticeRow, TypingIndicator } from '../src/components/MessageBubble';
import { NetworkPill } from '../src/components/NetworkPill';
import { SuggestionChip } from '../src/components/SuggestionChip';
import { Button, Text, type IconName } from '../src/components/ui';
import { chipLabel } from '../src/fallbackParser';
import { usePendingTx, useServerStatus, useWallet } from '../src/hooks';
import { isTransferError, type Intent } from '../src/intent';
import { getLimitState } from '../src/limits';
import { prepareOnDevice } from '../src/prepare';
import { colors, HIT, radius, shadow, space, type as typeScale } from '../src/theme';

/** Same cap the screen reader applies; clipboard text is held to it too. */
const MAX_CONTEXT_CHARS = 4000;
const MAX_INPUT_CHARS = 500;
/** Visual size of the header close button; `hitSlop` pads it to a 48-pt target. */
const CLOSE = 36;

const QUICK_ACTIONS: { label: string; icon: IconName }[] = [
  { label: 'Pay this', icon: 'send' },
  { label: 'What is this address?', icon: 'search' },
  { label: 'My balance', icon: 'pie-chart' },
];

/** Icon for each reason the agent couldn't be used. */
const NOTICE_ICON: Record<AgentErrorKind, IconName> = {
  auth: 'lock',
  mismatch: 'alert-triangle',
  offline: 'wifi-off',
  'bad-response': 'wifi-off',
};

/** How an external agent's context is labelled on the device. */
const EXTERNAL_AGENT = 'External agent';

type Turn =
  | { id: string; kind: 'user'; text: string }
  | { id: string; kind: 'assistant'; text: string; intents: Intent[]; clarification: Clarification | null }
  | { id: string; kind: 'notice'; text: string; tone: 'warning' | 'danger'; icon: IconName };

/**
 * Runs a native call that may be missing (Expo Go, iOS) or throw.
 * @param fn The call.
 * @param fallback Value on failure.
 * @returns The call's result or the fallback.
 */
function tryNative<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Consumes the captured screen context. The native store returns it once, then deletes it.
 * @param ctxId `ctx` deep-link param.
 * @returns Chip state.
 */
function consumeContext(ctxId: string | undefined): ContextState {
  const captured = ctxId ? tryNative(() => BubbleOverlay?.consumeScreenContext(ctxId) ?? null, null) : null;
  if (!captured) {
    return { kind: 'unavailable', accessibilityOn: tryNative(() => BubbleOverlay?.isAccessibilityEnabled() ?? false, false) };
  }
  const appLabel = captured.appLabel || captured.packageName;
  if (!captured.text.trim()) return { kind: 'empty', appLabel };
  return {
    kind: 'captured',
    ctx: {
      source: 'screen',
      appLabel,
      packageName: captured.packageName,
      text: captured.text.slice(0, MAX_CONTEXT_CHARS),
      capturedAt: captured.capturedAt,
      truncated: captured.truncated || captured.text.length > MAX_CONTEXT_CHARS,
    },
  };
}

/**
 * Context chip state for an external agent's payment link.
 * @param payload Decoded link.
 * @returns A captured "clipboard" context labelled "External agent".
 */
function reviewContext(payload: ReviewLinkPayload): ContextState {
  return {
    kind: 'captured',
    ctx: { source: 'clipboard', appLabel: EXTERNAL_AGENT, text: payload.context, capturedAt: Date.now(), truncated: false },
  };
}

/**
 * Request-shaped context (drops UI-only fields so a strict server schema accepts it).
 * @param c Captured context.
 * @returns The `context` object of the agent request.
 */
function toAgentContext(c: CapturedContext): AgentContext {
  return {
    source: c.source,
    appLabel: c.appLabel,
    text: c.text,
    capturedAt: c.capturedAt,
    ...(c.packageName ? { packageName: c.packageName } : {}),
  };
}

/**
 * Chat history for the agent: user and assistant text only, no notices.
 * @param turns Sheet turns.
 * @returns Chat turns, oldest first.
 */
function toChat(turns: Turn[]): ChatTurn[] {
  return turns.flatMap((t): ChatTurn[] =>
    t.kind === 'user' ? [{ role: 'user', text: t.text }] : t.kind === 'assistant' && t.text ? [{ role: 'assistant', text: t.text }] : [],
  );
}

/**
 * Route component. Collapses the stack to this route so no opaque screen sits
 * under the sheet: on a warm start expo-router's linking dispatches a NAVIGATE
 * that pushes `ask` over `index`; on a cold start the state is already `[ask]`.
 * @returns The sheet, remounted per capture so a new tap starts a fresh session.
 */
export default function AskRoute() {
  const { ctx, p } = useLocalSearchParams<{ ctx?: string; p?: string }>();
  const navigation = useNavigation<NavigationProp<ParamListBase>>();

  useEffect(() => {
    const state = navigation.getState();
    if (state && state.routes.length > 1) navigation.reset({ ...state, index: 0, routes: [state.routes[state.index]] });
  }, [navigation]);

  const ctxId = typeof ctx === 'string' && ctx ? ctx : undefined;
  const review = typeof p === 'string' ? p : undefined;
  return <AskSheet key={review ?? ctxId ?? 'none'} ctxId={ctxId} review={review} />;
}

/**
 * The bottom sheet.
 * @param props.ctxId Screen-context ID from the beam's deep link.
 * @param props.review `p` of an external agent's review link, if opened by one.
 * @returns Scrim plus sheet.
 */
function AskSheet({ ctxId, review }: { ctxId: string | undefined; review: string | undefined }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { ready, user, wallet, address } = useWallet();
  const pending = usePendingTx();
  const server = useServerStatus();
  const [payload] = useState(() => (review === undefined ? null : decodeReviewLink(review)));
  const [context, setContext] = useState<ContextState>(() => (payload ? reviewContext(payload) : consumeContext(ctxId)));
  const [excluded, setExcluded] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);

  useEffect(() => {
    Animated.spring(progress, { toValue: 1, damping: 26, stiffness: 260, overshootClamping: true, useNativeDriver: true }).start();
    return () => abortRef.current?.abort();
  }, [progress]);

  const dismiss = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    abortRef.current?.abort();
    Animated.timing(progress, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      router.replace('/');
      tryNative(() => BubbleOverlay?.minimizeApp(), undefined);
    });
  }, [progress]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      dismiss();
      return true;
    });
    return () => sub.remove();
  }, [dismiss]);

  // An external agent's payment: rebuild it on the device once the wallet is ready.
  const reviewed = useRef(false);
  useEffect(() => {
    if (review === undefined || !address || reviewed.current) return;
    reviewed.current = true;
    if (!payload) {
      setTurns([{ id: randomUUID(), kind: 'notice', text: 'This payment link is invalid.', tone: 'danger', icon: 'alert-octagon' }]);
      return;
    }
    void (async () => {
      setBusy(true);
      const result = await getLimitState()
        .then((limits) =>
          prepareOnDevice({
            id: payload.intentId,
            to: payload.to,
            amount: payload.amount,
            wallet: address,
            remainingWei: limits.remainingWei,
            context: { source: 'clipboard', appLabel: EXTERNAL_AGENT, text: payload.context },
            userTexts: [],
            parsedBy: 'agent',
            origin: 'mcp',
          }),
        )
        .catch(() => null);
      setBusy(false);
      const turn: Turn =
        result && !isTransferError(result)
          ? { id: randomUUID(), kind: 'assistant', text: 'An outside agent asked for this payment. Check every detail.', intents: [result], clarification: null }
          : { id: randomUUID(), kind: 'notice', text: result?.message ?? 'Something went wrong. Try again.', tone: 'danger', icon: 'alert-circle' };
      setTurns([turn]);
    })();
  }, [review, payload, address]);

  const readClipboard = async () => {
    setClipboardError(null);
    const text = await Clipboard.hasStringAsync()
      .then((has) => (has ? Clipboard.getStringAsync() : ''))
      .catch(() => '');
    if (!text.trim()) {
      setClipboardError('Clipboard is empty.');
      return;
    }
    void Haptics.selectionAsync();
    setExcluded(false);
    setContext({
      kind: 'captured',
      ctx: {
        source: 'clipboard',
        appLabel: 'Clipboard',
        text: text.slice(0, MAX_CONTEXT_CHARS),
        capturedAt: Date.now(),
        truncated: text.length > MAX_CONTEXT_CHARS,
      },
    });
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy || !address) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');
    const history: Turn[] = [...turns, { id: randomUUID(), kind: 'user', text }];
    setTurns(history);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const outcome = await planTurn({
        history: toChat(history),
        context: context.kind === 'captured' && !excluded ? toAgentContext(context.ctx) : null,
        wallet: address,
        limits: await getLimitState(),
        signal: controller.signal,
      });
      const added: Turn[] = [];
      if (outcome.notice) {
        const { kind, text, tone } = outcome.notice;
        added.push({ id: randomUUID(), kind: 'notice', text, tone, icon: NOTICE_ICON[kind] });
      }
      const reply = [...new Set([outcome.reply, outcome.clarification?.question ?? ''])].filter(Boolean).join('\n\n');
      if (reply || outcome.intents.length) {
        added.push({ id: randomUUID(), kind: 'assistant', text: reply, intents: outcome.intents, clarification: outcome.clarification });
      }
      setTurns((t) => [...t, ...added]);
    } catch {
      if (!controller.signal.aborted) {
        setTurns((t) => [
          ...t,
          { id: randomUUID(), kind: 'notice', text: 'Something went wrong. Try again.', tone: 'danger', icon: 'alert-circle' },
        ]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const lastTurn = turns[turns.length - 1];
  const canSend = !!input.trim() && !busy;
  // A review card is tall; give the sheet more room once one is on screen.
  const hasIntent = turns.some((t) => t.kind === 'assistant' && t.intents.length > 0);

  let body: ReactNode;
  if (!ready || (user && !address)) {
    body = (
      <View style={styles.gate}>
        <ActivityIndicator color={colors.primary} />
        <Text variant="callout" color="textSecondary">
          {ready ? 'Setting up your wallet…' : 'Loading…'}
        </Text>
      </View>
    );
  } else if (!user || !address) {
    body = (
      <View style={styles.gate}>
        <BrandMark size={56} />
        <View style={styles.gateText}>
          <Text variant="title" align="center">
            Sign in to Beam first.
          </Text>
          <Text variant="callout" color="textSecondary" align="center">
            Sign in once with your email, then tap the beam in any app.
          </Text>
        </View>
        <Button label="Open Beam" icon="arrow-right" onPress={() => router.replace('/')} style={styles.gateButton} />
      </View>
    );
  } else {
    body = (
      <>
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <SetupBanner server={server} />
          <PendingBanner status={pending.status} onRecheck={() => void pending.recheck()} />
          <ContextChip
            state={context}
            excluded={excluded}
            onExcludedChange={setExcluded}
            onUseClipboard={() => void readClipboard()}
            clipboardError={clipboardError}
          />
          {turns.length === 0 && review === undefined ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={styles.quickScroll}
              contentContainerStyle={styles.quick}
            >
              {QUICK_ACTIONS.map((a) => (
                <SuggestionChip key={a.label} label={a.label} icon={a.icon} onPress={() => void send(a.label)} />
              ))}
            </ScrollView>
          ) : null}
          {turns.map((turn) => {
            if (turn.kind === 'user') return <MessageBubble key={turn.id} role="user" text={turn.text} />;
            if (turn.kind === 'notice') return <NoticeRow key={turn.id} text={turn.text} tone={turn.tone} icon={turn.icon} />;
            const showChips = turn === lastTurn && !busy && !!turn.clarification?.options.length;
            return (
              <View key={turn.id} style={styles.turn}>
                {turn.text ? <MessageBubble role="assistant" text={turn.text} /> : null}
                {turn.intents.map((intent) => (
                  <IntentCard
                    key={`${turn.id}:${intent.id}`}
                    intent={intent}
                    wallet={wallet}
                    address={address}
                    onSettled={() => void pending.recheck()}
                  />
                ))}
                {showChips ? (
                  <View style={styles.chips}>
                    {turn.clarification?.options.map((option) => (
                      <SuggestionChip
                        key={option}
                        label={chipLabel(option)}
                        mono={option.startsWith('0x')}
                        accessibilityLabel={option}
                        onPress={() => void send(option)}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
          {busy ? <TypingIndicator /> : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask or say “pay this”"
            placeholderTextColor={colors.textTertiary}
            maxLength={MAX_INPUT_CHARS}
            returnKeyType="send"
            onSubmitEditing={() => void send(input)}
            accessibilityLabel="Message to Beam"
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend, busy }}
            disabled={!canSend}
            onPress={() => void send(input)}
            style={({ pressed }) => [styles.send, pressed && styles.sendPressed, !canSend && styles.sendDisabled]}
          >
            <Feather name="arrow-up" size={20} color={colors.textInverse} />
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} accessibilityRole="button" accessibilityLabel="Close Beam" />
      </Animated.View>
      <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              maxHeight: hasIntent ? '85%' : '75%',
              paddingBottom: insets.bottom + space.md,
              transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }],
            },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <BrandMark size={28} />
            <Text variant="headline" accessibilityRole="header">
              Beam
            </Text>
            <NetworkPill />
            <View style={styles.flex} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={(HIT - CLOSE) / 2}
              onPress={dismiss}
              style={({ pressed }) => [styles.close, pressed && styles.closePressed]}
            >
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
          {body}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrim: { backgroundColor: colors.scrim },
  kav: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    flexShrink: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingTop: space.sm,
    ...shadow.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: colors.borderStrong,
    marginBottom: space.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm + 2,
    paddingHorizontal: space.xl,
    paddingBottom: space.md,
  },
  flex: { flex: 1 },
  close: {
    width: CLOSE,
    height: CLOSE,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePressed: { backgroundColor: colors.border },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: space.xl, paddingTop: space.xs, paddingBottom: space.lg, gap: space.md },
  quickScroll: { marginHorizontal: -space.xl, flexGrow: 0 },
  quick: { paddingHorizontal: space.xl, gap: space.sm },
  turn: { gap: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    ...typeScale.body,
    flex: 1,
    minHeight: HIT,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
  },
  send: {
    width: HIT,
    height: HIT,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendPressed: { backgroundColor: colors.primaryPressed },
  sendDisabled: { backgroundColor: colors.primarySoftBorder },
  gate: { alignItems: 'center', gap: space.lg, paddingHorizontal: space.xxl, paddingTop: space.xl, paddingBottom: space.xxl },
  gateText: { alignItems: 'center', gap: space.sm },
  gateButton: { alignSelf: 'stretch', marginTop: space.sm },
});
