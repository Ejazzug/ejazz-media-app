// An in-memory AsyncStorage, so a test can exercise code that persists without a device.
const store = new Map();
export default {
  getItem: async (k) => (store.has(k) ? store.get(k) : null),
  setItem: async (k, v) => void store.set(k, String(v)),
  removeItem: async (k) => void store.delete(k),
  clear: async () => void store.clear(),
};
