/**
 * DOM notification utility.
 *
 * This module is staged for the Vite/TypeScript entrypoint. The current
 * GitHub Pages entrypoint continues to use the legacy classic-script helper
 * until the built deployment has been verified.
 */
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
