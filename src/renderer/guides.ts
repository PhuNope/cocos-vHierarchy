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

  export type GuideMode = 'tree' | 'minimal';
  /**
   * Hit-test an 8px tolerance around guides, not the rest of the gutter.
   * Coordinates are relative to the native ui-drag-item bounding rectangle.
   * Returns the depth of the line, whose parent is at depth - 1.
   */
  export function hitTest(node: Node, layout: Layout, x: number, y: number,
    height: number, mode: GuideMode, tolerance = 8): number | null {
    if (!node.valid || node.depth < 1 || !Number.isFinite(x) || !Number.isFinite(y) ||
      !Number.isFinite(height) || height <= 0 || y < 0 || y > height) return null;
    if (mode === 'tree' && node.elbowX > 1 && node.elbowWidth >= 5 &&
      Math.abs(y - height / 2) <= tolerance &&
      x >= node.offset + node.elbowX - tolerance &&
      x <= node.offset + node.elbowX + node.elbowWidth + tolerance) return node.depth;
    const rails = mode === 'minimal'
      ? [...node.rails.filter(rail => rail.shape !== 'lower'),
        { level: node.depth, shape: node.hasNextSibling ? 'full' as const : 'last' as const }]
      : node.rails;
    // The nearest rail under the cursor wins; rendering uses the same x/shape rules.
    for (const rail of rails) {
      const lineX = layout.base + (rail.level - 0.5) * layout.step;
      if (lineX <= 1 || lineX >= node.indent - 1 ||
        Math.abs(x - (node.offset + lineX)) > tolerance) continue;
      if (rail.shape === 'lower' && y < height / 2 - tolerance) continue;
      if (rail.shape === 'last' && y > height * .78 + tolerance) continue;
      return rail.level;
    }
    return null;
  }
  /** Highlight only the connection that leads from each visible parent to a
   * selected node. Intermediate siblings carry the selected trunk, while the
   * child's elbow is highlighted. Multiple selections are unioned; a missing
   * parent/filtered view never invents a connection. O(rows * maxDepth).
   */
  export interface SelectionGuide { rails: number[]; elbow: boolean; throughElbow: boolean; }
  export function selectedGuides(nodes: Node[], selections: readonly number[], maxDepth = 32): SelectionGuide[] {
    const depthLimit = Math.max(0, Math.min(32, Math.floor(maxDepth)));
    const delta = Array.from({length: depthLimit + 1}, () => new Int32Array(nodes.length + 1));
    const elbows = new Uint8Array(nodes.length);
    for (const index of new Set(selections)) {
      if (!Number.isInteger(index) || index < 0 || index >= nodes.length || !nodes[index].valid) continue;
      let current: number | null = index;
      while (current !== null) {
        const node: Node = nodes[current];
        if (!node.valid || node.depth < 0 || node.depth > depthLimit) break;
        if (node.depth > 0) {
          elbows[current] = 1;
          const parent = node.parent;
          if (parent === null || !nodes[parent]?.valid || nodes[parent].depth !== node.depth - 1) break;
          // Connect parent to child through all preceding visible sibling rows.
          if (parent + 1 < current) {
            delta[node.depth][parent + 1]++;
            delta[node.depth][current]--;
          }
        }
        current = node.parent;
      }
    }
    const active = new Int32Array(depthLimit + 1);
    return nodes.map((node, index) => {
      for (let level = 1; level <= depthLimit; level++) active[level] += delta[level][index];
      const rails: number[] = [];
      if (node.valid) for (let level = 1; level <= Math.min(depthLimit, node.depth); level++) {
        if (active[level] > 0) rails.push(level);
      }
      return { rails, elbow: elbows[index] !== 0, throughElbow: rails.includes(node.depth) };
    });
  }

  /** Bounded screen-space adjustment for Creator's native dashed drop rail.
   * The native drop marker and vHierarchy rails can differ by one indent step
   * after Creator computes the drag target. Never move a marker by more than
   * one measured indentation step (plus border/pixel rounding tolerance). */
  export function dropGuideCorrection(nativeRailX: number, guideRailX: number, step: number): number {
    if (![nativeRailX, guideRailX, step].every(Number.isFinite) || step < 8 || step > 40) return 0;
    const delta = guideRailX - nativeRailX;
    return Math.abs(delta) <= step + 4 ? Math.round(delta * 2) / 2 : 0;
  }

  /** Identify the vertical guide that belongs to the intended insertion branch.
   * Cocos draws its dotted rail beside the target icon (at child indentation).
   * In our hierarchy visualization, the connecting trunk is the visible
   * parent's elbow, one depth level to the LEFT. Snapping back to the nearest
   * level calculated from the *dotted line itself* always keeps the old error.
   * This returns a level, not a pixel offset, so nested prefabs and non-20px
   * indentation use the same source of truth as our painted guides. */
  export function dropTrunkLevel(nodes: readonly Node[], targetIndex: number): number | null {
    const node = nodes[targetIndex];
    if (!node?.valid || node.depth < 1) return null;
    if (node.parent !== null) {
      const parent = nodes[node.parent];
      if (parent?.valid && parent.depth >= 1 && parent.depth === node.depth - 1)
        return parent.depth;
    }
    return node.depth;
  }

  /** Absolute visual shift based on the native rail BEFORE previous patches'
   * translation. Returning an absolute shift (not a delta to keep accumulating)
   * avoids jitter and drift when Vue updates the drop-box during an active drag.
   * The Cocos native marker can be 1-4 indentation levels away, so do not
   * artificially cap correction to a single indentation step. */
  export function dropTrunkShift(renderedX: number, previousShift: number, targetX: number, step: number): number | null {
    if (![renderedX, previousShift, targetX, step].every(Number.isFinite) || step < 8 || step > 40) return null;
    const nativeX = renderedX - previousShift;
    const correction = targetX - nativeX;
    if (Math.abs(correction) > 4 * step + 8) return null;
    return Math.round(correction * 2) / 2;
  }

  /** Returns a visible ancestor, never a guessed parent in a filtered/virtualized tree. */
  export function foldParentIndex(nodes: Node[], childIndex: number, lineLevel: number): number | null {
    if (!Number.isInteger(lineLevel) || lineLevel < 1 ||
      !Number.isInteger(childIndex) || childIndex < 0 || childIndex >= nodes.length) return null;
    let current: number | null = childIndex;
    while (current !== null) {
      const node: Node = nodes[current];
      if (!node?.valid) return null;
      if (node.depth === lineLevel - 1) return current;
      if (node.depth < lineLevel - 1) return null;
      current = node.parent;
    }
    return null;
  }
}
