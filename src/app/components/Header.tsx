// src/app/components/Header.tsx
"use client";

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
          {/* Logo image - place your logo file at /public/logo.png, /public/logo.svg, or /public/logo.jpg */}
          {/* The component will try to load the logo, and fall back to text if not found */}
          <LogoWithFallback />
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

// Logo component with fallback to text
function LogoWithFallback() {
  const [logoError, setLogoError] = React.useState(false);
  const [imgError, setImgError] = React.useState(false);
  
  // Logo file path - place your logo at /public/logo.png, /public/logo.svg, /public/logo.jpg, etc.
  // The logo should be a horizontal version suitable for header display
  // Recommended: SVG for best quality, or PNG with transparent background
  const logoSrc = "/logo.png"; // Update this if your logo has a different filename

  // Use regular img tag for better error handling, or Next.js Image if preferred
  if (logoError || imgError) {
    // Fallback to text logo if image fails to load
    return (
      <span style={{ fontSize: typography.fontSize["2xl"], fontWeight: typography.fontWeight.bold, color: colors.primary }}>
        Boyd Group Services
      </span>
    );
  }

  return (
    <div style={{ position: "relative", height: "40px", width: "auto", minWidth: "120px" }}>
      <img
        src={logoSrc}
        alt="Boyd Group Services"
        style={{
          height: "40px",
          width: "auto",
          objectFit: "contain" as const,
          maxWidth: "200px",
        }}
        onError={() => {
          setImgError(true);
          setLogoError(true);
        }}
        onLoad={() => {
          // Logo loaded successfully
        }}
      />
    </div>
  );
}
