export function looksLikeSeiUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const path = parsed.pathname.toLowerCase();
    const host = parsed.hostname.toLowerCase();
    return (
      /\/sei\d*(\/|$)/i.test(path) ||
      /\/sip(\/|$)/i.test(path) ||
      /\/web\/sei\//i.test(path) ||
      /\/controlador\.php/i.test(path) ||
      host.startsWith('sei.') ||
      host.includes('.sei.')
    );
  } catch {
    return false;
  }
}
