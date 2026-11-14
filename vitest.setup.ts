// Tests must never reach a real backend: any fetch that a test forgot to stub fails loudly.
globalThis.fetch = () => Promise.reject(new Error('network disabled in tests'));

// Node 25 ships its own global localStorage/sessionStorage (no-op without --localstorage-file),
// which hides jsdom's. Point them back at jsdom's storage. No-op on Node versions without it.
const jsdomWindow = (globalThis as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    if (typeof globalThis[key]?.clear !== 'function') {
      Object.defineProperty(globalThis, key, { value: jsdomWindow[key], configurable: true, writable: true });
    }
  }
}
