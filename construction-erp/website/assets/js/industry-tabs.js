/**
 * Collapses the three industry walkthroughs into a tab strip.
 *
 * This is an enhancement, not the mechanism. With the script absent the CSS
 * shows all three panels stacked and hides the tab row, so the page still
 * carries its content — a row of tabs above nothing is worse than no tabs.
 * Adding .js-tabs is what switches the stylesheet into tab mode, so the
 * collapse only ever happens once something can actually drive it.
 */
(() => {
  const player = document.querySelector('.industry-player');
  const tabs = Array.from(document.querySelectorAll('.industry-tabs input[name="industry"]'));
  const panels = Array.from(document.querySelectorAll('.industry-panel'));

  if (!player || !tabs.length || !panels.length) return;

  const panelIdFor = (tab) => tab.id.replace(/^tab-/, '');

  const showSelectedPanel = () => {
    const selected = tabs.find((tab) => tab.checked) || tabs[0];
    const panelId = panelIdFor(selected);

    panels.forEach((panel) => {
      const active = panel.id === panelId;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });

    tabs.forEach((tab) => {
      const label = document.querySelector(`label[for="${tab.id}"]`);
      if (label) label.setAttribute('aria-selected', String(tab === selected));
    });
  };

  /** A link like /videos.html#facilities should open on that walkthrough. */
  const selectFromHash = () => {
    const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!id) return false;
    const tab = tabs.find((candidate) => panelIdFor(candidate) === id);
    if (!tab) return false;
    tab.checked = true;
    return true;
  };

  tabs.forEach((tab) => tab.addEventListener('change', showSelectedPanel));
  window.addEventListener('hashchange', () => {
    if (selectFromHash()) showSelectedPanel();
  });

  player.classList.add('js-tabs');
  selectFromHash();
  showSelectedPanel();
})();
