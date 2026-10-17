// Inlined by Jekyll: even a cached entry page can discover a newer deployment.
(() => {
  'use strict';
  const revision = document.querySelector('meta[name="app-version"]')?.content;
  const isRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
  if (!isRevision(revision) || !/^https?:$/.test(location.protocol)) return;
  const base = new URL('.', location.href);
  let checking = false;
  let navigating = false;
  let lastCheck = 0;

  async function checkForUpdate() {
    if (checking || navigating || document.visibilityState === 'hidden' || Date.now() - lastCheck < 60000) return;
    checking = true;
    lastCheck = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const manifestURL = new URL('version.json', base);
      manifestURL.searchParams.set('_fresh', String(Date.now()));
      const options = { cache: 'no-store', signal: controller.signal };
      const response = await fetch(manifestURL, options);
      if (!response.ok) return;
      const latest = (await response.json()).revision;
      if (!isRevision(latest) || latest === revision) return;

      // CDN propagation can briefly expose a new manifest with old HTML.
      // Never repeatedly reload that old document in a tight loop.
      const currentURL = new URL(location.href);
      if (currentURL.searchParams.get('v') === latest && Date.now() - Number(currentURL.searchParams.get('_fresh')) < 60000) return;
      const nextURL = new URL('index.html', base);
      nextURL.search = currentURL.search;
      nextURL.hash = currentURL.hash;
      nextURL.searchParams.set('v', latest);
      nextURL.searchParams.set('_fresh', String(Date.now()));
      const htmlResponse = await fetch(nextURL, options);
      if (!htmlResponse.ok) return;
      const html = new DOMParser().parseFromString(await htmlResponse.text(), 'text/html');
      if (html.querySelector('meta[name="app-version"]')?.content !== latest) return;

      // app.js captures in-memory work without touching existing localStorage.
      // If saving is unavailable or a form is being edited, retry later.
      if (!window.prepareForAppUpdate || !window.prepareForAppUpdate(latest)) return;
      navigating = true;
      location.replace(nextURL.href);
    } catch {
      // Offline, timeout or an incomplete deployment: keep the working page.
    } finally {
      clearTimeout(timeout);
      checking = false;
    }
  }

  document.addEventListener('DOMContentLoaded', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);
  document.addEventListener('visibilitychange', checkForUpdate);
  window.addEventListener('online', checkForUpdate);
  setInterval(checkForUpdate, 5 * 60 * 1000);
})();
