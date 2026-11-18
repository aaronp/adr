/**
 * A GitHub-style status badge drawn from a card (see card.ts), as a standalone SVG:
 *
 *   ( Decisions | Accepted 9 | Proposed 1 )
 *
 * A grey title segment, then one segment per legend item with a non-zero count, on that item's colour.
 * Reads only card.json fields, so it works for any tool's card.
 */
import type { Card } from './card.ts';

const FALLBACK = '#6B7280';
const TITLE_BG = '#555';

/* Width estimate for 11px Verdana, as shields.io badges use: ~7px a character, emoji a little wider. */
const width = (t: string): number => [...t].reduce((w, ch) => w + (/[\p{Extended_Pictographic}]/u.test(ch) ? 14 : /[️]/.test(ch) ? 0 : 7), 0) + 12;
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const badgeSvg = (card: Card): string => {
  const items = card.legend.map((l) => ({ ...l, n: card.report[l.id] ?? 0 })).filter((l) => l.n > 0);
  const parts = [{ text: card.title, bg: TITLE_BG }, ...items.map((l) => ({ text: `${l.label} ${l.n}`, bg: l.color ?? FALLBACK }))];
  let x = 0;
  const segs = parts.map((p) => {
    const w = width(p.text);
    const seg = `<rect x="${x}" width="${w}" height="20" fill="${esc(p.bg)}"/><text x="${x + w / 2}" y="14" fill="#fff">${esc(p.text)}</text>`;
    x += w;
    return seg;
  });
  const title = esc(`${card.title}: ${items.length === 0 ? 'none' : items.map((l) => `${l.n} ${l.label.toLowerCase()}`).join(', ')}`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${x}" height="20" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<clipPath id="r"><rect width="${x}" height="20" rx="7"/></clipPath>`,
    `<g clip-path="url(#r)" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">`,
    ...segs,
    '</g>',
    '</svg>',
    ''
  ].join('\n');
};
