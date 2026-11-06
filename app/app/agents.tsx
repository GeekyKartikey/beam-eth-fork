/**
 * @file Agents screen: connect an AI agent to Beam over MCP, and the one rule
 * that governs it — every agent payment needs this human's World ID approval.
 *
 * Read-only and additive on Beam's real flow (MCP server + World ID approvals
 * + BeamPay on Arc). No agent registry: the MCP server is stdio/local, so the
 * connection method is the command below, not a URL. The World ID state is the
 * same onchain signal Security uses (`BeamPayAccount.linked`), not the server
 * mode, so it never contradicts a wallet that is already linked.
 */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { AgentAvatar } from '../src/components/AgentAvatar';
import { AGENT_BRANDS } from '../src/components/agentLogos';
import { Icon } from '../src/components/Icon';
import { Screen } from '../src/components/Screen';
import { useCopy } from '../src/components/useCopy';
import { Card, ListRow, Pill, SectionHeader, Text } from '../src/components/ui';
import { useBeamPayAccount, useWallet } from '../src/hooks';
import { colors, radius, space } from '../src/theme';

/** How an agent connects: Beam's MCP server runs locally over stdio. */
const MCP_COMMAND = 'cd server && npm run mcp';

/**
 * Agents screen.
 * @returns The full-page screen, pushed from Profile.
 */
export default function AgentsScreen() {
  const { address } = useWallet();
  const account = useBeamPayAccount(address);
  const linked = account.value?.linked ?? false;
  const { copied, copy } = useCopy();

  const header = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={space.md}
        onPress={() => router.back()}
        style={({ pressed }) => [styles.back, pressed && styles.pressed]}
      >
        <Icon name="chevron-left" size={24} color={colors.text} />
      </Pressable>
      <Text variant="headline">Agents</Text>
      {linked ? <Pill label="World ID linked" tone="success" dot /> : <View style={styles.back} />}
    </View>
  );

  return (
    <Screen header={header}>
      <Text variant="callout" color="textSecondary" style={styles.lede}>
        Let an AI agent request payments. USDC settles on Arc, World ID approves, ENS names resolve.
      </Text>

      <View style={styles.section}>
        <SectionHeader title="Works with" />
        <Card>
          <View style={styles.brands}>
            {AGENT_BRANDS.map((b) => (
              <View key={b.id} style={styles.brand}>
                <AgentAvatar name={b.label} size={48} />
                <Text variant="caption" color="textSecondary" numberOfLines={1}>
                  {b.label}
                </Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Setup" />
        <Card>
          <Text variant="caption" color="textSecondary" style={styles.setupNote}>
            Run Beam's MCP server, then add it to your agent (Claude Desktop, Codex, Cursor).
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Command copied' : `Copy command ${MCP_COMMAND}`}
            onPress={() => void copy(MCP_COMMAND)}
            style={({ pressed }) => [styles.code, pressed && styles.pressed]}
          >
            <Text variant="mono" style={styles.codeText} numberOfLines={1}>
              {MCP_COMMAND}
            </Text>
            <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? colors.success : colors.textTertiary} />
          </Pressable>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="World ID" />
        <Card>
          <ListRow
            icon="shield"
            tone={linked ? 'success' : 'neutral'}
            title={linked ? 'World ID linked' : 'Set up World ID'}
            subtitle={
              linked
                ? 'Every agent payment needs your approval here.'
                : 'Link once in Profile; then every agent payment needs your approval.'
            }
            onPress={linked ? undefined : () => router.navigate('/profile')}
            trailing={linked ? <Icon name="check-circle" size={20} color={colors.success} /> : undefined}
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.xs,
    paddingBottom: space.sm,
  },
  back: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  lede: { marginTop: space.xs },
  section: { gap: space.xs },
  brands: { flexDirection: 'row', flexWrap: 'wrap', rowGap: space.lg, columnGap: space.sm },
  brand: { width: '25%', alignItems: 'center', gap: space.xs },
  setupNote: { marginBottom: space.sm },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  codeText: { flex: 1 },
});
