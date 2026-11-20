const ALPHANUM = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Generate a short URL-safe random identifier with an optional prefix. */
export function generateId(prefix = '', length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let body = '';
  for (let i = 0; i < length; i++) {
    body += ALPHANUM[(bytes[i] ?? 0) % ALPHANUM.length] ?? 'a';
  }
  return prefix ? `${prefix}_${body}` : body;
}

/** Generate a compact shortlink code (6 chars default). */
export function generateShortCode(length = 6): string {
  return generateId('', length);
}

/** Parse ISO timestamp safely, returning epoch ms or null. */
export function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Return an ISO-8601 UTC timestamp offset by `days` from `baseIso`. */
export function addDaysIso(baseIso: string, days: number): string {
  const baseMs = Date.parse(baseIso);
  return new Date(baseMs + days * 86_400_000).toISOString();
}

/** Convert an IDR/USD amount into integer IDR using the configured FX rate. */
export function toIdrAmount(amount: number, currency: string | undefined, usdToIdrRate: number): number {
  const cleanAmount = Number.isFinite(amount) ? amount : 0;
  if ((currency ?? 'IDR').toUpperCase() === 'USD') {
    return Math.round(cleanAmount * usdToIdrRate);
  }
  return Math.round(cleanAmount);
}

/** Format an IDR amount concisely for insight cards and WhatsApp/Telegram alerts. */
export function formatIdr(amount: number): string {
  const rounded = Math.round(amount);
  return `Rp${rounded.toLocaleString('id-ID')}`;
}
