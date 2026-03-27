// ─── Boyden Brand Theme ───────────────────────────────────────────────────────

export const B = {
  // Core brand — deep executive navy + Boyden blue
  navy:        '#0C1E35',
  navyMid:     '#1A3352',
  blue:        '#2B6CB0',
  blueDark:    '#1A4F8A',
  blueLight:   '#4A90D9',
  blueMuted:   'rgba(43,108,176,0.10)',
  blueBorder:  'rgba(43,108,176,0.20)',
  blueStrong:  'rgba(43,108,176,0.06)',

  // Gold accent — executive warmth
  gold:        '#C4972A',
  goldDark:    '#A07820',
  goldMuted:   'rgba(196,151,42,0.10)',
  goldBorder:  'rgba(196,151,42,0.28)',

  // Backgrounds
  bg:          '#F4F7FB',
  bgCard:      '#FFFFFF',
  bgCardAlt:   '#EEF3FA',
  bgCardBlue:  'rgba(43,108,176,0.05)',
  bgInput:     '#F0F5FC',
  bgNavy:      '#0C1E35',

  // Text
  textPrimary:   '#0C1E35',
  textSecondary: '#4A5E75',
  textMuted:     '#8BA0B8',
  textInverse:   '#FFFFFF',
  textGold:      '#C4972A',

  // Borders
  border:        '#D4E2F0',
  borderStrong:  '#B0C8E0',

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
  tabBorder:     '#D4E2F0',
  tabActive:     '#2B6CB0',
  tabInactive:   '#8BA0B8',

  // Header
  headerBg:      '#FFFFFF',
  headerBorder:  '#D4E2F0',
  headerText:    '#0C1E35',

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
    default:         return { bg: '#EEF3FA', border: '#D4E2F0', text: '#8BA0B8', dot: '#8BA0B8' };
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
