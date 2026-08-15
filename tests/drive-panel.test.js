const assert = require('node:assert/strict');
const test = require('node:test');

const { buildDrivePanelHtml, COLORS } = require('../renderer/drive-panel');

test('renders fixed per-drive colors and clamps displayed values', () => {
  const html = buildDrivePanelHtml({
    attachment: { v: 0.36 },
    stress: { v: 4 }
  });
  assert.match(html, new RegExp(`background:${COLORS.attachment}`));
  assert.match(html, /width:36%/);
  assert.match(html, /width:100%/);
  assert.match(html, />1\.00</);
});
