const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
/** Safe to put inside HTML text or an attribute. */
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => entities[char])
