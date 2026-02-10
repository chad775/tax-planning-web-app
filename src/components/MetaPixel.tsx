"use client";

import Script from "next/script";

const META_PIXEL_SCRIPT = "https://connect.facebook.net/en_US/fbevents.js";

export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  if (!pixelId || pixelId.trim() === "") {
    return null;
  }

  return (
    <Script
      id="meta-pixel"
      src={META_PIXEL_SCRIPT}
      strategy="afterInteractive"
      onLoad={() => {
        if (typeof window !== "undefined" && typeof window.fbq === "function") {
          window.fbq("init", pixelId);
          window.fbq("track", "PageView");
        }
      }}
    />
  );
}
