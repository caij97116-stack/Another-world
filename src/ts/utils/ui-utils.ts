/**
 * Shared UI utilities corresponding to the legacy src/js/ui-utils.js module.
 * Keep the HTML conversion pure; the toast helper only touches the DOM when called.
 */

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function showToast(message: unknown, type = ''): void {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' ' + type : '');
  toast.textContent = String(message);
  container.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all .25s ease';
    window.setTimeout(() => toast.remove(), 260);
  }, 2200);
}
