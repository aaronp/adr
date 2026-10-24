/**
 * Weighted scoring. Works on saved records and on in-progress form drafts (where a weight may not be
 * chosen yet). A null weight or score is "not set": it contributes nothing and marks the result
 * incomplete — it is never silently treated as zero in a reported total.
 */

export interface ScorableCriterion {
  readonly id: string;
  readonly weight: number | null;
}
export interface ScorableSolution {
  readonly id: string;
  readonly scores: Readonly<Record<string, number | null>>;
}

export interface ScoreRow<S extends ScorableSolution> {
  readonly solution: S;
  /** Position in the record's solution list; drives the series colour. */
  readonly index: number;
  /** Criteria this solution has no score for. */
  readonly missing: number;
  /** True when every score and every weight is set. Only complete rows have an average. */
  readonly complete: boolean;
  /** Σ score × weight over scored criteria. */
  readonly raw: number;
  /** Weighted average on the 1–5 scale, or null when incomplete. */
  readonly avg: number | null;
  /** raw as a percentage of the maximum possible (all 5s). */
  readonly pct: number;
  /** 1-based rank by raw score; ties keep list order. */
  readonly rank: number;
}

export interface ScoreModel<C extends ScorableCriterion, S extends ScorableSolution> {
  readonly criteria: readonly C[];
  readonly totalWeight: number;
  readonly unweighted: number;
  /** In list order. */
  readonly rows: readonly ScoreRow<S>[];
  /** Best first. */
  readonly ranked: readonly ScoreRow<S>[];
  /** Highest-ranked complete row, or null when none is complete. */
  readonly leader: ScoreRow<S> | null;
}

export const scoreOf = (s: ScorableSolution, criterionId: string): number | null => {
  const v = s.scores[criterionId];
  return v === undefined ? null : v;
};

export const scoreModel = <C extends ScorableCriterion, S extends ScorableSolution>(input: {
  readonly criteria: readonly C[];
  readonly solutions: readonly S[];
}): ScoreModel<C, S> => {
  const { criteria, solutions } = input;
  const weightOf = (c: C): number => (c.weight === null ? 0 : c.weight);
  const totalWeight = criteria.reduce((a, c) => a + weightOf(c), 0);
  const unweighted = criteria.filter((c) => c.weight === null).length;

  const base = solutions.map((solution, index) => {
    let raw = 0;
    let missing = 0;
    for (const c of criteria) {
      const v = scoreOf(solution, c.id);
      if (v === null) missing++;
      else raw += v * weightOf(c);
    }
    const complete = missing === 0 && unweighted === 0 && criteria.length > 0 && totalWeight > 0;
    return {
      solution,
      index,
      missing,
      complete,
      raw,
      avg: complete ? raw / totalWeight : null,
      pct: totalWeight > 0 ? (raw / (totalWeight * 5)) * 100 : 0
    };
  });

  const order = base.slice().sort((a, b) => b.raw - a.raw || a.index - b.index);
  const rankById = new Map(order.map((r, i) => [r.solution.id, i + 1]));
  const withRank = (r: (typeof base)[number]): ScoreRow<S> => {
    const rank = rankById.get(r.solution.id);
    if (rank === undefined) throw new Error(`bug: no rank for solution "${r.solution.id}"`);
    return { ...r, rank };
  };
  const ranked = order.map(withRank);
  return {
    criteria,
    totalWeight,
    unweighted,
    rows: base.map(withRank),
    ranked,
    leader: ranked.find((r) => r.complete) ?? null
  };
};

/** "3.9", "2 unscored" or "unweighted". */
export const scoreLabel = (r: ScoreRow<ScorableSolution>): string => {
  if (r.avg !== null) return r.avg.toFixed(1);
  if (r.missing > 0) return `${r.missing} unscored`;
  return 'unweighted';
};

export const findRow = <S extends ScorableSolution>(model: ScoreModel<ScorableCriterion, S>, solutionId: string): ScoreRow<S> => {
  const r = model.rows.find((x) => x.solution.id === solutionId);
  if (r === undefined) throw new Error(`bug: no solution "${solutionId}" in this record`);
  return r;
};
