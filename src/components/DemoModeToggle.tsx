// Switches location between real GPS and the draggable demo dot.

import { setLocationSource, useLocationSource } from '../hooks/useUserLocation';
import { colors, fonts } from '../theme';

export function DemoModeToggle() {
  const source = useLocationSource();
  const next = source === 'gps' ? 'demo' : 'gps';

  return (
    <button
      type="button"
      onClick={() => setLocationSource(next)}
      aria-label={`Location: ${source === 'gps' ? 'GPS' : 'demo dot'}. Switch to ${next === 'gps' ? 'GPS' : 'demo dot'}.`}
      style={{
        minHeight: 44,
        minWidth: 44,
        padding: '0 14px',
        borderRadius: 22,
        border: `1px solid ${colors.border}`,
        background: source === 'demo' ? colors.sherbet : colors.card,
        color: source === 'demo' ? colors.card : colors.ink,
        fontFamily: fonts.mono,
        fontSize: 12,
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {source === 'gps' ? 'GPS' : 'Demo'}
    </button>
  );
}
