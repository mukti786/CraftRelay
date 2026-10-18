/** CraftRelay design tokens — Part 1 foundation */

export const Colors = {
  // Primary palette
  navy: '#0D2B5E',
  navyLight: '#1A4080',
  teal: '#1A7A7A',
  tealLight: '#2AA2A2',

  // Neutrals
  white: '#FFFFFF',
  background: '#F5F7FA',
  surfaceCard: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#1A202C',
  textSecondary: '#4A5568',
  textMuted: '#6B7280',

  // Semantic
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  info: '#2563EB',

  // Status
  verified: '#16A34A',
  pending: '#D97706',
  gap: '#DC2626',
  declared: '#2563EB',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;
