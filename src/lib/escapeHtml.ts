/** Escapes text for an HTML string (Leaflet tooltip content is raw HTML). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}
