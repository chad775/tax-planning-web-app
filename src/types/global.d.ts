export {};

declare global {
  interface Window {
    fbq?: (action: string, ...args: unknown[]) => void;
    _fbq?: unknown;
  }
}
