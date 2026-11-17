/**
 * A GitHub-style status badge for the ledger, as a standalone SVG:
 *
 *   ( A: 3 ✅ | P: 2 ⏳ | D: 1 ⚠️ )
 *
 * accepted, proposed, and revisits due (overdue or within 30 days). Colours are passed in (the page's theme),
 * so the badge matches the ledger it came from.
 */
import type { Adr } from './schema.ts';
import { isRevisitDue } from './search.ts';

export interface BadgeColors {
  readonly accepted: string;
  readonly proposed: string;
  readonly due: string;
  /** Text on the three coloured segments. */
  readonly text: string;
}

/* Width estimate for 11px Verdana, as shields.io badges use: ~7px a character, emoji a little wider. */
const width = (t: string): number => [...t].reduce((w, ch) => w + (/[\p{Extended_Pictographic}]/u.test(ch) ? 14 : /[️]/.test(ch) ? 0 : 7), 0) + 12;

export const badgeSvg = (adrs: readonly Adr[], today: string, c: BadgeColors): string => {
  const accepted = adrs.filter((a) => a.status === 'accepted').length;
  const proposed = adrs.filter((a) => a.status === 'proposed').length;
  const due = adrs.filter((a) => isRevisitDue(a, today)).length;
  const parts = [
    { text: `A: ${accepted} ✅`, bg: c.accepted, fg: c.text },
    { text: `P: ${proposed} ⏳`, bg: c.proposed, fg: c.text },
    { text: `D: ${due} ⚠️`, bg: c.due, fg: c.text }
  ];
  let x = 0;
  const segs = parts.map((p) => {
    const w = width(p.text);
    const seg = `<rect x="${x}" width="${w}" height="20" fill="${p.bg}"/><text x="${x + w / 2}" y="14" fill="${p.fg}">${p.text}</text>`;
    x += w;
    return seg;
  });
  const title = `Decisions: ${accepted} accepted, ${proposed} proposed, ${due} due for revisit`;
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
