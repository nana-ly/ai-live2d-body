let lastActivityAt = Date.now();

function bumpActivity(source = 'unknown') {
  lastActivityAt = Date.now();
  return { lastActivityAt, source };
}

function getIdleMs() {
  return Date.now() - lastActivityAt;
}

function resetActivity() {
  lastActivityAt = Date.now();
}

module.exports = {
  bumpActivity,
  getIdleMs,
  resetActivity,
  getLastActivityAt: () => lastActivityAt
};
