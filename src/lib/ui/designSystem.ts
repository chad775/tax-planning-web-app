// src/lib/ui/designSystem.ts
/**
 * Shared design system constants for consistent styling across the app.
 * Professional financial services theme with clean, modern aesthetics.
 */

export const colors = {
  // Primary brand colors
  primary: "#1e40af", // Professional blue
  primaryDark: "#1e3a8a",
  primaryLight: "#3b82f6",
  
  // Secondary colors
  secondary: "#64748b", // Slate gray
  secondaryLight: "#94a3b8",
  
  // Accent colors
  accent: "#0ea5e9", // Sky blue
  success: "#10b981", // Green for savings/positive
  warning: "#f59e0b", // Amber
  error: "#ef4444", // Red
  
  // Neutral colors
  background: "#f8fafc", // Light gray background
  surface: "#ffffff", // White cards/surfaces
  border: "#e2e8f0", // Light border
  borderDark: "#cbd5e1",
  
  // Text colors
  textPrimary: "#0f172a", // Almost black
  textSecondary: "#475569", // Medium gray
  textTertiary: "#64748b", // Light gray
  textInverse: "#ffffff",
  
  // Semantic colors
  savings: "#059669", // Darker green for savings
  savingsLight: "#d1fae5", // Light green background
} as const;

export const typography = {
  fontFamily: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
  },
  fontSize: {
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
    black: 900,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const;

export const spacing = {
  xs: "0.25rem", // 4px
  sm: "0.5rem", // 8px
  md: "1rem", // 16px
  lg: "1.5rem", // 24px
  xl: "2rem", // 32px
  "2xl": "3rem", // 48px
  "3xl": "4rem", // 64px
} as const;

export const borderRadius = {
  sm: "0.375rem", // 6px
  md: "0.5rem", // 8px
  lg: "0.75rem", // 12px
  xl: "1rem", // 16px
  "2xl": "1.5rem", // 24px
  full: "9999px",
} as const;

export const shadows = {
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
  xl: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
} as const;

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
} as const;

// Common component styles
export const styles = {
  container: {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: `${spacing.lg} ${spacing.md}`,
  } as React.CSSProperties,
  
  card: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    boxShadow: shadows.sm,
  } as React.CSSProperties,
  
  cardHover: {
    background: colors.surface,
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.xl,
    padding: spacing.lg,
    boxShadow: shadows.sm,
    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
  } as React.CSSProperties,
  
  button: {
    borderRadius: borderRadius.lg,
    border: "none",
    padding: `${spacing.sm} ${spacing.lg}`,
    background: colors.primary,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.base,
    cursor: "pointer",
    transition: "background-color 0.2s ease, transform 0.1s ease",
  } as React.CSSProperties,
  
  buttonHover: {
    background: colors.primaryDark,
  } as React.CSSProperties,
  
  buttonSecondary: {
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.borderDark}`,
    padding: `${spacing.sm} ${spacing.lg}`,
    background: colors.surface,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.base,
    cursor: "pointer",
    transition: "background-color 0.2s ease, border-color 0.2s ease",
  } as React.CSSProperties,
  
  input: {
    width: "100%",
    border: `1px solid ${colors.border}`,
    borderRadius: borderRadius.md,
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: typography.fontSize.base,
    fontFamily: typography.fontFamily.sans,
    background: colors.surface,
    color: colors.textPrimary,
    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
  } as React.CSSProperties,
  
  inputFocus: {
    outline: "none",
    borderColor: colors.primary,
    boxShadow: `0 0 0 3px ${colors.primaryLight}33`,
  } as React.CSSProperties,
  
  inputError: {
    borderColor: colors.error,
  } as React.CSSProperties,
  
  heading1: {
    fontSize: typography.fontSize["4xl"],
    fontWeight: typography.fontWeight.black,
    color: colors.textPrimary,
    lineHeight: typography.lineHeight.tight,
    margin: 0,
  } as React.CSSProperties,
  
  heading2: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    lineHeight: typography.lineHeight.tight,
    margin: 0,
  } as React.CSSProperties,
  
  heading3: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    lineHeight: typography.lineHeight.tight,
    margin: 0,
  } as React.CSSProperties,
  
  bodyText: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    lineHeight: typography.lineHeight.normal,
    margin: 0,
  } as React.CSSProperties,
  
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  } as React.CSSProperties,
} as const;
