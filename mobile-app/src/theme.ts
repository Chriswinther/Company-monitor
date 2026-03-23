// ─── Boyden Brand Theme ───────────────────────────────────────────────────────

export const B = {
  // Core brand colors
  blue:        '#4A90D9',
  blueDark:    '#2E6DB4',
  blueLight:   '#6AAEE3',
  blueMuted:   'rgba(74,144,217,0.12)',
  blueBorder:  'rgba(74,144,217,0.22)',
  blueStrong:  'rgba(74,144,217,0.08)',

  // Backgrounds — subtle blue tint throughout
  bg:          '#F0F5FC',   // very subtle blue tint on page bg
  bgCard:      '#FFFFFF',
  bgCardAlt:   '#EEF4FB',   // blue-tinted alt card
  bgCardBlue:  'rgba(74,144,217,0.06)', // accent card bg
  bgInput:     '#F4F8FD',   // blue-tinted input

  // Text
  textPrimary:   '#1C2B3A',
  textSecondary: '#5A6A7A',
  textMuted:     '#9DAEBF',
  textInverse:   '#FFFFFF',

  // Borders
  border:        '#D8E6F5',   // slightly blue-tinted border
  borderStrong:  '#B8D0EA',

  // Risk colors
  riskCritical:  '#DC2626',
  riskHigh:      '#EA580C',
  riskModerate:  '#D97706',
  riskLow:       '#16A34A',

  // Status
  success:    '#16A34A',
  error:      '#DC2626',
  warning:    '#D97706',

  // Tab bar
  tabBg:         '#FFFFFF',
  tabBorder:     '#D8E6F5',
  tabActive:     '#4A90D9',
  tabInactive:   '#9DAEBF',

  // Header — subtle blue gradient feel
  headerBg:      '#FFFFFF',
  headerBorder:  '#D8E6F5',
  headerText:    '#1C2B3A',

  // Spacing
  pad:    16,
  padSm:  10,
  padLg:  24,

  // Radius
  radius:    12,
  radiusSm:  8,
  radiusLg:  18,
  radiusFull: 999,
} as const;

export function getRiskColors(level?: string | null) {
  switch ((level ?? '').toLowerCase()) {
    case 'critical': return { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626', dot: '#DC2626' };
    case 'high':     return { bg: '#FFF7ED', border: '#FED7AA', text: '#EA580C', dot: '#EA580C' };
    case 'moderate': return { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', dot: '#D97706' };
    case 'low':      return { bg: '#F0FDF4', border: '#BBF7D0', text: '#16A34A', dot: '#16A34A' };
    default:         return { bg: '#EEF4FB', border: '#D8E6F5', text: '#9DAEBF', dot: '#9DAEBF' };
  }
}

export function getScoreColor(score: number): string {
  if (score >= 70) return B.riskCritical;
  if (score >= 40) return B.riskHigh;
  if (score >= 20) return B.riskModerate;
  return B.riskLow;
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return '—';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
}