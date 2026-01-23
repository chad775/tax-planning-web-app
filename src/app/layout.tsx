// src/app/layout.tsx

import type { ReactNode } from "react";

export const metadata = {
  title: "Tax Planning Web App",
  description: "Tax strategy intake and results",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
