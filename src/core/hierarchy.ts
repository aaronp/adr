/**
 * Decisions as a hierarchy: each record may name a parent, and its children are derived from that.
 * Pure, so the dashboard's tree and sankey views can be tested without a browser.
 */
import type { Adr } from './schema.ts';

export interface TreeNode {
  readonly adr: Adr;
  readonly children: readonly TreeNode[];
}

/** Records as a forest, keeping the given order. A record whose parent is not in the list is a root. */
export const forest = (adrs: readonly Adr[]): TreeNode[] => {
  const ids = new Set(adrs.map((a) => a.id));
  const seen = new Set<string>();
  const build = (a: Adr): TreeNode => {
    seen.add(a.id);
    return { adr: a, children: adrs.filter((c) => c.parent === a.id && !seen.has(c.id)).map(build) };
  };
  return adrs.filter((a) => a.parent === null || !ids.has(a.parent)).map(build);
};

export interface SankeyNode {
  readonly adr: Adr;
  readonly depth: number;
  readonly y: number;
  readonly h: number;
}
export interface SankeyLink {
  readonly from: SankeyNode;
  readonly to: SankeyNode;
  /** Top of the band where it leaves the parent. */
  readonly y0: number;
}
export interface SankeyLayout {
  readonly nodes: readonly SankeyNode[];
  readonly links: readonly SankeyLink[];
  readonly depth: number;
  readonly height: number;
  /** Records with neither parent nor children in the list; a sankey has nothing to draw for them. */
  readonly standalone: number;
}

/**
 * Sankey layout in units of `unit` px per leaf: a node is as tall as the leaves under it, and each child's
 * band leaves its parent in order. Columns are depths. A child sits beside its band unless the column is
 * already taken there, so links curve only when they must. Each tree starts below everything drawn so far.
 */
export const sankey = (adrs: readonly Adr[], unit: number, gap: number): SankeyLayout => {
  const roots = forest(adrs);
  const leaves = (n: TreeNode): number => (n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + leaves(c), 0));
  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const bottom: number[] = [];
  const place = (n: TreeNode, depth: number, want: number): SankeyNode => {
    const y = Math.max(want, (bottom[depth] ?? -gap) + gap);
    const node: SankeyNode = { adr: n.adr, depth, y, h: leaves(n) * unit };
    bottom[depth] = y + node.h;
    nodes.push(node);
    let cursor = y;
    for (const c of n.children) {
      const child = place(c, depth + 1, cursor);
      links.push({ from: node, to: child, y0: cursor });
      cursor += child.h;
    }
    return node;
  };
  const trees = roots.filter((r) => r.children.length > 0);
  for (const r of trees) place(r, 0, Math.max(0, ...bottom.map((b) => b + gap * 3)));
  return { nodes, links, depth: bottom.length, height: Math.max(0, ...bottom), standalone: roots.length - trees.length };
};
