// Shared Odoo page-scraping helpers.
//
// Single source of truth for every Odoo DOM selector. Injected on demand via
// chrome.scripting.executeScript({ files: ['content/odoo-scraper.js'] }); the
// service worker then calls window.__churn.* inside the page. Keeping the
// selectors here (rather than copy-pasted into each executeScript func) means an
// Odoo version bump is a one-file change.
(function () {
  function txt(selectors) {
    for (const s of selectors) {
      const el = document.querySelector(s);
      const t = (el?.innerText || el?.textContent || '').trim();
      if (t) return t;
    }
    return '';
  }

  function getPartnerName() {
    const field = document.querySelector('div[name="partner_id"]');
    if (!field) return '';
    const link = field.querySelector('a.o_form_uri, a');
    if (link?.innerText?.trim()) return link.innerText.trim();
    const input = field.querySelector('input');
    if (input?.value?.trim()) return input.value.trim();
    return (field.innerText || '').split('\n')[0].trim();
  }

  // Class names span 3 Odoo generations (17+, 16, older) — try each set in order.
  const MESSAGE_SELECTOR_SETS = [
    ['.o-mail-Message', '.o-mail-Message-author', '.o-mail-Message-date', '.o-mail-Message-body'],
    ['.o_Message', '.o_Message_author', '.o_Message_date', '.o_Message_content'],
    ['.o_thread_message', '.o_mail_info strong', '.o_mail_info .o_mail_timestamp', '.o_mail_body']
  ];

  function extractMessages(root) {
    const scope = root || document;
    const history = [];
    for (const [msgSel, authorSel, dateSel, bodySel] of MESSAGE_SELECTOR_SETS) {
      const msgs = scope.querySelectorAll(msgSel);
      if (!msgs.length) continue;
      msgs.forEach(msg => {
        const author = (msg.querySelector(authorSel)?.innerText || '').trim();
        const date   = (msg.querySelector(dateSel)?.innerText || msg.querySelector('time')?.getAttribute('datetime') || '').trim();
        const body   = (msg.querySelector(bodySel)?.innerText || '').trim().slice(0, 800);
        const isLogNote = msg.classList.contains('o-mail-Message--logNote') ||
          !!msg.querySelector('.o-mail-Message-logNote, [title*="Log"], [aria-label*="Log"]');
        if (body) history.push({ author, date, body, type: isLogNote ? 'log_note' : 'message' });
      });
      break;
    }
    return history;
  }

  // Reads the subscription record (and opens the Notes tab first).
  function extractPageData() {
    const notesTab = [...document.querySelectorAll('.o_notebook .nav-link, .nav-tabs .nav-link')]
      .find(t => /^notes?$/i.test(t.textContent.trim()));
    if (notesTab) notesTab.click();

    const customerName      = getPartnerName();
    const subscriptionPlan  = txt(['div[name="recurrence_id"] span', 'div[name="recurrence_id"]']);
    const recurringAmount   = txt(['div[name="recurring_monthly"] .o_field_monetary span', 'div[name="recurring_monthly"]', 'div[name="amount_total"] .o_field_monetary span']);
    const currencyEl        = document.querySelector('div[name="recurring_monthly"] .o_field_monetary .o_currency_symbol');
    const currency          = (currencyEl?.textContent || '').trim() || 'USD';
    const soNumber          = txt(['.o_field_widget[name="name"]', 'h1.o_form_title', '.o_form_title']);
    const userField         = document.querySelector('div[name="user_id"]');
    const assignedSalesperson = (userField?.querySelector('a.o_form_uri, a')?.innerText || userField?.querySelector('input')?.value || '').trim();

    let soId = '';
    const hp = new URLSearchParams(window.location.hash.replace('#', ''));
    if (hp.get('id')) { soId = hp.get('id'); }
    else { const m = window.location.pathname.match(/\/(\d+)\/?$/); if (m) soId = m[1]; }

    const products = [];
    document.querySelectorAll('.o_field_one2many[name="order_line"] .o_data_row').forEach(row => {
      const name  = (row.querySelector('td[name="product_id"], .o_field_widget[name="product_id"]')?.innerText || '').trim();
      const qty   = (row.querySelector('td[name="product_uom_qty"]')?.innerText || '').trim();
      const price = (row.querySelector('td[name="price_unit"]')?.innerText || '').trim();
      if (name) products.push({ name, qty, unitPrice: price });
    });

    const hostingEl  = document.querySelector('div[name="hosting_id"] a, div[name="hosting_id"] span');
    const hosting    = (hostingEl?.innerText || '').trim();
    const endDate    = txt(['div[name="date_end"] span','div[name="date_end"]','div[name="end_date"] span','div[name="end_date"]','div[name="next_invoice_date"] span','div[name="next_invoice_date"]']);
    const stateEl    = document.querySelector('div[name="subscription_state"] .o_status, div[name="subscription_state"] span, .o_statusbar_status .btn-primary, .o_statusbar_status button.active');
    const subscriptionState = (stateEl?.innerText || stateEl?.title || '').trim();

    const salesHistoryBtn = [...document.querySelectorAll('.o_stat_button, .oe_stat_button')]
      .find(b => /sales?\s*hist|sub.*hist|hist.*sub|previous|old.sub/i.test(b.textContent));
    const salesHistoryUrl = salesHistoryBtn?.href || salesHistoryBtn?.querySelector('a')?.href || '';

    const notesContent = (document.querySelector(
      'div[name="internal_note_display"] .odoo-editor-editable, div[name="internal_note_display"] .o_editable, div[name="internal_note_display"]'
    )?.innerText || '').trim().slice(0, 2000);

    return {
      customerName, subscriptionPlan, recurringAmount, currency,
      soNumber, soId, assignedSalesperson, products, hosting,
      endDate, subscriptionState, salesHistoryUrl, notesContent,
      chatHistory: extractMessages(),
      pageUrl: window.location.href
    };
  }

  // Scrolls the chatter thread to force-load every message, then extracts them.
  async function scrollAndExtractChatter() {
    const threadSelectors = ['.o-mail-Thread', '.o_mail_thread', '.oe_chatter .o_mail_thread'];
    let el = null;
    for (const s of threadSelectors) { el = document.querySelector(s); if (el) break; }

    // IMPORTANT: only search within `el` (the chatter thread element).
    // Never use document.querySelector here — it would match Odoo's file-attach
    // buttons in the composer, triggering the OS file picker.
    const LOAD_MORE_SELS = [
      'button.o-mail-Thread-loadMore',
      'button[aria-label*="older messages"]',
      'button[aria-label*="Load more"]',
      '.o_mail_thread_load_more'
    ];
    function findLoadMore(container) {
      for (const s of LOAD_MORE_SELS) {
        const btn = container.querySelector(s);
        if (btn && !btn.disabled) return btn;
      }
      return null;
    }

    if (el) {
      el.scrollTop = el.scrollHeight;
      await new Promise(r => setTimeout(r, 400));
      for (let i = 0; i < 20; i++) {
        el.scrollTop = 0;
        await new Promise(r => setTimeout(r, 600));
        const loadMore = findLoadMore(el);
        if (loadMore) { loadMore.click(); await new Promise(r => setTimeout(r, 900)); }
      }
      for (let extra = 0; extra < 40; extra++) {
        const loadMore = findLoadMore(el);
        if (!loadMore) break;
        loadMore.click();
        await new Promise(r => setTimeout(r, 900));
      }
    }

    // Prefer scoping the final extract to the thread element; fall back to document.
    return extractMessages(el || document);
  }

  // Collects links to previous "Renewed" subscription cycles from a list view.
  function collectRenewedOrderLinks() {
    const rows = document.querySelectorAll('.o_data_row');
    const entries = [];
    rows.forEach(row => {
      // Only rows whose Subscription Status badge says "Renewed" — the previous
      // cycles with the real history. Skip "Upsell", "Churned", blank statuses.
      const statusBadge = row.querySelector(
        'td[name="subscription_state"] .badge, ' +
        'td[name="subscription_state"] span.badge, ' +
        'td[name="subscription_state"] .o_tag, ' +
        'td[name="subscription_state"]'
      );
      const statusText = (statusBadge?.innerText || statusBadge?.textContent || '').trim().toLowerCase();
      if (statusText && !/renew/i.test(statusText)) return;

      const a = row.querySelector('td[name="name"] a, td[name="display_name"] a, .o_data_cell a');
      const href = a?.href;
      const label = (a?.innerText || row.querySelector('td:first-child')?.innerText || '').trim();
      if (href && href.includes(window.location.origin)) entries.push({ href, label });
    });
    return entries.slice(0, 8);
  }

  function findSalesHistoryHref() {
    const btn = [...document.querySelectorAll('.o_stat_button, .oe_stat_button, a.btn, a.o_stat_button')]
      .find(b => /sales?\s*hist|sub.*hist|hist.*sub|previous|old.sub/i.test(b.textContent));
    if (!btn) return null;
    return btn.tagName === 'A' ? btn.href : (btn.querySelector('a')?.href || null);
  }

  window.__churn = {
    extractPageData,
    scrollAndExtractChatter,
    collectRenewedOrderLinks,
    findSalesHistoryHref
  };
})();
