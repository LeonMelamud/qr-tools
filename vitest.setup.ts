// Tests must never reach a real backend: any fetch that a test forgot to stub fails loudly.
globalThis.fetch = () => Promise.reject(new Error('network disabled in tests'));
