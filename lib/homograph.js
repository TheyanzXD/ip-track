// lib/homograph.js — confusable detection for IDN lookalikes (TODO 05)
const CONFUSABLES = new Map([
  ['а', 'a'], ['е', 'e'], ['о', 'o'], ['р', 'p'], ['с', 'c'], ['у', 'y'],
  ['х', 'x'], ['і', 'i'], ['ј', 'j'], ['ѕ', 's'], ['ҝ', 'k'], ['ѕ', 's'],
  ['а', 'a'], ['и', 'u'], ['ν', 'v'], ['м', 'm'], ['т', 't'], ['н', 'h'],
  ['г', 'r'], ['е', 'e'], ['ѕ', 's'], ['ο', 'o'], ['ρ', 'p'], ['τ', 't'],
  ['υ', 'u'], ['ι', 'i'], ['ο', 'o'], ['ς', 's'], ['ε', 'e'], ['α', 'a'],
  ['а', 'a'], ['в', 'b'], ['с', 'c'], ['е', 'e'], ['н', 'h'], ['к', 'k'],
  ['м', 'm'], ['о', 'o'], ['р', 'p'], ['т', 't'], ['у', 'y'], ['х', 'x']
]);

const CYRILLIC_RE = /[\u0400-\u04FF]/;
const GREEK_RE = /[\u0370-\u03FF]/;

export function detectConfusables(domain) {
  const flags = { cyrillic: false, greek: false, confusableWithAscii: false };
  if (CYRILLIC_RE.test(domain)) flags.cyrillic = true;
  if (GREEK_RE.test(domain)) flags.greek = true;
  if (flags.cyrillic || flags.greek) {
    const asciiForm = [...domain.toLowerCase()].map(ch => CONFUSABLES.get(ch) || ch).join('');
    const hasAsciiLookalike = [...domain.toLowerCase()].some(ch => CONFUSABLES.has(ch));
    flags.confusableWithAscii = hasAsciiLookalike;
    return { suspicious: flags.cyrillic || flags.greek, flags, asciiForm };
  }
  return { suspicious: false, flags, asciiForm: domain };
}

export function isSuspiciousDomain(domain) {
  const lower = domain.toLowerCase();
  const { suspicious } = detectConfusables(lower);
  return suspicious;
}

export default { detectConfusables, isSuspiciousDomain };
