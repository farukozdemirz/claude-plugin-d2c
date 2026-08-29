/**
 * Token redaction — the SINGLE central point.
 *
 * The main plan's Rule 2: the Adobe `access_token` is NEVER, under any condition,
 * written to stdout/stderr, --verbose/--trace, error messages, runs.jsonl, or committed
 * fixtures.
 *
 * The token grants read access to the entire design document and appears in the query
 * string of every CDN request. So every URL leaving this process passes through here —
 * it is not left to the caller to decide that "this log is harmless".
 */

/** Query parameters whose values are to be hidden. */
const GIZLI = new Set(['access_token', 'api_key']);

/** Masks the secret query parameters in a URL. Falls back to a coarse mask if it cannot be parsed. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (GIZLI.has(k)) u.searchParams.set(k, '***');
    }
    return u.toString();
  } catch {
    return redactText(url);
  }
}

/**
 * Looks for the token pattern in free text and masks it.
 * The Adobe token format: `<epoch>_urn:aaid:sc:<region>:<uuid>;public_<hex>`
 */
export function redactText(s: string): string {
  return s
    .replace(/(access_token|api_key)=([^&\s"']+)/gi, '$1=***')
    .replace(/\d{10}_urn:aaid:sc:[^;\s"']+;public_[0-9a-f]+/gi, '***');
}

/** Redacts strings in a deep structure — for JSON output and fixture writing. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactText(value) as unknown as T;
  if (Array.isArray(value)) return value.map(redactDeep) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = GIZLI.has(k) ? '***' : redactDeep(v);
    }
    return out as unknown as T;
  }
  return value;
}

/** An error with a redacted message — so the throw path does not leak either. */
export function redactedError(message: string): Error {
  return new Error(redactText(message));
}
