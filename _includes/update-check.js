// Inlined by Jekyll: even a cached entry page can discover a newer deployment.
(() => {
  'use strict';
  const revision = document.querySelector('meta[name="app-version"]')?.content;
  const isRevision = value => typeof value === 'string' && /^[a-f0-9]{40}$/i.test(value);
  if (!isRevision(revision) || !/^https?:$/.test(location.protocol)) return;
  const navigationType = window.performance?.getEntriesByType('navigation')[0]?.type;
  if (navigationType === 'back_forward') return;
  const base = new URL('.', location.href);
  let checking = false;
  let navigating = false;
  let checked = false;

  async function checkForUpdate() {
    if (checked || checking || navigating) return;
    checked = true;
    checking = true;
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
      if (navigationType !== 'reload' && currentURL.searchParams.get('v') === latest && Date.now() - Number(currentURL.searchParams.get('_fresh')) < 60000) return;
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
      // If saving is unavailable or a form is being edited, keep this page.
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

  // A fresh navigation/reload gets one check. Never update an idle open tab.
  document.addEventListener('DOMContentLoaded', checkForUpdate, { once: true });
})();
