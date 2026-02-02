// src/lib/session/prefillStore.ts
// Server-only session store for prefill data

import { randomUUID } from "crypto";

export type PrefillData = {
  firstName?: string;
  email?: string;
  phone?: string;
};

type PrefillEntry = {
  data: PrefillData;
  expiresAt: number;
};

// In-memory store: Map<sessionId, PrefillEntry>
const store = new Map<string, PrefillEntry>();

// TTL: 60 minutes (3600000 ms)
const TTL_MS = 60 * 60 * 1000;

// Cleanup interval: 10 minutes (600000 ms)
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// Track last cleanup time for opportunistic cleanup
let lastCleanupAt = Date.now();

/**
 * Clean up expired entries opportunistically.
 * Removes all entries where expiresAt <= now.
 * Updates lastCleanupAt timestamp.
 */
function cleanupExpired(): void {
  const now = Date.now();
  let deletedCount = 0;
  
  for (const [sessionId, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      store.delete(sessionId);
      deletedCount++;
    }
  }
  
  lastCleanupAt = now;
  
  // Optional: log cleanup if entries were removed (for debugging)
  if (deletedCount > 0) {
    // Silent cleanup - no console logs in production
  }
}

/**
 * Check if cleanup is needed and run it if so.
 * Opportunistic cleanup: runs if CLEANUP_INTERVAL_MS has passed since last cleanup.
 */
function maybeCleanup(): void {
  const now = Date.now();
  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS) {
    cleanupExpired();
  }
}

/**
 * Set prefill data for a session.
 * @param sessionId - Session identifier
 * @param data - Prefill data (firstName, email, phone)
 */
export function setPrefill(sessionId: string, data: PrefillData): void {
  // Opportunistic cleanup before adding new entry
  maybeCleanup();

  const expiresAt = Date.now() + TTL_MS;
  store.set(sessionId, { data, expiresAt });
}

/**
 * Get prefill data for a session.
 * Returns null if session doesn't exist or has expired.
 * Does NOT delete the entry (use consumePrefill for one-time read).
 * @param sessionId - Session identifier
 * @returns Prefill data or null
 */
export function getPrefill(sessionId: string): PrefillData | null {
  const entry = store.get(sessionId);
  if (!entry) {
    return null;
  }

  // Check expiration
  const now = Date.now();
  if (entry.expiresAt <= now) {
    store.delete(sessionId);
    return null;
  }

  return entry.data;
}

/**
 * Consume prefill data for a session (one-time read).
 * Returns data if valid, then immediately deletes the entry.
 * Returns null if session doesn't exist or has expired.
 * @param sessionId - Session identifier
 * @returns Prefill data or null (entry is deleted after return)
 */
export function consumePrefill(sessionId: string): PrefillData | null {
  // Opportunistic cleanup before consuming
  maybeCleanup();

  const entry = store.get(sessionId);
  if (!entry) {
    return null;
  }

  // Check expiration
  const now = Date.now();
  if (entry.expiresAt <= now) {
    store.delete(sessionId);
    return null;
  }

  // Valid entry: return data and delete (one-time read)
  const data = entry.data;
  store.delete(sessionId);
  return data;
}

/**
 * Clear prefill data for a session.
 * @param sessionId - Session identifier
 */
export function clearPrefill(sessionId: string): void {
  store.delete(sessionId);
}

/**
 * Get or create a session ID from cookies.
 * If cookie exists, return it. Otherwise, generate a new UUID.
 * @param cookies - Next.js cookies object
 * @returns Session ID string
 */
export function getOrCreateSessionId(cookies: { get: (name: string) => { value: string } | undefined }): string {
  const existing = cookies.get("tp_session");
  if (existing?.value) {
    return existing.value;
  }
  
  // Generate new session ID using crypto.randomUUID()
  // Note: This is server-side only, so crypto is available
  return randomUUID();
}
