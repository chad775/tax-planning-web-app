// src/app/layout.tsx

import type { ReactNode } from "react";
import { Suspense } from "react";
import { Header } from "./components/Header";
import { MetaPixel } from "@/components/MetaPixel";
import { colors, typography } from "@/lib/ui/designSystem";

export const metadata = {
  title: "Tax Planning | Boyd Group Services",
  description: "Tax strategy intake and results",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          fontFamily: typography.fontFamily.sans,
          background: colors.background,
          color: colors.textPrimary,
          lineHeight: typography.lineHeight.normal,
        }}
      >
        <Suspense fallback={null}>
          <MetaPixel />
        </Suspense>
        <Header />
        {children}
      </body>
    </html>
  );
}
