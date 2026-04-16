/**
 * @mightyspatial/tokens — design tokens for Mighty platform apps and widgets.
 *
 * Colours, spacing, radii, typography, shadows. Consumed by every UI primitive
 * and every widget so the look is consistent across MightyDev, MightyLite,
 * and MightyTwin.
 */

export const colors = {
  // Background
  bgPrimary: '#0f0f14',
  bgSecondary: '#1a1a24',
  bgTertiary: '#252532',
  bgElevated: '#2a2a3a',
  
  // Text
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255, 255, 255, 0.7)',
  textTertiary: 'rgba(255, 255, 255, 0.5)',
  textMuted: 'rgba(255, 255, 255, 0.3)',
  
  // Brand
  accent: '#6366f1',
  accentLight: '#818cf8',
  accentDark: '#4f46e5',
  accentBg: 'rgba(99, 102, 241, 0.15)',
  
  // Semantic
  success: '#22c55e',
  successBg: 'rgba(34, 197, 94, 0.15)',
  warning: '#f59e0b',
  warningBg: 'rgba(245, 158, 11, 0.15)',
  danger: '#ef4444',
  dangerBg: 'rgba(239, 68, 68, 0.15)',
  
  // Borders
  border: 'rgba(255, 255, 255, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.06)',
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const fontWeights = {
  normal: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const breakpoints = {
  phone: 0,
  tablet: 768,
  desktop: 1024,
} as const;

export const layout = {
  sidebarWidth: 260,
  headerHeight: 64,
  headerHeightPhone: 56,
  bottomNavHeight: 64,
  touchTarget: 48,
} as const;

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.2)',
  md: '0 4px 12px rgba(0, 0, 0, 0.25)',
  lg: '0 8px 24px rgba(0, 0, 0, 0.3)',
  fab: '0 4px 16px rgba(99, 102, 241, 0.4)',
} as const;

// Config (apiConfig, oauthConfig, cesiumConfig) was removed from this package
// — it belongs in each consumer app, read from env vars local to that app.
// Tokens should contain only design tokens (colors, spacing, typography, etc).
