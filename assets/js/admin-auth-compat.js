(() => {
  const ADMIN_MODE_KEY = "rangerbook-admin-mode";
  const auth = window.RangerbookAuth;
  const storagePrototype = window.Storage?.prototype;
  const originalGetItem = storagePrototype?.getItem;
  const originalSetItem = storagePrototype?.setItem;
  const originalRemoveItem = storagePrototype?.removeItem;
  let installed = false;

  function installStorageGuard() {
    if (installed || !auth || !storagePrototype || !originalGetItem || !originalSetItem || !originalRemoveItem) return;
    installed = true;

    try {
      originalRemoveItem.call(window.localStorage, ADMIN_MODE_KEY);
    } catch {
      // Ignore unavailable storage (for example strict privacy mode).
    }

    storagePrototype.getItem = function getItem(key) {
      if (this === window.localStorage && String(key) === ADMIN_MODE_KEY) {
        return auth.isAdmin() ? "true" : null;
      }
      return originalGetItem.call(this, key);
    };

    storagePrototype.setItem = function setItem(key, value) {
      if (this === window.localStorage && String(key) === ADMIN_MODE_KEY) {
        return undefined;
      }
      return originalSetItem.call(this, key, value);
    };

    storagePrototype.removeItem = function removeItem(key) {
      if (this === window.localStorage && String(key) === ADMIN_MODE_KEY) {
        return undefined;
      }
      return originalRemoveItem.call(this, key);
    };
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
  }

  async function loadScripts(sources) {
    if (!auth) throw new Error("RangerbookAuth is unavailable");
    await auth.ready();
    installStorageGuard();
    for (const source of sources) {
      await loadScript(source);
    }
  }

  window.RangerbookAdminCompat = {
    loadScripts,
    installStorageGuard
  };
})();
