// Polyfills the same window.storage.get/set API the app was originally built
// against, but backed by real browser localStorage instead of Claude's
// artifact storage. This means the app's data now lives on the device it's
// installed on and survives closing the app, restarting the phone, etc.
// It does NOT sync across devices — that would need a real backend (see the
// README for what that next step looks like).

function prefixed(key) {
  return `the-clock:${key}`;
}

window.storage = {
  async get(key) {
    const raw = localStorage.getItem(prefixed(key));
    if (raw === null) {
      throw new Error(`Key not found: ${key}`);
    }
    return { key, value: raw };
  },

  async set(key, value) {
    localStorage.setItem(prefixed(key), value);
    return { key, value };
  },

  async delete(key) {
    const existed = localStorage.getItem(prefixed(key)) !== null;
    localStorage.removeItem(prefixed(key));
    return { key, deleted: existed };
  },

  async list(prefix = '') {
    const keys = [];
    const fullPrefix = prefixed(prefix);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        keys.push(k.replace('the-clock:', ''));
      }
    }
    return { keys };
  },
};
