/** Only same-origin paths are valid post-login destinations ("/\evil.com" and friends are not). */
export function safeNext(next: string | null, origin: string): string {
  // Backslashes and whitespace/control characters are normalized by URL parsing into other hosts.
  if (
    !next ||
    !next.startsWith('/') ||
    /[\\\s]/.test(next) ||
    [...next].some((c) => c.charCodeAt(0) < 32)
  )
    return '/';
  try {
    const url = new URL(next, origin);
    return url.origin === origin ? `${url.pathname}${url.search}${url.hash}` : '/';
  } catch {
    return '/';
  }
}
