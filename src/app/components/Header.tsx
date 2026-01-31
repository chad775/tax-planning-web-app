// src/app/components/Header.tsx

import React from "react";
import Link from "next/link";
import { colors, typography, spacing, borderRadius } from "@/lib/ui/designSystem";

export function Header() {
  const headerStyle: React.CSSProperties = {
    background: colors.surface,
    borderBottom: `1px solid ${colors.border}`,
    padding: `${spacing.md} 0`,
    marginBottom: spacing.xl,
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: "1200px",
    margin: "0 auto",
    padding: `0 ${spacing.md}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const logoStyle: React.CSSProperties = {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: colors.primary,
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
  };

  const navStyle: React.CSSProperties = {
    display: "flex",
    gap: spacing.lg,
    alignItems: "center",
  };

  const navLinkStyle: React.CSSProperties = {
    color: colors.textSecondary,
    textDecoration: "none",
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    padding: `${spacing.xs} ${spacing.md}`,
    borderRadius: borderRadius.md,
    transition: "color 0.2s ease, background-color 0.2s ease",
  };

  return (
    <header style={headerStyle}>
      <div style={containerStyle}>
        <Link href="/" style={logoStyle}>
          <span>Boyd Group Services</span>
        </Link>
        <nav style={navStyle}>
          <Link href="/intake" style={navLinkStyle}>
            Tax Planning
          </Link>
        </nav>
      </div>
    </header>
  );
}
