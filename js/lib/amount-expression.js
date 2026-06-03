export function parseAmountExpression(str) {
  const cleaned = str.trim().replace(/\s/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\+\d+)*$/.test(cleaned)) return null;
  return cleaned.split('+').reduce((acc, n) => acc + parseInt(n, 10), 0);
}
