import { MAPS } from "../src/lib/maps";
import type { BoxDef, GameMap } from "../src/lib/types";

/**
 * Placement audit: uses each prop's VISUAL footprint (w/d, not the collider profile)
 * so a model that pokes into a wall is caught even when its collider does not.
 */
type Rect = { minX: number; maxX: number; minZ: number; maxZ: number; box: BoxDef };

const WALL_FURNITURE = new Set(["sofa", "bookshelf"]);
const WALL_LIKE = (b: BoxDef) => b.role === "wall" || b.role === "trim" || b.role === "glass";
const isPartition = (b: BoxDef) => !b.role && !b.prop && b.collide && b.h >= 1.2 && Math.min(b.w, b.d) <= 0.2 && Math.max(b.w, b.d) >= 2;

function rect(b: BoxDef): Rect {
  const rot = b.rotation ?? 0;
  const c = Math.abs(Math.cos(rot));
  const s = Math.abs(Math.sin(rot));
  const ex = (c * b.w + s * b.d) / 2;
  const ez = (s * b.w + c * b.d) / 2;
  return { minX: b.x - ex, maxX: b.x + ex, minZ: b.z - ez, maxZ: b.z + ez, box: b };
}

function overlap(a: Rect, b: Rect) {
  const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return ox > 0.02 && oz > 0.02 ? Math.min(ox, oz) : 0;
}

function gapTo(a: Rect, b: Rect) {
  const dx = Math.max(b.minX - a.maxX, a.minX - b.maxX, 0);
  const dz = Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ, 0);
  return Math.hypot(dx, dz);
}

const label = (b: BoxDef) => `${b.prop ?? b.pattern ?? "box"}@(${b.x.toFixed(1)},${b.z.toFixed(1)})`;

function auditMap(map: GameMap) {
  const walls = map.boxes.filter((b) => WALL_LIKE(b) && b.y - b.h / 2 < 1.2).map(rect);
  const partitions = map.boxes.filter(isPartition).map(rect);
  const props = map.boxes.filter((b) => !b.role && b.collide && b.y - b.h / 2 < 0.2 && !isPartition(b)).map(rect);
  const issues: string[] = [];
  for (const p of props) {
    for (const w of walls) {
      const o = overlap(p, w);
      if (o > 0) issues.push(`ERROR  ${label(p.box)} sinks ${o.toFixed(2)}m into a wall`);
    }
    for (const q of partitions) {
      const o = overlap(p, q);
      if (o > 0) issues.push(`ERROR  ${label(p.box)} sinks ${o.toFixed(2)}m into a partition`);
    }
    for (const q of props) {
      if (q === p || q.box.x < p.box.x || (q.box.x === p.box.x && q.box.z <= p.box.z)) continue;
      const o = overlap(p, q);
      if (o > 0.05) issues.push(`ERROR  ${label(p.box)} overlaps ${label(q.box)} by ${o.toFixed(2)}m`);
    }
    if (p.box.prop && WALL_FURNITURE.has(p.box.prop)) {
      // Anchored if against a wall/partition, or back-to-back with another shelf/sofa (a free-standing stack).
      const backToBack = props.some((q) => q !== p && q.box.prop === p.box.prop && gapTo(p, q) < 0.15);
      const nearest = Math.min(...walls.map((w) => gapTo(p, w)), ...partitions.map((q) => gapTo(p, q)));
      if (nearest > 0.9 && !backToBack) issues.push(`WARN   ${label(p.box)} floats ${nearest.toFixed(1)}m from any wall (wall furniture)`);
    }
  }
  // Blocked openings: a prop inside a door/arch footprint.
  for (const door of map.doors) {
    const r: Rect = door.along === "x"
      ? { minX: door.x - door.w / 2, maxX: door.x + door.w / 2, minZ: door.z - 1.2, maxZ: door.z + 1.2, box: {} as BoxDef }
      : { minX: door.x - 1.2, maxX: door.x + 1.2, minZ: door.z - door.w / 2, maxZ: door.z + door.w / 2, box: {} as BoxDef };
    for (const p of props) if (overlap(p, r) > 0) issues.push(`ERROR  ${label(p.box)} blocks door ${door.id}`);
  }
  return issues;
}

let errors = 0;
for (const map of MAPS) {
  const issues = auditMap(map);
  console.log(`${map.id}: ${issues.length} issue(s)`);
  for (const line of issues) {
    console.log(`  ${line}`);
    if (line.startsWith("ERROR")) errors += 1;
  }
}
if (errors > 0) process.exitCode = 1;
