(() => {
  const tabs = Array.from(document.querySelectorAll('.industry-tabs input[name="industry"]'));
  const panels = Array.from(document.querySelectorAll('.industry-panel'));

  if (!tabs.length || !panels.length) return;

  const showSelectedPanel = () => {
    const selected = tabs.find((tab) => tab.checked) || tabs[0];
    const panelId = selected.id.replace('tab-', 'panel-');

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

  tabs.forEach((tab) => tab.addEventListener('change', showSelectedPanel));
  showSelectedPanel();
})();
