/** Decisions flowing into their sub-decisions: band width is the number of leaf decisions underneath. */
import type { Adr, Status } from '../../core/schema.ts';
import { sankey } from '../../core/hierarchy.ts';
import { plural } from '../../core/dates.ts';
import { STATUSES } from '../../core/schema.ts';
import { Swatch, statusLabel, type Dispatch } from './common.tsx';

const STATUS_COLOR: Record<Status, string> = {
  proposed: 'var(--accent)',
  accepted: 'var(--good)',
  superseded: 'var(--border-strong)',
  deprecated: 'var(--warn-fg)',
  rejected: 'var(--bad)'
};
const UNIT = 40;
const GAP = 10;
/** Node box width; the rest of the column is where bands flow. */
const BOX = 230;
const COL = 330;
const BAR = 5;
const PAD = 8;

const short = (t: string, n: number): string => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export const Sankey = ({ adrs, dispatch }: { adrs: readonly Adr[]; dispatch: Dispatch }) => {
  const s = sankey(adrs, UNIT, GAP);
  if (s.nodes.length === 0)
    return <div class="empty-inline">None of these records has a parent or children. Set "parent:" on a record to build a hierarchy.</div>;
  const x = (depth: number) => PAD + depth * COL;
  const width = x(s.depth - 1) + BOX + PAD;
  return (
    <div class="card pad stack-m">
      <div class="row-s wrap-row small muted">
        {STATUSES.map((st) => (
          <span key={st} class="row-xs">
            <Swatch color={STATUS_COLOR[st]} />
            {statusLabel(st)}
          </span>
        ))}
        {s.standalone > 0 ? <span class="mono">· {plural(s.standalone, 'standalone record')} not shown</span> : null}
      </div>
      <div class="scroll-x">
        <svg width={width} height={s.height + PAD * 2} viewBox={`0 0 ${width} ${s.height + PAD * 2}`} role="img" aria-label="Decision hierarchy as a sankey diagram">
          <g transform={`translate(0 ${PAD})`}>
            {s.links.map((l) => {
              const x0 = x(l.from.depth) + BOX;
              const x1 = x(l.to.depth);
              const m = (x0 + x1) / 2;
              const { y0 } = l;
              const y1 = l.to.y;
              const h = l.to.h;
              return (
                <path
                  key={l.to.adr.id}
                  d={`M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1} L${x1},${y1 + h} C${m},${y1 + h} ${m},${y0 + h} ${x0},${y0 + h} Z`}
                  fill={STATUS_COLOR[l.to.adr.status]}
                  fill-opacity={0.22}
                />
              );
            })}
            {s.nodes.map((n) => (
              <g
                key={n.adr.id}
                class="sankey-node"
                role="link"
                tabIndex={0}
                aria-label={`${n.adr.id}: ${n.adr.title}`}
                onClick={() => dispatch({ type: 'nav/view', id: n.adr.id })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') dispatch({ type: 'nav/view', id: n.adr.id });
                }}
              >
                <title>{`${n.adr.id} · ${statusLabel(n.adr.status)}\n${n.adr.title}`}</title>
                <rect x={x(n.depth)} y={n.y} width={BOX} height={n.h} rx={4} class="sankey-box" />
                <rect x={x(n.depth)} y={n.y} width={BAR} height={n.h} rx={2} fill={STATUS_COLOR[n.adr.status]} />
                <text x={x(n.depth) + BAR + 8} y={n.y + 16} class="sankey-id">
                  {n.adr.id}
                </text>
                <text x={x(n.depth) + BAR + 8} y={n.y + 32} class="sankey-title">
                  {short(n.adr.title, 30)}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
};
