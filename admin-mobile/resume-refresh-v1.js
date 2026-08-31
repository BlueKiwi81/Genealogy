import './tree-snapshot-centre-fit-v1.js';
import './access-activity-v1.js?v=1';

const refreshButton = document.getElementById('refreshButton');
let lastRefreshRequest = 0;

function requestRefresh(force = false) {
  if (!refreshButton || document.visibilityState === 'hidden') return;
  const now = Date.now();
  if (!force && now - lastRefreshRequest < 4000) return;
  lastRefreshRequest = now;
  refreshButton.click();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestRefresh();
});

window.addEventListener('focus', () => requestRefresh());
window.addEventListener('pageshow', () => requestRefresh(true));
