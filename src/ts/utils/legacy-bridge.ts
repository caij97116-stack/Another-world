import { escapeHtml, showToast } from './index';

declare global {
  interface Window {
    escapeHtml: typeof escapeHtml;
    showToast: typeof showToast;
  }
}

/**
 * Install the utility exports as window properties for the remaining
 * classic-script modules. Call this before the legacy app init() function.
 */
export function installLegacyUtilities(): void {
  window.escapeHtml = escapeHtml;
  window.showToast = showToast;
}
