// Injected programmatically by the service worker (fetchCompanyWebsite) into a
// search tab the extension itself created — it is NOT a manifest content
// script, so it never runs on the user's own Google searches.
// Extracts the first non-social organic result → GOOGLE_SEARCH_RESULT.

(() => {
  if (window.__csmGoogleExtractorRan) return; // idempotent under re-injection
  window.__csmGoogleExtractorRan = true;

  const SKIP_DOMAINS = [
    'google.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
    'instagram.com', 'youtube.com', 'wikipedia.org', 'zoominfo.com',
    'crunchbase.com', 'bloomberg.com', 'glassdoor.com'
  ];

  function isUsefulUrl(href) {
    if (!href || !href.startsWith('http')) return false;
    try {
      const u = new URL(href);
      if (!/^https?:$/.test(u.protocol)) return false;
      const host = u.hostname.replace(/^www\./, '');
      // Never hand the service worker an intranet/loopback target — SERP
      // content is attacker-influenced (SSRF guard, mirrored in the worker)
      if (host === 'localhost' || !host.includes('.')) return false;
      if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^127\.|^169\.254\./.test(host)) return false;
      return !SKIP_DOMAINS.some(d => host === d || host.endsWith('.' + d));
    } catch {
      return false;
    }
  }

  async function extractFirstResult() {
    for (let i = 0; i < 8; i++) {
      const links = document.querySelectorAll(
        '#search a[href^="http"]:not([href*="google"]):not([href*="webcache"]), ' +
        '.g a[href^="http"], ' +
        '[data-sokoban-container] a[href^="http"]'
      );
      for (const link of links) {
        const href = link.href || link.getAttribute('href') || '';
        if (isUsefulUrl(href)) {
          try {
            const u = new URL(href);
            const q = u.searchParams.get('q') || u.searchParams.get('url');
            const final = q && q.startsWith('http') ? q : href;
            if (isUsefulUrl(final)) {
              chrome.runtime.sendMessage({ type: 'GOOGLE_SEARCH_RESULT', payload: { url: final } });
              return;
            }
          } catch {
            chrome.runtime.sendMessage({ type: 'GOOGLE_SEARCH_RESULT', payload: { url: href } });
            return;
          }
        }
      }
      await new Promise(r => setTimeout(r, 800));
    }
    chrome.runtime.sendMessage({ type: 'GOOGLE_SEARCH_RESULT', payload: { url: null } });
  }

  extractFirstResult();
})();
