"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const META_PIXEL_SCRIPT = "https://connect.facebook.net/en_US/fbevents.js";

export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const [scriptReady, setScriptReady] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevRouteRef = useRef<string | null>(null);

  const hasPixelId = Boolean(pixelId && String(pixelId).trim());

  // Diagnostic: log whether pixel ID is present on client (dev + prod so Vercel can be verified)
  useEffect(() => {
    if (hasPixelId) {
      console.log("[Meta Pixel] NEXT_PUBLIC_META_PIXEL_ID on client: present");
    } else {
      console.warn(
        "[Meta Pixel] NEXT_PUBLIC_META_PIXEL_ID on client: MISSING. Set the env var in Vercel and redeploy (build-time variable)."
      );
    }
  }, [hasPixelId]);

  if (!hasPixelId) {
    return (
      <span
        data-meta-pixel="id-missing"
        aria-hidden
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      />
    );
  }

  const handleScriptLoad = () => {
    if (typeof window === "undefined") return;
    if (typeof window.fbq === "function") {
      window.fbq("init", pixelId);
      window.fbq("track", "PageView");
      setScriptReady(true);
      document.documentElement.setAttribute("data-meta-pixel", "loaded");
    } else {
      document.documentElement.setAttribute("data-meta-pixel", "script-no-fbq");
    }
  };

  // Fire PageView on client-side route changes only (initial load already fired in onLoad)
  const searchString = searchParams?.toString() ?? "";
  useEffect(() => {
    if (!scriptReady || typeof window.fbq !== "function") return;
    const route = `${pathname}?${searchString}`;
    if (prevRouteRef.current === null) {
      prevRouteRef.current = route;
      return;
    }
    if (prevRouteRef.current !== route) {
      prevRouteRef.current = route;
      window.fbq("track", "PageView");
    }
  }, [scriptReady, pathname, searchString]);

  return (
    <Script
      id="meta-pixel"
      src={META_PIXEL_SCRIPT}
      strategy="afterInteractive"
      onLoad={handleScriptLoad}
    />
  );
}
