const encoder = new TextEncoder();

/** Convert an ArrayBuffer or Uint8Array to lowercase hex. */
export function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  for (let i = 0; i < arr.length; i++) {
    out += (arr[i] ?? 0).toString(16).padStart(2, '0');
  }
  return out;
}

/** Compute lowercase hex SHA-256 digest using WebCrypto. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(digest);
}

/** Compute lowercase hex SHA-512 digest using WebCrypto (required by Midtrans signature_key). */
export async function sha512Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-512', encoder.encode(input));
  return bytesToHex(digest);
}

/** Compute lowercase hex HMAC-SHA256 using WebCrypto. */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToHex(sig);
}

/** Constant-time string comparison resistant to timing side-channels. */
export function constantTimeEqual(a: string, b: string): boolean {
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);
  const maxLen = Math.max(bytesA.length, bytesB.length);
  let diff = bytesA.length ^ bytesB.length;
  for (let i = 0; i < maxLen; i++) {
    const ba = i < bytesA.length ? (bytesA[i] ?? 0) : 0;
    const bb = i < bytesB.length ? (bytesB[i] ?? 0) : 0;
    diff |= ba ^ bb;
  }
  return diff === 0;
}

/** Normalize signature header values like `sha256=<hex>` to plain lowercase hex. */
export function normalizeHexSig(headerVal: string | null | undefined): string {
  if (!headerVal) return '';
  return headerVal.trim().replace(/^sha256=/i, '').toLowerCase();
}

/** Build a privacy-safe daily rotating visitor hash without storing raw IP addresses. */
export async function buildDailyVisitorHash(
  workspaceId: string,
  ip: string,
  userAgent: string,
  now = new Date()
): Promise<string> {
  const day = now.toISOString().slice(0, 10);
  const hash = await sha256Hex(`${workspaceId}|${day}|${ip}|${userAgent}`);
  return hash.slice(0, 32);
}

/** Normalize an Indonesian/international phone number or email to a canonical contact string. */
export function normalizeContact(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.startsWith('08')) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

/** Produce a masked contact string safe for dashboard display (no PII exposure). */
export function maskContact(raw: string | null | undefined): string | null {
  const norm = normalizeContact(raw);
  if (!norm) return null;
  if (norm.includes('@')) {
    const [user, domain] = norm.split('@');
    const prefix = (user ?? '').slice(0, 2);
    return `${prefix}***@${domain ?? ''}`;
  }
  if (norm.length <= 6) return '***';
  return `${norm.slice(0, 4)}***${norm.slice(-3)}`;
}

/** Compute deterministic customer hash scoped to a workspace. */
export async function buildCustomerHash(
  workspaceId: string,
  phone?: string | null,
  email?: string | null
): Promise<{ customerHash: string | null; customerRef: string | null }> {
  const canonical = normalizeContact(phone) ?? normalizeContact(email);
  if (!canonical) {
    return { customerHash: null, customerRef: null };
  }
  const digest = await sha256Hex(`${workspaceId}|${canonical}`);
  return {
    customerHash: digest.slice(0, 32),
    customerRef: maskContact(phone ?? email),
  };
}
