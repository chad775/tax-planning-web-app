"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const META_PIXEL_SCRIPT_URL =
  "https://connect.facebook.net/en_US/fbevents.js";

// Stub type for Meta's fbq queue (callMethod/queue added after creation)
type FbqStub = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push?: unknown;
  loaded?: boolean;
  version?: string;
};

export function MetaPixel() {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const [scriptReady, setScriptReady] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevRouteRef = useRef<string | null>(null);

  const hasPixelId = Boolean(pixelId && String(pixelId).trim());

  // Diagnostic: log whether pixel ID is present on client (dev + prod)
  useEffect(() => {
    if (hasPixelId) {
      console.log("[Meta Pixel] NEXT_PUBLIC_META_PIXEL_ID on client: present");
    } else {
      console.warn(
        "[Meta Pixel] NEXT_PUBLIC_META_PIXEL_ID on client: MISSING. Set the env var in Vercel and redeploy (build-time variable)."
      );
    }
  }, [hasPixelId]);

  // Use Facebook's official snippet: stub creates fbq and loads script, then we init/track (queued until script runs)
  useEffect(() => {
    if (!hasPixelId || !pixelId || typeof window === "undefined") return;

    const f = window;
    const b = document;
    const e = "script";
    const v = META_PIXEL_SCRIPT_URL;
    // Stub from Meta: creates fbq immediately and loads fbevents.js
    if (f.fbq) return;
    const n: FbqStub = (f.fbq = function () {
      const stub = n as FbqStub;
      stub.callMethod
        ? stub.callMethod.apply(stub, arguments as unknown as unknown[])
        : stub.queue.push(arguments);
    }) as FbqStub;
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e);
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    if (s?.parentNode) s.parentNode.insertBefore(t, s);

    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
    setScriptReady(true);
    document.documentElement.setAttribute("data-meta-pixel", "loaded");
  }, [hasPixelId, pixelId]);

  // Fire PageView on client-side route changes (initial load already fired above)
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

  if (!hasPixelId) {
    return (
      <span
        data-meta-pixel="id-missing"
        aria-hidden
        style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      />
    );
  }

  return (
    <>
      <noscript>
        <img
          height={1}
          width={1}
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
