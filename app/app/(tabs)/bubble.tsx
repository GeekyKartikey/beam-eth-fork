/**
 * @file Beam tab: the floating-beam control and the access (permission)
 * checklist. Permissions are re-read whenever the app returns to the foreground.
 */
import { BubbleCard } from '../../src/components/BubbleCard';
import { PermissionsCard } from '../../src/components/PermissionsCard';
import { Screen } from '../../src/components/Screen';
import { usePermissions } from '../../src/permissions';

/**
 * Beam screen.
 * @returns The floating-beam control and the access checklist.
 */
export default function BubbleScreen() {
  const permissions = usePermissions();
  return (
    <Screen title="Beam" subtitle="Tap the beam in any app to pay from what is on screen.">
      <BubbleCard status={permissions.status} refresh={permissions.refresh} />
      <PermissionsCard status={permissions.status} refresh={permissions.refresh} />
    </Screen>
  );
}
