// Runs on linkedin.com pages in two modes based on the URL

function isLoginWall() {
  const t = document.body?.innerText || '';
  return t.length < 600 || /sign in to linkedin|join linkedin|authwall/i.test(t.slice(0, 400));
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── MODE A: Search results page (/search/results/companies/) ────────────────
async function handleSearchResults() {
  for (let i = 0; i < 6; i++) {
    const card = document.querySelector(
      '.search-results__list li a[href*="/company/"], ' +
      '.reusable-search__result-container a[href*="/company/"], ' +
      '.entity-result__title-text a[href*="/company/"]'
    );
    if (card) {
      const href = card.href || card.getAttribute('href') || '';
      const absolute = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
      // Navigate to main company page (NOT /about/) so posts are visible
      const clean = absolute.split('?')[0].replace(/\/$/, '').replace(/\/about\/?$/, '');
      chrome.runtime.sendMessage({ type: 'LINKEDIN_SEARCH_RESULT', payload: { url: clean + '/' } });
      return;
    }
    await delay(1500);
  }
  chrome.runtime.sendMessage({ type: 'LINKEDIN_SEARCH_RESULT', payload: { url: null } });
}

// ── MODE B: Company main page (/company/slug) ────────────────────────────────
async function handleCompanyPage() {
  if (isLoginWall()) {
    chrome.runtime.sendMessage({ type: 'LINKEDIN_DATA', payload: { loginWall: true } });
    return;
  }

  function get(selectors) {
    for (const s of (Array.isArray(selectors) ? selectors : [selectors])) {
      const el = document.querySelector(s);
      const t = (el?.innerText || el?.textContent || '').trim();
      if (t) return t;
    }
    return '';
  }

  // Step 1: Scrape recent posts from the main company feed
  const recentPosts = await scrapeRecentPosts();

  // Step 2: Navigate to /about/ to get company details
  const companyBase = window.location.href.split('?')[0].replace(/\/$/, '').replace(/\/(?:posts|jobs|people|about)\/?$/, '');
  const aboutUrl = companyBase + '/about/';

  if (!window.location.href.includes('/about/')) {
    window.location.href = aboutUrl;
    // Content script will re-run on the new URL — nothing else to do here
    return;
  }

  // We're on /about/ — extract company details
  const name = get(['h1.org-top-card-summary__title', '.org-top-card-summary__title', 'h1']);
  const tagline = get('.org-top-card-summary__tagline');
  const about = get([
    '.org-about-us-organization-description__text',
    '.org-about-module__description',
    'section[data-test-id="about-us"] p',
    '.org-about-us p'
  ]);
  const employeeCount = get([
    '.org-about-company-module__company-staff-count-range',
    '.org-about-module__company-staff-count-range',
    '[data-test-id="about-us__size"]'
  ]);
  const industry = get([
    '.org-about-company-module__industry',
    '.org-about-module__industry',
    '[data-test-id="about-us__industry"]'
  ]);
  const headquarters = get([
    '.org-about-company-module__headquarters',
    '.org-about-module__headquarters',
    '[data-test-id="about-us__headquarters"]'
  ]);
  const founded = get([
    '.org-about-company-module__founded',
    '.org-about-module__founded',
    '[data-test-id="about-us__foundedOn"]'
  ]);
  const website = get(['.org-about-us-organization-description__website a', '.org-about-module__website a']);
  const specialties = get('.org-about-company-module__specialities');

  // Step 3: Get jobs for hiring signals
  const recentJobs = await scrapeJobsTab();

  const data = {
    name, tagline, about, employeeCount, industry, headquarters, founded, website,
    specialties, recentPosts, recentJobs, url: window.location.href
  };

  chrome.runtime.sendMessage({ type: 'LINKEDIN_DATA', payload: { data, loginWall: false } });
}

async function scrapeRecentPosts() {
  const posts = [];

  // Scroll down to trigger feed loading
  for (let i = 1; i <= 4; i++) {
    window.scrollTo(0, i * 600);
    await delay(800);
  }

  // LinkedIn company feed post selectors
  const feedSelectors = [
    '.feed-shared-update-v2__description',
    '.update-components-text__text-view span[dir]',
    '.feed-shared-inline-show-more-text span[dir]',
    '.org-update-item__content',
    '.occludable-update .update-components-text'
  ];

  for (const sel of feedSelectors) {
    const items = document.querySelectorAll(sel);
    if (items.length) {
      items.forEach(el => {
        const t = (el.innerText || '').trim();
        if (t.length > 20 && !posts.includes(t.slice(0, 400))) {
          posts.push(t.slice(0, 400));
        }
      });
      if (posts.length) break;
    }
  }

  return posts.slice(0, 8);
}

async function scrapeJobsTab() {
  const jobs = [];
  const companyBase = window.location.href.split('?')[0].replace(/\/$/, '').replace(/\/(?:posts|jobs|people|about)\/?$/, '');

  // Navigate to jobs tab
  window.history.pushState({}, '', companyBase + '/jobs/');
  await delay(2500);

  const jobSelectors = [
    '.job-card-list__title',
    '.artdeco-entity-lockup__title',
    '.jobs-unified-top-card__job-title',
    'a[data-tracking-control-name*="job"]'
  ];

  for (const sel of jobSelectors) {
    const items = document.querySelectorAll(sel);
    if (items.length) {
      items.forEach(el => {
        const t = (el.innerText || '').trim();
        if (t) jobs.push(t);
      });
      break;
    }
  }

  return [...new Set(jobs)].slice(0, 15);
}

// ── MODE C: About page — triggered by navigation from MODE B ────────────────
// (handled inside handleCompanyPage when URL contains /about/)

// ── Entry point ──────────────────────────────────────────────────────────────
async function init() {
  await delay(2500);

  const url = window.location.href;

  if (url.includes('/search/results/companies') || url.includes('/search/results/all')) {
    await handleSearchResults();
  } else if (url.includes('/company/')) {
    await handleCompanyPage();
  }
}

init();
