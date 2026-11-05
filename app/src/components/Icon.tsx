/**
 * @file The app's icon set: Phosphor, imported one icon at a time so only these
 * ship in the bundle. Names are the app's own (kept from the old set, so call
 * sites read the same); each maps to the Phosphor glyph that fits it best.
 *
 * `weight="fill"` is for active and status states (the selected tab, a
 * verdict); everything else uses the default regular weight.
 */
import type { IconProps } from 'phosphor-react-native';
import type { ComponentType } from 'react';
import { View } from 'react-native';
import ArrowClockwise from 'phosphor-react-native/lib/module/icons/ArrowClockwise';
import ArrowDownLeft from 'phosphor-react-native/lib/module/icons/ArrowDownLeft';
import ArrowRight from 'phosphor-react-native/lib/module/icons/ArrowRight';
import ArrowSquareOut from 'phosphor-react-native/lib/module/icons/ArrowSquareOut';
import ArrowUp from 'phosphor-react-native/lib/module/icons/ArrowUp';
import ArrowUpRight from 'phosphor-react-native/lib/module/icons/ArrowUpRight';
import ArrowsOutCardinal from 'phosphor-react-native/lib/module/icons/ArrowsOutCardinal';
import BatteryCharging from 'phosphor-react-native/lib/module/icons/BatteryCharging';
import Bell from 'phosphor-react-native/lib/module/icons/Bell';
import BellSlash from 'phosphor-react-native/lib/module/icons/BellSlash';
import Calendar from 'phosphor-react-native/lib/module/icons/Calendar';
import CaretDown from 'phosphor-react-native/lib/module/icons/CaretDown';
import CaretLeft from 'phosphor-react-native/lib/module/icons/CaretLeft';
import CaretRight from 'phosphor-react-native/lib/module/icons/CaretRight';
import CaretUp from 'phosphor-react-native/lib/module/icons/CaretUp';
import ChartPieSlice from 'phosphor-react-native/lib/module/icons/ChartPieSlice';
import ChatCircleDots from 'phosphor-react-native/lib/module/icons/ChatCircleDots';
import Check from 'phosphor-react-native/lib/module/icons/Check';
import CheckCircle from 'phosphor-react-native/lib/module/icons/CheckCircle';
import ClipboardText from 'phosphor-react-native/lib/module/icons/ClipboardText';
import Clock from 'phosphor-react-native/lib/module/icons/Clock';
import ClockCounterClockwise from 'phosphor-react-native/lib/module/icons/ClockCounterClockwise';
import Copy from 'phosphor-react-native/lib/module/icons/Copy';
import DeviceMobile from 'phosphor-react-native/lib/module/icons/DeviceMobile';
import Drop from 'phosphor-react-native/lib/module/icons/Drop';
import Eye from 'phosphor-react-native/lib/module/icons/Eye';
import EyeSlash from 'phosphor-react-native/lib/module/icons/EyeSlash';
import Gear from 'phosphor-react-native/lib/module/icons/Gear';
import Globe from 'phosphor-react-native/lib/module/icons/Globe';
import HandTap from 'phosphor-react-native/lib/module/icons/HandTap';
import Info from 'phosphor-react-native/lib/module/icons/Info';
import Key from 'phosphor-react-native/lib/module/icons/Key';
import Lightning from 'phosphor-react-native/lib/module/icons/Lightning';
import Lock from 'phosphor-react-native/lib/module/icons/Lock';
import MagnifyingGlass from 'phosphor-react-native/lib/module/icons/MagnifyingGlass';
import Microphone from 'phosphor-react-native/lib/module/icons/Microphone';
import NotePencil from 'phosphor-react-native/lib/module/icons/NotePencil';
import PaperPlaneTilt from 'phosphor-react-native/lib/module/icons/PaperPlaneTilt';
import Plus from 'phosphor-react-native/lib/module/icons/Plus';
import Pulse from 'phosphor-react-native/lib/module/icons/Pulse';
import Question from 'phosphor-react-native/lib/module/icons/Question';
import Robot from 'phosphor-react-native/lib/module/icons/Robot';
import ShareNetwork from 'phosphor-react-native/lib/module/icons/ShareNetwork';
import ShieldCheck from 'phosphor-react-native/lib/module/icons/ShieldCheck';
import SignOut from 'phosphor-react-native/lib/module/icons/SignOut';
import SpeakerHigh from 'phosphor-react-native/lib/module/icons/SpeakerHigh';
import Stack from 'phosphor-react-native/lib/module/icons/Stack';
import UserCircle from 'phosphor-react-native/lib/module/icons/UserCircle';
import Wallet from 'phosphor-react-native/lib/module/icons/Wallet';
import Warning from 'phosphor-react-native/lib/module/icons/Warning';
import WarningCircle from 'phosphor-react-native/lib/module/icons/WarningCircle';
import WarningOctagon from 'phosphor-react-native/lib/module/icons/WarningOctagon';
import WifiSlash from 'phosphor-react-native/lib/module/icons/WifiSlash';
import X from 'phosphor-react-native/lib/module/icons/X';
import XCircle from 'phosphor-react-native/lib/module/icons/XCircle';
import Circle from 'phosphor-react-native/lib/module/icons/Circle';
import FileText from 'phosphor-react-native/lib/module/icons/FileText';
import GridFour from 'phosphor-react-native/lib/module/icons/GridFour';
import ListBullets from 'phosphor-react-native/lib/module/icons/ListBullets';
import UserMinus from 'phosphor-react-native/lib/module/icons/UserMinus';
import Wrench from 'phosphor-react-native/lib/module/icons/Wrench';

const ICONS = {
  circle: Circle,
  'file-text': FileText,
  grid: GridFour,
  list: ListBullets,
  tool: Wrench,
  'user-x': UserMinus,
  activity: Pulse,
  'alert-circle': WarningCircle,
  'alert-octagon': WarningOctagon,
  'alert-triangle': Warning,
  'arrow-down-left': ArrowDownLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-up-right': ArrowUpRight,
  'battery-charging': BatteryCharging,
  bell: Bell,
  'bell-off': BellSlash,
  calendar: Calendar,
  check: Check,
  'check-circle': CheckCircle,
  'chevron-down': CaretDown,
  'chevron-left': CaretLeft,
  'chevron-right': CaretRight,
  'chevron-up': CaretUp,
  clipboard: ClipboardText,
  clock: Clock,
  copy: Copy,
  cpu: Robot,
  'credit-card': Wallet,
  droplet: Drop,
  edit: NotePencil,
  'external-link': ArrowSquareOut,
  eye: Eye,
  'eye-off': EyeSlash,
  globe: Globe,
  'help-circle': Question,
  history: ClockCounterClockwise,
  info: Info,
  key: Key,
  layers: Stack,
  lock: Lock,
  'log-out': SignOut,
  'message-circle': ChatCircleDots,
  mic: Microphone,
  'mouse-pointer': HandTap,
  move: ArrowsOutCardinal,
  'pie-chart': ChartPieSlice,
  plus: Plus,
  'refresh-cw': ArrowClockwise,
  search: MagnifyingGlass,
  send: PaperPlaneTilt,
  settings: Gear,
  'share-2': ShareNetwork,
  shield: ShieldCheck,
  smartphone: DeviceMobile,
  user: UserCircle,
  'volume-2': SpeakerHigh,
  'wifi-off': WifiSlash,
  x: X,
  'x-circle': XCircle,
  zap: Lightning,
} satisfies Record<string, ComponentType<IconProps>>;

export type IconName = keyof typeof ICONS;

/**
 * One icon.
 * @param props.name App icon name.
 * @param props.size Edge in dp (default 20).
 * @param props.color Stroke or fill colour.
 * @param props.weight `regular` (default), `bold` or `fill`.
 * @param props.style Extra style for the SVG.
 * @param props.accessibilityLabel Only for an icon that carries meaning on its own (a status check).
 * @returns The icon; decorative unless labelled.
 */
export function Icon({
  name,
  size = 20,
  color,
  weight = 'regular',
  style,
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  color?: string;
  weight?: 'regular' | 'bold' | 'fill';
  style?: IconProps['style'];
  accessibilityLabel?: string;
}) {
  const Glyph = ICONS[name];
  const glyph = <Glyph size={size} color={color} weight={weight} style={style} />;
  return accessibilityLabel ? (
    <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {glyph}
    </View>
  ) : (
    glyph
  );
}
