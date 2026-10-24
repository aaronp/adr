/** The four comparison views. Each takes the same score model, so they always agree. */
import type { Criterion, Solution } from '../../core/schema.ts';
import { scoreLabel, scoreOf, type ScoreModel, type ScoreRow } from '../../core/scoring.ts';
import { plural } from '../../core/dates.ts';
import { rampColor, seriesColor } from '../themes.ts';
import { Dots, Swatch, type Dispatch } from './common.tsx';

type Model = ScoreModel<Criterion, Solution>;
type Row = ScoreRow<Solution>;

interface ChartProps {
  readonly model: Model;
  /** Chosen solution id, or null. */
  readonly decision: string | null;
}

const tagFor = (r: Row, model: Model, decision: string | null): string =>
  decision === r.solution.id ? 'Chosen' : model.leader !== null && model.leader.solution.id === r.solution.id ? 'Highest score' : `Option ${r.index + 1}`;

/** onEdit, when given, turns criterion and solution names into links to that field in the edit form. */
export const MatrixChart = ({ model, decision, onEdit }: ChartProps & { onEdit?: (focus: string) => void }) => {
  const name = (text: string, focus: string) =>
    onEdit === undefined ? (
      text
    ) : (
      <button type="button" class="side-link" title={`Edit ${text}`} onClick={() => onEdit(focus)}>
        <span class="side-link-text">{text}</span>
      </button>
    );
  const cols = `minmax(180px, 1.6fr) 72px repeat(${model.rows.length}, minmax(120px, 1fr))`;
  const colClass = (r: Row) => (decision === r.solution.id ? 'mx-cell chosen' : 'mx-cell');
  return (
    <div class="scroll-x bordered">
      <div style={{ minWidth: 280 + 130 * model.rows.length }}>
        <div class="mx-row mx-head" style={{ gridTemplateColumns: cols }}>
          <div class="mx-cell kicker">Criterion</div>
          <div class="mx-cell kicker center">Weight</div>
          {model.rows.map((r) => (
            <div key={r.solution.id} class={colClass(r)}>
              <span class="row-s strong small-plus">
                <Swatch color={seriesColor(r.index)} />
                {name(r.solution.name, `sn-${r.solution.id}`)}
              </span>
              <span class="mono tiny muted">{tagFor(r, model, decision)}</span>
            </div>
          ))}
        </div>
        {model.criteria.map((c) => (
          <div key={c.id} class="mx-row" style={{ gridTemplateColumns: cols }}>
            <div class="mx-cell small-plus medium">{name(c.name, `cn-${c.id}`)}</div>
            <div class="mx-cell mono strong center">×{c.weight}</div>
            {model.rows.map((r) => {
              const v = scoreOf(r.solution, c.id);
              return (
                <div key={r.solution.id} class={`${colClass(r)} mx-score`}>
                  <span class="mono mx-num">{v === null ? '—' : v}</span>
                  <span class="stack-xs">
                    <Dots value={v} color={seriesColor(r.index)} size={8} />
                    <span class="mono tiny muted">{v === null ? 'unscored' : `= ${v * c.weight}`}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <div class="mx-row mx-foot" style={{ gridTemplateColumns: cols }}>
          <div class="mx-cell strong small-plus">Weighted score</div>
          <div class="mx-cell mono tiny muted center">/ 5</div>
          {model.rows.map((r) => (
            <div key={r.solution.id} class={`${colClass(r)} stack-xs`}>
              <span class="display-num">{scoreLabel(r)}</span>
              <span class="meter">
                <span style={{ width: `${r.pct}%`, background: seriesColor(r.index) }} />
              </span>
              <span class="mono tiny muted">
                Rank #{r.rank} · {Math.round(r.pct)}% of max
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const W = 620;
const H = 460;
const CX = W / 2;
const CY = H / 2;
const R = 150;
const f1 = (x: number): string => x.toFixed(1);

export const RadarChart = ({ model, hidden, dispatch }: ChartProps & { hidden: Readonly<Record<string, boolean>>; dispatch: Dispatch }) => {
  const n = model.criteria.length;
  if (n < 3) {
    return <div class="empty-inline">A radar needs at least three criteria — this record has {n}. Use the matrix or bars instead.</div>;
  }
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, v: number): [number, number] => [CX + R * (v / 5) * Math.cos(ang(i)), CY + R * (v / 5) * Math.sin(ang(i))];
  const ring = (k: number) =>
    model.criteria
      .map((_, i) => {
        const [x, y] = pt(i, k);
        return `${i === 0 ? 'M' : 'L'}${f1(x)} ${f1(y)}`;
      })
      .join('') + 'Z';
  const visible = model.rows.filter((r) => hidden[r.solution.id] !== true);
  const aria = `Radar chart of ${plural(model.rows.length, 'solution')} across ${n} criteria: ${model.rows.map((r) => `${r.solution.name} ${scoreLabel(r)}`).join(', ')}.`;

  return (
    <div class="radar">
      <div class="scroll-x">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={aria} class="radar-svg">
          <g class="radar-grid">
            {[1, 2, 3, 4, 5].map((k) => (
              <path key={k} d={ring(k)} />
            ))}
            {model.criteria.map((c, i) => {
              const [x, y] = pt(i, 5);
              return <line key={c.id} x1={CX} y1={CY} x2={f1(x)} y2={f1(y)} />;
            })}
          </g>
          {[1, 2, 3, 4, 5].map((k) => (
            <text key={k} x={CX + 4} y={CY - (R * k) / 5} class="radar-ring-label" dominant-baseline="middle">
              {k}
            </text>
          ))}
          {visible.map((r) => (
            <polygon
              key={r.solution.id}
              class="radar-poly"
              style={{ fill: seriesColor(r.index), stroke: seriesColor(r.index) }}
              points={model.criteria
                .map((c, i) => {
                  const v = scoreOf(r.solution, c.id);
                  const [x, y] = pt(i, v === null ? 0 : v);
                  return `${f1(x)},${f1(y)}`;
                })
                .join(' ')}
            />
          ))}
          {model.criteria.map((c, i) => {
            const a = ang(i);
            const cos = Math.cos(a);
            const sin = Math.sin(a);
            const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
            const x = CX + (R + 16) * cos;
            const y = CY + (R + 16) * sin + (sin < -0.9 ? -14 : sin > 0.9 ? 14 : 0);
            return (
              <text key={c.id} x={f1(x)} y={f1(y)} text-anchor={anchor} class="radar-label">
                <tspan x={f1(x)} dy="0">
                  {c.name}
                </tspan>
                <tspan x={f1(x)} dy="15" class="radar-weight">
                  weight ×{c.weight}
                </tspan>
              </text>
            );
          })}
        </svg>
      </div>
      <div class="stack-s radar-legend">
        <span class="kicker">Show / hide</span>
        {model.rows.map((r) => {
          const on = hidden[r.solution.id] !== true;
          return (
            <button key={r.solution.id} type="button" class={`legend-btn${on ? '' : ' off'}`} aria-pressed={on} onClick={() => dispatch({ type: 'view/toggleSeries', solutionId: r.solution.id })}>
              <span class="legend-swatch" style={{ borderColor: seriesColor(r.index), background: on ? seriesColor(r.index) : 'transparent' }} />
              <span class="grow strong">{r.solution.name}</span>
              <span class="mono">{scoreLabel(r)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const WeightedBars = ({ model }: ChartProps) => {
  const max = model.totalWeight * 5;
  return (
    <div class="stack-m">
      {model.ranked.map((r) => (
        <div key={r.solution.id} class="stack-xs">
          <div class="row-between">
            <span class="row-s strong">
              <span class="mono small muted">#{r.rank}</span>
              <Swatch color={seriesColor(r.index)} />
              {r.solution.name}
            </span>
            <span class="mono strong">
              {scoreLabel(r)} <span class="muted normal">/ 5</span>
            </span>
          </div>
          <div class="stackbar" role="img" aria-label={`${r.solution.name}: ${scoreLabel(r)} out of 5`}>
            {model.criteria.map((c, i) => {
              const v = scoreOf(r.solution, c.id);
              if (v === null || max === 0) return null;
              return <span key={c.id} title={`${c.name}: ${v} × ${c.weight} = ${v * c.weight}`} style={{ width: `${((v * c.weight) / max) * 100}%`, background: rampColor(i) }} />;
            })}
          </div>
        </div>
      ))}
      <div class="legend-row">
        {model.criteria.map((c, i) => (
          <span key={c.id} class="row-s small">
            <Swatch color={rampColor(i)} size={14} />
            {c.name} <span class="mono tiny muted">×{c.weight}</span>
          </span>
        ))}
      </div>
      <span class="small muted">Each segment is one criterion’s contribution (score × weight). A full bar would be 5 on every criterion.</span>
    </div>
  );
};

export const Heatmap = ({ model }: ChartProps) => {
  const cols = `minmax(170px, 1.4fr) repeat(${model.criteria.length}, minmax(84px, 1fr)) 84px`;
  return (
    <div class="stack-s">
      <div class="scroll-x">
        <div class="stack-xs" style={{ minWidth: 260 + 90 * model.criteria.length }}>
          <div class="heat-row" style={{ gridTemplateColumns: cols }}>
            <div />
            {model.criteria.map((c) => (
              <div key={c.id} class="heat-head">
                <span class="small strong">{c.name}</span>
                <span class="mono tiny muted">×{c.weight}</span>
              </div>
            ))}
            <div class="heat-head kicker">Total</div>
          </div>
          {model.ranked.map((r) => (
            <div key={r.solution.id} class="heat-row" style={{ gridTemplateColumns: cols }}>
              <div class="row-s strong small-plus">
                <Swatch color={seriesColor(r.index)} />
                {r.solution.name}
              </div>
              {model.criteria.map((c) => {
                const v = scoreOf(r.solution, c.id);
                return (
                  <div key={c.id} class={`heat-cell ${v === null ? 'heat-none' : `heat-${v}`}`} title={`${r.solution.name} · ${c.name}: ${v === null ? 'unscored' : v}`}>
                    {v === null ? '—' : v}
                  </div>
                );
              })}
              <div class="heat-total">{scoreLabel(r)}</div>
            </div>
          ))}
        </div>
      </div>
      <div class="row-s small muted wrap-row">
        <span>Score</span>
        {[1, 2, 3, 4, 5].map((k) => (
          <span key={k} class={`heat-key heat-${k}`}>
            {k}
          </span>
        ))}
        <span>· — unscored</span>
      </div>
    </div>
  );
};
