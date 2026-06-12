// Runs on Google search results pages.
// Two modes:
//   - Normal: extract first non-social company URL → GOOGLE_SEARCH_RESULT
//   - LinkedIn: search contains "linkedin.com" → find LinkedIn company URL → GOOGLE_LINKEDIN_RESULT

const SKIP_DOMAINS = [
  'google.com', 'linkedin.com', 'facebook.com', 'twitter.com', 'x.com',
  'instagram.com', 'youtube.com', 'wikipedia.org', 'zoominfo.com',
  'crunchbase.com', 'bloomberg.com', 'glassdoor.com'
];

function isUsefulUrl(href) {
  if (!href || !href.startsWith('http')) return false;
  try {
    const host = new URL(href).hostname.replace(/^www\./, '');
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

async function extractLinkedInResult() {
  for (let i = 0; i < 8; i++) {
    const links = document.querySelectorAll(
      '#search a[href*="linkedin.com/company"], .g a[href*="linkedin.com/company"]'
    );
    for (const link of links) {
      const raw = link.href || link.getAttribute('href') || '';
      try {
        // Unwrap Google redirect wrapper (/url?q=...)
        const u = new URL(raw);
        const q = u.searchParams.get('q') || u.searchParams.get('url');
        const href = q && q.includes('linkedin.com/company') ? q : raw;
        const clean = href.split('?')[0].replace(/\/$/, '');
        if (clean.includes('linkedin.com/company')) {
          chrome.runtime.sendMessage({ type: 'GOOGLE_LINKEDIN_RESULT', payload: { url: clean + '/' } });
          return;
        }
      } catch {
        if (raw.includes('linkedin.com/company')) {
          chrome.runtime.sendMessage({ type: 'GOOGLE_LINKEDIN_RESULT', payload: { url: raw.split('?')[0] } });
          return;
        }
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
  chrome.runtime.sendMessage({ type: 'GOOGLE_LINKEDIN_RESULT', payload: { url: null } });
}

// Detect mode based on query
const isLinkedInSearch = decodeURIComponent(window.location.search).includes('linkedin.com');
if (isLinkedInSearch) {
  extractLinkedInResult();
} else {
  extractFirstResult();
}
