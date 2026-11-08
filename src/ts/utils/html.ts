/**
 * HTML-safe text conversion shared by the editor UI.
 *
 * Keep this module side-effect free so it can be imported by both the
 * future TypeScript application modules and small compatibility adapters.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
