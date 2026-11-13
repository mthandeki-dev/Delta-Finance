export interface TextPart {
  text: string;
  isFiller: boolean;
}

const FILLER_WORDS = new Set([
  'uh', 'uhh', 'uhhh', 'um', 'umm', 'er', 'err', 'ah', 'ahh', 'hmm', 'hm',
  'like', 'basically', 'literally', 'anyway', 'wait', 'sorry',
  'neh', 'eish', 'yoh', 'ja', 'sharp', 'wena', 'mara',
]);

const FILLER_PHRASES = [
  'you know', 'i mean', 'you see', 'kind of', 'sort of',
  'no wait', 'sharp sharp', 'ja neh', 'wait actually',
];

export function getFillerParts(raw: string): TextPart[] {
  let work = raw;
  const replaced: string[] = [];

  for (const phrase of FILLER_PHRASES) {
    const re = new RegExp(`\\b${phrase}\\b`, 'gi');
    work = work.replace(re, (m) => {
      replaced.push(m);
      return `\x00${replaced.length - 1}\x00`;
    });
  }

  const parts: TextPart[] = [];
  const tokens = work.split(/(\s+)/);

  for (const token of tokens) {
    if (!token) continue;
    if (/^\s+$/.test(token)) {
      if (parts.length) parts[parts.length - 1].text += token;
      continue;
    }
    const sentinelMatch = token.match(/^\x00(\d+)\x00$/);
    if (sentinelMatch) {
      parts.push({ text: replaced[Number(sentinelMatch[1])], isFiller: true });
      continue;
    }
    const clean = token.toLowerCase().replace(/[.,!?—-]+$/, '');
    parts.push({ text: token, isFiller: FILLER_WORDS.has(clean) });
  }

  return parts.length ? parts : [{ text: raw, isFiller: false }];
}

export function stripFiller(raw: string): string {
  return getFillerParts(raw)
    .filter((p) => !p.isFiller)
    .map((p) => p.text)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function hasFillers(raw: string): boolean {
  return getFillerParts(raw).some((p) => p.isFiller);
}

export interface VendorMatch {
  id: string;
  label: string;
  score: number;
}

export function matchVendors(text: string, vendors: { id: string; label: string }[]): VendorMatch | null {
  if (!vendors.length) return null;
  const textLower = text.toLowerCase();
  let best: VendorMatch | null = null;

  for (const vendor of vendors) {
    // Tokenise the vendor label, skip trivial words < 3 chars
    const tokens = vendor.label.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
    if (!tokens.length) continue;
    const matched = tokens.filter((t) => textLower.includes(t)).length;
    const score = matched / tokens.length;
    if (score >= 0.5 && (!best || score > best.score)) {
      best = { id: vendor.id, label: vendor.label, score };
    }
  }
  return best;
}
