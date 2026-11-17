/** Pure guide geometry ported from the supplied v0.8.8 hierarchy-visual-hook.
 * No Editor/DOM code: input is measured layout, output is paint geometry.
 */
namespace VHierarchyGuides {
  export interface Row {
    padding: number;
    margin: number;
    anchor: number;
    reportedDepth?: number | null;
    searching?: boolean;
  }
  export type Indent = 'padding' | 'margin';
  export interface Layout { mode: Indent; step: number; base: number; }
  export interface Rail { level: number; shape: 'full' | 'lower' | 'last'; }
  export interface Node {
    depth: number;
    valid: boolean;
    parent: number | null;
    hasNextSibling: boolean;
    rails: Rail[];
    elbowX: number;
    elbowWidth: number;
    offset: number;
    indent: number;
  }
  export interface Result { layout: Layout; nodes: Node[]; }
  function median(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  }
  export function detectLayout(rows: Row[]): Layout {
    if (!rows.length) return { mode: 'padding', step: 20, base: 0 };
    const extent = (key: Indent): number => Math.max(...rows.map(r => r[key])) - Math.min(...rows.map(r => r[key]));
    const mode: Indent = extent('padding') >= extent('margin') ? 'padding' : 'margin';
    const levels = rows.map(row => row[mode]);
    const unique = [...new Set(levels.map(v => Math.round(v * 10) / 10))].sort((a, b) => a - b);
    const depthKnown = rows.filter(r => Number.isInteger(r.reportedDepth) && (r.reportedDepth as number) >= 0);
    const candidates: number[] = [];
    for (let i = 1; i < depthKnown.length; i++) {
      const a = depthKnown[i - 1], b = depthKnown[i];
      const delta = Math.abs((a.reportedDepth as number) - (b.reportedDepth as number));
      const step = delta ? Math.abs(a[mode] - b[mode]) / delta : 0;
      if (step >= 8 && step <= 40) candidates.push(step);
    }
    const deltas: number[] = [];
    for (let i = 1; i < unique.length; i++) {
      const d = unique[i] - unique[i - 1];
      if (d >= 8 && d <= 40) deltas.push(d);
    }
    const step = Math.max(8, Math.min(40, median(candidates.length ? candidates : deltas.length ? deltas : [20])));
    const bases = depthKnown.map(r => r[mode] - (r.reportedDepth as number) * step).filter(v => Number.isFinite(v) && v >= 0);
    const base = Math.max(0, median(bases.length ? bases : [Math.min(...levels)]));
    return { mode, step, base };
  }
  /** Flat depth-first rows; do not guess missing ancestors during filtered/virtualized views. */
  export function calculate(rows: Row[], maxDepth = 32): Result {
    const layout = detectLayout(rows);
    const { mode, step, base } = layout;
    const stack: number[] = [];
    const nodes: Node[] = [];
    const lastChild = new Map<number, number>();
    for (const row of rows) {
      const indent = row[mode];
      const measured = Math.round((indent - base) / step);
      const declared = Number.isInteger(row.reportedDepth) && (row.reportedDepth as number) >= 0 ? row.reportedDepth as number : null;
      const depth = declared !== null && Math.abs(base + declared * step - indent) < step / 2 ? declared : measured;
      const entry: Node = { depth, valid: false, parent: null, hasNextSibling: false, rails: [], elbowX: 0, elbowWidth: 0,
        offset: mode === 'margin' ? -indent : 0, indent };
      const index = nodes.push(entry) - 1;
      if (row.searching || depth < 0 || depth > maxDepth || depth > stack.length) { stack.length = 0; continue; }
      stack.length = depth;
      const parent = depth > 0 ? stack[depth - 1] : null;
      if (depth > 0 && parent === undefined) { stack.length = 0; continue; }
      entry.parent = parent ?? null;
      entry.valid = true;
      if (parent !== null && parent !== undefined) {
        const prior = lastChild.get(parent);
        if (prior !== undefined) nodes[prior].hasNextSibling = true;
        lastChild.set(parent, index);
      }
      stack.push(index);
    }
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index];
      if (!node.valid || node.depth < 1) continue;
      let parentIndex = node.parent;
      while (parentIndex !== null) {
        const ancestor = nodes[parentIndex];
        if (ancestor.depth >= 1 && ancestor.hasNextSibling) node.rails.push({ level: ancestor.depth, shape: 'full' });
        parentIndex = ancestor.parent;
      }
      if (node.hasNextSibling) node.rails.push({ level: node.depth, shape: 'lower' });
      node.rails.sort((a, b) => a.level - b.level);
      node.elbowX = base + (node.depth - 0.5) * step;
      const anchor = Number.isFinite(rows[index].anchor) ? rows[index].anchor : node.indent;
      node.elbowWidth = Math.max(0, anchor - node.elbowX);
    }
    return { layout, nodes };
  }
}
