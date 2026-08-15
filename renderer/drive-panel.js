(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.PetDrivePanel = api;
})(typeof window !== 'undefined' ? window : null, function () {
  const LABELS = {
    attachment: 'attach', curiosity: 'curio', reflection: 'refl',
    duty: 'duty', social: 'social', fatigue: 'fatigue',
    libido: 'libido', stress: 'stress'
  };

  const ORDER = [
    'attachment', 'curiosity', 'reflection', 'duty',
    'social', 'fatigue', 'libido', 'stress'
  ];

  const COLORS = {
    attachment: '#f4a0b0',
    curiosity: '#a0d2f4',
    reflection: '#c4b0e8',
    duty: '#f4c070',
    social: '#7ec8a0',
    fatigue: '#b0a0c8',
    libido: '#f0a0a0',
    stress: '#f08080'
  };

  function buildDrivePanelHtml(state = {}) {
    let html = '<div class="dp-title">drives</div>';
    for (const key of ORDER) {
      const drive = state[key];
      if (!drive) continue;
      const value = Math.max(0, Math.min(1, Number(drive.v) || 0));
      const pct = Math.round(value * 100);
      const color = COLORS[key];
      html += `<div class="drive-row">
        <span class="drive-label">${LABELS[key]}</span>
        <span class="drive-bar"><span class="drive-bar-fill" style="width:${pct}%;background:${color}"></span></span>
        <span class="drive-val">${value.toFixed(2)}</span>
      </div>`;
    }
    return html;
  }

  function updateDrivePanel(panel, state) {
    if (!panel) return;
    panel.innerHTML = buildDrivePanelHtml(state);
  }

  return { LABELS, ORDER, COLORS, buildDrivePanelHtml, updateDrivePanel };
});
