/** "35.000,50" / "35000.5" / "35" → number. A dot followed by exactly 3 digits is a thousands separator. */
export function parseAmount(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  let n: string;
  if (t.includes(',')) n = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, '');
  else n = t;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
