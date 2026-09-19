import type { BoxDef, DoorDef, Fixture, Opening, Pattern, RoomDef, WallSide } from "../types";

/**
 * Room builder: declare rooms with openings and get back full-height walls, door
 * defs, window glass, ceiling panels and light fixtures as ordinary BoxDefs, so
 * collision, audits, AI navigation and the renderer need no new concepts.
 */

export type WallLineOpening = { at: number; width: number; kind: Opening["kind"]; sill?: number; height?: number; leaf?: boolean };

/** A straight wall on one plane: `axis` is the direction it runs along, `plane` its fixed coordinate. */
export type WallLine = {
  axis: "x" | "z";
  plane: number;
  a0: number;
  a1: number;
  openings: WallLineOpening[];
  style?: WallStyle;
};

export type WallStyle = { thickness: number; color: string; pattern?: Pattern; colors?: string[] };

export type LightDef = { x: number; y: number; z: number; color: string; intensity: number; distance: number };

export type BuiltRooms = { boxes: BoxDef[]; doors: DoorDef[]; lights: LightDef[] };

const DEFAULT_WALL: WallStyle = { thickness: 0.3, color: "#c9bfa8" };
const PLANE_EPS = 0.02;
const MIN_SEGMENT = 0.12;

const FIXTURE_LOOK: Record<Fixture["kind"], { w: number; h: number; d: number; color: string; emissive: string; light: { color: string; intensity: number; distance: number } }> = {
  fluorescent: { w: 1.2, h: 0.08, d: 0.32, color: "#f2f5ea", emissive: "#f4f8e4", light: { color: "#f4f6df", intensity: 0.55, distance: 9 } },
  pendant: { w: 0.42, h: 0.42, d: 0.42, color: "#f2e3bd", emissive: "#ffd9a0", light: { color: "#ffd7a3", intensity: 0.7, distance: 10 } },
  spot: { w: 0.24, h: 0.14, d: 0.24, color: "#f0ede4", emissive: "#fff5dc", light: { color: "#fff0d0", intensity: 0.5, distance: 7 } },
};

function sideLine(room: RoomDef, side: WallSide): { axis: "x" | "z"; plane: number; a0: number; a1: number } {
  switch (side) {
    case "n":
      return { axis: "x", plane: room.z, a0: room.x, a1: room.x + room.w };
    case "s":
      return { axis: "x", plane: room.z + room.d, a0: room.x, a1: room.x + room.w };
    case "w":
      return { axis: "z", plane: room.x, a0: room.z, a1: room.z + room.d };
    case "e":
      return { axis: "z", plane: room.x + room.w, a0: room.z, a1: room.z + room.d };
  }
}

function roomWallLines(room: RoomDef): WallLine[] {
  const style: WallStyle = {
    thickness: room.wall?.thickness ?? DEFAULT_WALL.thickness,
    color: room.wall?.color ?? DEFAULT_WALL.color,
    pattern: room.wall?.pattern,
    colors: room.wall?.colors,
  };
  const sides: WallSide[] = ["n", "s", "w", "e"];
  return sides.map((side) => {
    const line = sideLine(room, side);
    const openings = (room.openings ?? [])
      .filter((o) => o.side === side)
      .map<WallLineOpening>((o) => ({
        at: line.a0 + o.at,
        width: o.width,
        kind: o.kind,
        sill: o.kind === "window" ? o.sill : undefined,
        height: o.kind === "window" ? o.height : undefined,
        leaf: o.kind === "door" ? o.leaf !== false : false,
      }));
    return { ...line, openings, style };
  });
}

/** Rooms that touch describe the same wall twice; union the intervals and keep both sides' openings. */
export function mergeWallLines(lines: WallLine[]): WallLine[] {
  const groups = new Map<string, WallLine[]>();
  for (const line of lines) {
    const key = `${line.axis}:${Math.round(line.plane / PLANE_EPS)}`;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  const merged: WallLine[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.a0 - b.a0);
    let current: WallLine | null = null;
    for (const line of sorted) {
      if (current !== null && line.a0 <= current.a1 + PLANE_EPS) {
        const open: WallLine = current;
        current = { ...open, a1: Math.max(open.a1, line.a1), openings: [...open.openings, ...line.openings] };
      } else {
        if (current) merged.push(current);
        current = { ...line, openings: [...line.openings] };
      }
    }
    if (current) merged.push(current);
  }
  return merged;
}

function wallBox(
  line: WallLine,
  a0: number,
  a1: number,
  y0: number,
  y1: number,
  role: BoxDef["role"],
  extra: Partial<BoxDef> = {},
): BoxDef {
  const style = line.style ?? DEFAULT_WALL;
  const length = a1 - a0;
  const centre = (a0 + a1) / 2;
  const h = y1 - y0;
  return {
    x: line.axis === "x" ? centre : line.plane,
    z: line.axis === "z" ? centre : line.plane,
    y: y0 + h / 2,
    w: line.axis === "x" ? length : style.thickness,
    d: line.axis === "z" ? length : style.thickness,
    h,
    color: style.color,
    pattern: style.pattern,
    colors: style.colors,
    collide: true,
    role,
    ...extra,
  };
}

function emitLine(line: WallLine, ceiling: number, mapId: string, out: BuiltRooms) {
  const openings = [...line.openings].sort((a, b) => a.at - b.at);
  let cursor = line.a0;
  for (const opening of openings) {
    const o0 = Math.max(line.a0, opening.at - opening.width / 2);
    const o1 = Math.min(line.a1, opening.at + opening.width / 2);
    if (o0 - cursor > MIN_SEGMENT) out.boxes.push(wallBox(line, cursor, o0, 0, ceiling, "wall"));
    if (opening.kind === "window") {
      const sill = opening.sill ?? 0.9;
      const top = Math.min(ceiling, sill + (opening.height ?? 1.2));
      // The sill is a partial wall by design; "trim" keeps the wall-height audit honest.
      if (sill > MIN_SEGMENT) out.boxes.push(wallBox(line, o0, o1, 0, sill, "trim"));
      if (ceiling - top > MIN_SEGMENT) out.boxes.push(wallBox(line, o0, o1, top, ceiling, "wall"));
      out.boxes.push(
        wallBox(line, o0, o1, sill, top, "glass", {
          color: "#bfe3f5",
          opacity: 0.32,
          pattern: undefined,
          colors: undefined,
          collide: true,
        }),
      );
    } else if (opening.kind === "door") {
      // Header above the door frame, plus the leaf itself as a DoorDef.
      const frameTop = Math.min(ceiling - 0.05, 2.25);
      if (ceiling - frameTop > MIN_SEGMENT) out.boxes.push(wallBox(line, o0, o1, frameTop, ceiling, "wall"));
      if (opening.leaf) {
        const style = line.style ?? DEFAULT_WALL;
        out.doors.push({
          id: `${mapId}-${line.axis}-${line.plane.toFixed(1)}-${opening.at.toFixed(1)}`,
          x: line.axis === "x" ? opening.at : line.plane,
          z: line.axis === "z" ? opening.at : line.plane,
          w: o1 - o0 - 0.08,
          h: frameTop - 0.06,
          d: style.thickness + 0.05,
          along: line.axis,
          color: "#5c3a22",
        });
      }
    } else if (opening.kind === "arch") {
      const archTop = Math.min(ceiling - 0.05, 2.4);
      if (ceiling - archTop > MIN_SEGMENT) out.boxes.push(wallBox(line, o0, o1, archTop, ceiling, "wall"));
    }
    // "gap": nothing at all.
    cursor = Math.max(cursor, o1);
  }
  if (line.a1 - cursor > MIN_SEGMENT) out.boxes.push(wallBox(line, cursor, line.a1, 0, ceiling, "wall"));
}

function ceilingPanel(room: RoomDef, ceiling: number): BoxDef {
  const thickness = 0.1;
  return {
    x: room.x + room.w / 2,
    z: room.z + room.d / 2,
    y: ceiling - thickness / 2 + 0.04,
    w: room.w,
    d: room.d,
    h: thickness,
    color: room.ceiling?.color ?? "#e8e2d4",
    emissive: room.ceiling?.color ?? "#e8e2d4",
    emissiveIntensity: 0.18,
    pattern: room.ceiling?.style === "tiles" ? "tiles" : room.ceiling?.style === "beams" ? "wood" : undefined,
    collide: false,
    role: "ceiling",
  };
}

function fixtureBox(fixture: Fixture, ceiling: number): BoxDef {
  const look = FIXTURE_LOOK[fixture.kind];
  const on = fixture.on !== false;
  return {
    x: fixture.x,
    z: fixture.z,
    y: ceiling - look.h / 2 - 0.02,
    w: look.w,
    h: look.h,
    d: look.d,
    color: on ? look.color : "#6d6a60",
    emissive: on ? look.emissive : undefined,
    emissiveIntensity: on ? 1 : undefined,
    shape: fixture.kind === "pendant" ? "sphere" : "box",
    collide: false,
    role: "fixture",
  };
}

export function buildRooms(rooms: RoomDef[], ceiling: number, mapId: string): BuiltRooms {
  const out: BuiltRooms = { boxes: [], doors: [], lights: [] };
  const lines = mergeWallLines(rooms.flatMap(roomWallLines));
  for (const line of lines) {
    const height = Math.max(...rooms.map((r) => r.wall?.height ?? r.ceiling?.height ?? ceiling));
    emitLine(line, height, mapId, out);
  }
  for (const room of rooms) {
    const height = room.ceiling?.height ?? ceiling;
    if (!room.ceiling?.open) out.boxes.push(ceilingPanel(room, height));
    for (const fixture of room.ceiling?.fixtures ?? []) {
      out.boxes.push(fixtureBox(fixture, height));
      if (fixture.on !== false) {
        const look = FIXTURE_LOOK[fixture.kind];
        out.lights.push({ x: fixture.x, y: height - 0.3, z: fixture.z, ...look.light });
      }
    }
  }
  return out;
}
