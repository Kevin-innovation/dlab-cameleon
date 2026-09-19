import { blocked } from "./engine/collision";
import { mapColliders } from "./maps";
import type { Collider, GameMap } from "./types";

/**
 * Grid navigation for bots. The walkable mask is baked once per map (and body
 * radius) from the static colliders, so route queries never touch the collider
 * list again: A* over a few thousand cells plus a string-pull pass is cheap
 * enough to run for eight bots every few hundred milliseconds.
 *
 * Doors are not part of the mask; bots treat them as passable and open them on
 * approach, which matches how they already behave.
 */

export type NavPoint = { x: number; z: number };

export type NavGrid = {
  cell: number;
  cols: number;
  rows: number;
  /** 1 = a body of the baked radius fits at the cell centre. */
  walkable: Uint8Array;
  w: number;
  d: number;
};

export const NAV_CELL = 0.25;
/** Bots step over anything lower than this (kerbs, pipes on the floor) instead of routing around it. */
export const NAV_STEP_HEIGHT = 0.36;
export const NAV_HEAD_HEIGHT = 1.72;
const SNAP_RADIUS_CELLS = 4;
const DIAG = Math.SQRT2;

export function buildNavGrid(map: GameMap, radius: number, cell = NAV_CELL, colliders: Collider[] = mapColliders(map)): NavGrid {
  const cols = Math.max(1, Math.ceil(map.w / cell));
  const rows = Math.max(1, Math.ceil(map.d / cell));
  const walkable = new Uint8Array(cols * rows);
  const bounds = { w: map.w, d: map.d };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = (col + 0.5) * cell;
      const z = (row + 0.5) * cell;
      walkable[row * cols + col] = blocked(x, z, radius, colliders, bounds, NAV_STEP_HEIGHT, NAV_HEAD_HEIGHT) ? 0 : 1;
    }
  }
  return { cell, cols, rows, walkable, w: map.w, d: map.d };
}

const grids = new Map<string, NavGrid>();

/** Cached grid per map + radius; maps are static so the mask never goes stale. */
export function navGridFor(map: GameMap, radius: number): NavGrid {
  const key = `${map.id}:${radius.toFixed(2)}`;
  let grid = grids.get(key);
  if (!grid) {
    grid = buildNavGrid(map, radius);
    grids.set(key, grid);
  }
  return grid;
}

export function clearNavCache() {
  grids.clear();
}

function cellOf(grid: NavGrid, p: NavPoint) {
  const col = Math.max(0, Math.min(grid.cols - 1, Math.floor(p.x / grid.cell)));
  const row = Math.max(0, Math.min(grid.rows - 1, Math.floor(p.z / grid.cell)));
  return row * grid.cols + col;
}

function centreOf(grid: NavGrid, index: number): NavPoint {
  return { x: ((index % grid.cols) + 0.5) * grid.cell, z: (Math.floor(index / grid.cols) + 0.5) * grid.cell };
}

/** Nearest walkable cell to `index` within a few rings; -1 if the area is fully solid. */
export function nearestWalkable(grid: NavGrid, index: number): number {
  if (grid.walkable[index]) return index;
  const col0 = index % grid.cols;
  const row0 = Math.floor(index / grid.cols);
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let ring = 1; ring <= SNAP_RADIUS_CELLS && best < 0; ring++) {
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const row = row0 + dr;
        const col = col0 + dc;
        if (row < 0 || col < 0 || row >= grid.rows || col >= grid.cols) continue;
        const candidate = row * grid.cols + col;
        if (!grid.walkable[candidate]) continue;
        const dist = dr * dr + dc * dc;
        if (dist < bestDist) {
          bestDist = dist;
          best = candidate;
        }
      }
    }
  }
  return best;
}

/** True when every cell along the segment is walkable (sampled at half a cell). */
export function gridLineClear(grid: NavGrid, a: NavPoint, b: NavPoint): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (grid.cell * 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!grid.walkable[cellOf(grid, { x: a.x + dx * t, z: a.z + dz * t })]) return false;
  }
  return true;
}

/** Binary min-heap keyed by f-score; indices into the grid. */
class Heap {
  private items: number[] = [];
  constructor(private readonly score: Float64Array) {}
  get size() {
    return this.items.length;
  }
  push(index: number) {
    const items = this.items;
    items.push(index);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score[items[parent]] <= this.score[items[i]]) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop() as number;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && this.score[items[l]] < this.score[items[m]]) m = l;
        if (r < items.length && this.score[items[r]] < this.score[items[m]]) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* over the grid (8-neighbour, no corner cutting) from `start` to `goal`,
 * string-pulled so the bot walks straight wherever the grid allows. Returns
 * waypoints in world units ending at `goal`, or [] when no route exists.
 */
export function findPath(grid: NavGrid, start: NavPoint, goal: NavPoint): NavPoint[] {
  const from = nearestWalkable(grid, cellOf(grid, start));
  const to = nearestWalkable(grid, cellOf(grid, goal));
  if (from < 0 || to < 0) return [];
  if (from === to) return [goal];

  const { cols, rows, walkable } = grid;
  const g = new Float64Array(cols * rows).fill(Number.POSITIVE_INFINITY);
  const f = new Float64Array(cols * rows).fill(Number.POSITIVE_INFINITY);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const toCol = to % cols;
  const toRow = Math.floor(to / cols);
  const heuristic = (index: number) => {
    const dc = Math.abs((index % cols) - toCol);
    const dr = Math.abs(Math.floor(index / cols) - toRow);
    return Math.max(dc, dr) + (DIAG - 1) * Math.min(dc, dr);
  };
  g[from] = 0;
  f[from] = heuristic(from);
  const open = new Heap(f);
  open.push(from);

  while (open.size > 0) {
    const current = open.pop();
    if (current === to) break;
    if (closed[current]) continue;
    closed[current] = 1;
    const col = current % cols;
    const row = Math.floor(current / cols);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
        const next = nr * cols + nc;
        if (!walkable[next] || closed[next]) continue;
        // Diagonals need both orthogonal neighbours free so bodies never clip a corner.
        if (dr !== 0 && dc !== 0 && (!walkable[row * cols + nc] || !walkable[nr * cols + col])) continue;
        const cost = g[current] + (dr !== 0 && dc !== 0 ? DIAG : 1);
        if (cost < g[next]) {
          g[next] = cost;
          f[next] = cost + heuristic(next);
          came[next] = current;
          open.push(next);
        }
      }
    }
  }
  if (came[to] < 0) return [];

  const cells: number[] = [];
  for (let index = to; index !== -1; index = came[index]) cells.push(index);
  cells.reverse();
  const points = cells.map((index) => centreOf(grid, index));
  points[points.length - 1] = goal;

  // String pull: keep only the corners the straight line cannot skip.
  const pulled: NavPoint[] = [];
  let anchor: NavPoint = start;
  let i = 0;
  while (i < points.length - 1) {
    let far = i;
    for (let j = points.length - 1; j > i; j--) {
      if (gridLineClear(grid, anchor, points[j])) {
        far = j;
        break;
      }
    }
    if (far === i) far = i + 1;
    anchor = points[far];
    pulled.push(anchor);
    i = far;
  }
  if (pulled.length === 0 || pulled[pulled.length - 1] !== goal) pulled.push(goal);
  return pulled;
}

/** Height above which a box hides a standing body from a hunter's eye line. */
export const SIGHT_BLOCK_HEIGHT = 1.15;

/** Walkable-style mask of sight-blocking geometry: 1 = clear air at the cell centre. */
export type SightGrid = NavGrid;

const sightGrids = new Map<string, SightGrid>();

export function buildSightGrid(map: GameMap, cell = NAV_CELL, colliders: Collider[] = mapColliders(map)): SightGrid {
  const cols = Math.max(1, Math.ceil(map.w / cell));
  const rows = Math.max(1, Math.ceil(map.d / cell));
  const walkable = new Uint8Array(cols * rows).fill(1);
  const tall = colliders.filter((box) => box.maxY >= SIGHT_BLOCK_HEIGHT);
  for (const box of tall) {
    const c0 = Math.max(0, Math.floor((box.minX - 0.03) / cell));
    const c1 = Math.min(cols - 1, Math.floor((box.maxX + 0.03) / cell));
    const r0 = Math.max(0, Math.floor((box.minZ - 0.03) / cell));
    const r1 = Math.min(rows - 1, Math.floor((box.maxZ + 0.03) / cell));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) walkable[row * cols + col] = 0;
  }
  return { cell, cols, rows, walkable, w: map.w, d: map.d };
}

export function sightGridFor(map: GameMap): SightGrid {
  let grid = sightGrids.get(map.id);
  if (!grid) {
    grid = buildSightGrid(map);
    sightGrids.set(map.id, grid);
  }
  return grid;
}

/**
 * Line of sight between two floor points: the baked mask covers the static map,
 * `dynamic` (door leaves) is checked per segment since there are only a handful.
 */
export function sightClear(grid: SightGrid, a: NavPoint, b: NavPoint, dynamic: Collider[] = []): boolean {
  if (!gridLineClear(grid, a, b)) return false;
  if (dynamic.length === 0) return true;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.18));
  for (let i = 1; i < steps; i++) {
    const x = a.x + (dx * i) / steps;
    const z = a.z + (dz * i) / steps;
    for (const box of dynamic) {
      if (box.maxY >= SIGHT_BLOCK_HEIGHT && x >= box.minX - 0.03 && x <= box.maxX + 0.03 && z >= box.minZ - 0.03 && z <= box.maxZ + 0.03) return false;
    }
  }
  return true;
}

