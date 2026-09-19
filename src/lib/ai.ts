import { SHOT_COOLDOWN, TAG_RANGE, WHITE } from "./config";
import { colorMatch, hunterVisibility, lightLevelAt } from "./camouflage";
import { blocked, moveWithSlide, poseRadius } from "./engine/collision";
import { doorColliders, mapColliders } from "./maps";
import { hiderAlive, isHunter, roleOf } from "./round";
import type { Session, SessionPlayer } from "./session";
import type { Collider, GameMap, PaintBlob, Pose, RoomState } from "./types";

type HideSpot = {
  x: number;
  z: number;
  pose: Pose;
  fill: string;
  palette: string[];
  quality: number;
};

type Point = { x: number; z: number };

type BrainBehavior = "scouting" | "fleeing" | "hiding" | "searching" | "patrolling";

type Brain = {
  tx: number;
  tz: number;
  pose: Pose;
  fill: string;
  blobs: PaintBlob[];
  camoScore: number;
  settled: boolean;
  shootAt: number;
  patrol: number;
  turn: number;
  doorAt: number;
  searchSpots: HideSpot[];
  searchSpotIndex: number;
  pauseUntil: number;
  paintStartedAt: number;
  paintDuration: number;
  route: Point[];
  routeIndex: number;
  routeKey: string;
  routeReadyAt: number;
  behavior: BrainBehavior;
  huntStartedAt: number;
  lastSeenX: number;
  lastSeenZ: number;
  lastSeenAt: number;
  nextDecisionAt: number;
  stuckSince: number;
};

const brains = new Map<string, Brain>();

function mul(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

function colliders(map: GameMap, room: RoomState) {
  const doors = (map.doors ?? []).flatMap((d) => doorColliders(d, !!room.doors?.[d.id]));
  return [...mapColliders(map), ...doors];
}

function clearSight(ax: number, az: number, bx: number, bz: number, boxes: Collider[]) {
  const dx = bx - ax;
  const dz = bz - az;
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / 0.18));
  for (let i = 1; i < steps; i++) {
    const x = ax + (dx * i) / steps;
    const z = az + (dz * i) / steps;
    if (
      boxes.some(
        (box) =>
          box.maxY >= 1.15 &&
          x >= box.minX - 0.03 &&
          x <= box.maxX + 0.03 &&
          z >= box.minZ - 0.03 &&
          z <= box.maxZ + 0.03,
      )
    ) {
      return false;
    }
  }
  return true;
}

function clearPath(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius: number,
  boxes: Collider[],
  bounds: { w: number; d: number },
) {
  const distance = Math.hypot(bx - ax, bz - az);
  const steps = Math.max(1, Math.ceil(distance / 0.22));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (blocked(ax + (bx - ax) * t, az + (bz - az) * t, radius, boxes, bounds)) return false;
  }
  return true;
}

function uniquePoints(points: Point[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x.toFixed(1)}:${point.z.toFixed(1)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function routeNodes(
  cols: Collider[],
  anchors: Point[],
  bounds: { w: number; d: number },
  radius: number,
) {
  const margin = radius + 0.34;
  const corners = cols.flatMap((box) => [
    { x: box.minX - margin, z: box.minZ - margin },
    { x: box.maxX + margin, z: box.minZ - margin },
    { x: box.minX - margin, z: box.maxZ + margin },
    { x: box.maxX + margin, z: box.maxZ + margin },
  ]);
  const valid = [...anchors, ...corners].filter(
    (point) =>
      point.x > radius + 0.12 &&
      point.z > radius + 0.12 &&
      point.x < bounds.w - radius - 0.12 &&
      point.z < bounds.d - radius - 0.12 &&
      !blocked(point.x, point.z, radius, cols, bounds),
  );
  return uniquePoints(valid);
}

function buildRoute(
  start: Point,
  target: Point,
  cols: Collider[],
  anchors: Point[],
  bounds: { w: number; d: number },
  radius: number,
) {
  if (clearPath(start.x, start.z, target.x, target.z, radius, cols, bounds)) return [target];

  const candidates = routeNodes(cols, anchors, bounds, radius)
    .sort(
      (left, right) =>
        Math.hypot(left.x - start.x, left.z - start.z) + Math.hypot(left.x - target.x, left.z - target.z) -
        (Math.hypot(right.x - start.x, right.z - start.z) + Math.hypot(right.x - target.x, right.z - target.z)),
    )
    .slice(0, 72);
  const nodes = uniquePoints([start, target, ...candidates]);
  const targetIndex = 1;
  const costs = nodes.map(() => Number.POSITIVE_INFINITY);
  const previous = nodes.map(() => -1);
  const open = new Set<number>([0]);
  costs[0] = 0;

  while (open.size) {
    let current = -1;
    for (const index of open) {
      if (current < 0 || costs[index] + Math.hypot(nodes[index].x - target.x, nodes[index].z - target.z) < costs[current] + Math.hypot(nodes[current].x - target.x, nodes[current].z - target.z)) {
        current = index;
      }
    }
    if (current < 0) break;
    open.delete(current);
    if (current === targetIndex) break;

    for (let next = 1; next < nodes.length; next++) {
      if (next === current || !clearPath(nodes[current].x, nodes[current].z, nodes[next].x, nodes[next].z, radius, cols, bounds)) continue;
      const cost = costs[current] + Math.hypot(nodes[next].x - nodes[current].x, nodes[next].z - nodes[current].z);
      if (cost < costs[next]) {
        costs[next] = cost;
        previous[next] = current;
        open.add(next);
      }
    }
  }

  if (previous[targetIndex] < 0) return [target];
  const path: Point[] = [];
  for (let index = targetIndex; index >= 0; index = previous[index]) {
    path.unshift(nodes[index]);
    if (index === 0) break;
  }
  return path.slice(1);
}

function followGoal(
  br: Brain,
  x: number,
  z: number,
  goal: Point,
  dt: number,
  speed: number,
  radius: number,
  cols: Collider[],
  anchors: Point[],
  bounds: { w: number; d: number },
  now: number,
) {
  const goalKey = `${Math.round(goal.x * 2)}:${Math.round(goal.z * 2)}`;
  const needsRoute =
    br.route.length === 0 ||
    br.routeIndex >= br.route.length ||
    (br.routeKey !== goalKey && now >= br.routeReadyAt);
  if (needsRoute) {
    br.route = buildRoute({ x, z }, goal, cols, anchors, bounds, radius);
    br.routeIndex = 0;
    br.routeKey = goalKey;
    br.routeReadyAt = now + 620;
  }

  let waypoint = br.route[br.routeIndex] ?? goal;
  if (Math.hypot(waypoint.x - x, waypoint.z - z) < 0.3 && br.routeIndex < br.route.length - 1) {
    br.routeIndex += 1;
    waypoint = br.route[br.routeIndex] ?? goal;
  }
  const dx = waypoint.x - x;
  const dz = waypoint.z - z;
  const distance = Math.hypot(dx, dz);
  if (distance < 0.04) {
    return {
      x,
      z,
      yaw: Math.atan2(-(goal.x - x), -(goal.z - z)) || 0,
      arrived: Math.hypot(goal.x - x, goal.z - z) < 0.38,
    };
  }

  const heading = Math.atan2(-(dx / distance), -(dz / distance));
  const angles = [0, 0.5, -0.5, 1.0, -1.0, 1.57, -1.57, 2.2, -2.2];
  const step = Math.min(speed * dt, distance);
  let best = { x, z, score: Math.hypot(goal.x - x, goal.z - z) };
  for (const offset of angles) {
    const angle = heading + offset;
    const moved = moveWithSlide(x, z, -Math.sin(angle) * step, -Math.cos(angle) * step, radius, cols, bounds);
    const score = Math.hypot(goal.x - moved.x, goal.z - moved.z);
    if (score < best.score - 0.002) best = { ...moved, score };
  }
  if (best.score >= Math.hypot(goal.x - x, goal.z - z) - 0.001) {
    br.stuckSince ||= now;
    if (now - br.stuckSince > 700) {
      br.route = [];
      br.routeKey = "";
      br.routeReadyAt = 0;
    }
  } else {
    br.stuckSince = 0;
  }
  return {
    x: best.x,
    z: best.z,
    yaw: heading,
    arrived: Math.hypot(goal.x - best.x, goal.z - best.z) < 0.38,
  };
}

function hideSpot(map: GameMap, i: number, round: number): HideSpot {
  const props = map.boxes.filter((b) => b.h >= 0.55 && b.h <= 3.4 && b.w < map.w * 0.2 && b.d < map.d * 0.2);
  const rnd = mul(`spot${i}${map.id}${round}`);
  const fallback: GameMap["boxes"][number] = {
    x: map.w * (0.2 + rnd() * 0.6),
    y: 0.5,
    z: map.d * (0.2 + rnd() * 0.6),
    w: 1,
    h: 1,
    d: 1,
    color: "#6b4a32",
  };
  const p = props[Math.floor(rnd() * Math.max(1, props.length))] ?? fallback;
  const obstacleW = p.collider?.w ?? p.w;
  const obstacleD = p.collider?.d ?? p.d;
  const side = rnd();
  const pad = 0.55 + rnd() * 0.35;
  let x = p.x;
  let z = p.z;
  if (side < 0.25) x = p.x + obstacleW / 2 + pad;
  else if (side < 0.5) x = p.x - obstacleW / 2 - pad;
  else if (side < 0.75) z = p.z + obstacleD / 2 + pad;
  else z = p.z - obstacleD / 2 - pad;
  x = Math.max(2, Math.min(map.w - 2, x));
  z = Math.max(2, Math.min(map.d - 2, z));
  const poses: Pose[] = ["stick", "crouch", "sit", "lie", "stretch", "stick"];
  const fill = p.color || "#6b4a32";
  const palette = [...new Set([fill, ...(p.colors ?? [])])];
  const hunter = map.hunterSpawns[0] ?? { x: map.w / 2, z: map.d / 2 };
  const distanceFromHunter = Math.hypot(x - hunter.x, z - hunter.z);
  const covered = !clearSight(hunter.x, hunter.z, x, z, mapColliders(map));
  const paletteMatch =
    palette.slice(1).reduce((sum, color) => sum + colorMatch(fill, color), 0) / Math.max(1, palette.length - 1);
  // Dark rooms are worth seeking out; bright ones (windows, lit offices) are not.
  const shade = Math.round((0.6 - lightLevelAt(map, x, z)) * 12);
  const quality = Math.max(
    68,
    Math.min(
      94,
      Math.round(72 + Math.min(12, distanceFromHunter * 0.45) + (covered ? 8 : 0) + paletteMatch * 0.08 + shade),
    ),
  );
  return {
    x,
    z,
    pose: poses[Math.floor(rnd() * poses.length)],
    fill,
    palette,
    quality,
  };
}

function blobsFor(fill: string, palette: string[], i: number): PaintBlob[] {
  const rnd = mul(`paint${i}${fill}`);
  const parts: PaintBlob["part"][] = ["head", "torso", "armL", "armR", "legL", "legR"];
  const accents = palette.filter((color) => color.toLowerCase() !== fill.toLowerCase()).slice(0, 2);
  const out: PaintBlob[] = [];
  for (const part of parts) {
    out.push({ x: 0.5, y: 0.5, r: 0.55, c: fill, part, tx: 0.5, ty: 0.5 });
    for (const [accentIndex, color] of accents.entries()) {
      if (rnd() > 0.2 + accentIndex * 0.18) {
        out.push({
          x: 0.2 + rnd() * 0.6,
          y: 0.18 + rnd() * 0.64,
          r: 0.1 + rnd() * 0.07,
          c: color,
          part,
          tx: 0.35 + rnd() * 0.3,
          ty: 0.3 + rnd() * 0.4,
        });
      }
    }
    if (rnd() > 0.35) {
      out.push({
        x: 0.25 + rnd() * 0.5,
        y: 0.2 + rnd() * 0.6,
        r: 0.18,
        c: fill,
        part,
        tx: 0.4 + rnd() * 0.3,
        ty: 0.35 + rnd() * 0.3,
      });
    }
  }
  return out;
}

function mixHex(from: string, to: string, amount: number) {
  const parse = (value: string) => {
    const normalized = value.trim().replace(/^#/, "");
    if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
    return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
  };
  const left = parse(from);
  const right = parse(to);
  if (!left || !right) return amount >= 0.65 ? to : from;
  const t = Math.max(0, Math.min(1, amount));
  return `#${left
    .map((value, index) => Math.round(value + (right[index] - value) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

function applyBotPaint(p: SessionPlayer, br: Brain, now: number) {
  if (!br.paintStartedAt) br.paintStartedAt = now;
  const progress = Math.max(0, Math.min(1, (now - br.paintStartedAt) / br.paintDuration));
  const blobCount = progress <= 0 ? 0 : Math.max(1, Math.ceil(br.blobs.length * progress));
  p.set("fill", mixHex(WHITE, br.fill, progress));
  p.set("blobs", br.blobs.slice(0, blobCount));
  p.set("camoScore", Math.round(br.camoScore * progress));
  return progress >= 1;
}

export function resetSoloBots(session: Session, map: GameMap, room: RoomState) {
  brains.clear();
  const players = session.players();
  for (const p of players) {
    if (p.id === session.myId()) continue;
    const i = Number(String(p.id).replace("bot-", "")) || 0;
    const role = roleOf(room, p.id);
    const candidates = [hideSpot(map, i, room.round), hideSpot(map, i + 13, room.round), hideSpot(map, i + 29, room.round)];
    const finalSpot = candidates.reduce<HideSpot | undefined>(
      (best, spot) => (!best || spot.quality > best.quality ? spot : best),
      undefined,
    );
    const searchSpots = finalSpot
      ? [...candidates.filter((spot) => spot !== finalSpot), finalSpot]
      : candidates;
    const sp = role === "hunter" ? map.hunterSpawns[i % map.hunterSpawns.length] : map.spawns[i % map.spawns.length];
    p.set("x", sp.x);
    p.set("z", sp.z);
    p.set("y", 0);
    p.set("yaw", 0);
    p.set("pose", "stand");
    p.set("fill", WHITE);
    p.set("blobs", []);
    p.set("camoScore", 0);
    p.set("ready", true);
    p.set("alive", true);
    p.set("role", role);
    p.set("shootSeq", 0);
    brains.set(p.id, {
      tx: finalSpot?.x ?? sp.x,
      tz: finalSpot?.z ?? sp.z,
      pose: finalSpot?.pose ?? "stand",
      fill: finalSpot?.fill ?? WHITE,
      blobs: finalSpot ? blobsFor(finalSpot.fill, finalSpot.palette, i) : [],
      camoScore: finalSpot?.quality ?? 0,
      settled: false,
      shootAt: 0,
      patrol: i,
      turn: 0,
      doorAt: 0,
      searchSpots,
      searchSpotIndex: 0,
      pauseUntil: 0,
      paintStartedAt: 0,
      paintDuration: 2200 + (i % 3) * 450,
      route: [],
      routeIndex: 0,
      routeKey: "",
      routeReadyAt: 0,
      behavior: role === "hunter" ? "patrolling" : "scouting",
      huntStartedAt: 0,
      lastSeenX: sp.x,
      lastSeenZ: sp.z,
      lastSeenAt: 0,
      nextDecisionAt: 0,
      stuckSince: 0,
    });
  }
}

export function tickSoloBots(session: Session, map: GameMap, room: RoomState, dt: number, now: number) {
  if (session.kind !== "practice") return;
  if (room.phase !== "hide" && room.phase !== "hunt") return;
  const cols = colliders(map, room);
  const bounds = { w: map.w, d: map.d };
  const players = session.players();
  const snaps = players.map((p) => ({
    id: p.id,
    x: Number(p.get("x") ?? 0),
    z: Number(p.get("z") ?? 0),
    y: Number(p.get("y") ?? 0),
    yaw: Number(p.get("yaw") ?? 0),
    fill: String(p.get("fill") ?? WHITE),
    camoScore: Number(p.get("camoScore") ?? 0),
    pose: (p.get("pose") as Pose) || "stand",
    hunter: isHunter(room, p.id),
    alive: hiderAlive(room, p.id),
  }));

  const patrolPts = [
    ...map.spawns,
    ...map.hunterSpawns,
    ...(map.doors ?? []).map((d) => ({ x: d.x, z: d.z })),
    { x: map.w * 0.25, z: map.d * 0.25 },
    { x: map.w * 0.75, z: map.d * 0.25 },
    { x: map.w * 0.25, z: map.d * 0.75 },
    { x: map.w * 0.75, z: map.d * 0.75 },
    { x: map.w * 0.5, z: map.d * 0.5 },
  ];

  for (const p of players) {
    if (p.id === session.myId()) continue;
    let br = brains.get(p.id);
    if (!br) {
      resetSoloBots(session, map, room);
      br = brains.get(p.id);
      if (!br) continue;
    }
    const hunter = isHunter(room, p.id);
    if (room.phase === "hide" && hunter) continue;

    let x = Number(p.get("x") ?? 4);
    let z = Number(p.get("z") ?? 4);
    let yaw = Number(p.get("yaw") ?? 0);

    if (hunter && room.phase === "hunt") {
      const hiders = snaps.filter((s) => s.alive && !s.hunter && s.id !== p.id);
      let best: (typeof hiders)[number] | undefined;
      let bestScore = -1;
      for (const h of hiders) {
        if (!clearSight(x, z, h.x, h.z, cols)) continue;
        const dist = Math.hypot(h.x - x, h.z - z);
        const see = hunterVisibility(h.camoScore, dist, h.pose, false, lightLevelAt(map, h.x, h.z));
        const score = see * (18 - Math.min(18, dist)) + (dist < 2.4 ? 2.5 : 0);
        if (score > bestScore) {
          bestScore = score;
          best = h;
        }
      }
      if (best && bestScore > 2.2) {
        br.tx = best.x;
        br.tz = best.z;
        br.lastSeenX = best.x;
        br.lastSeenZ = best.z;
        br.lastSeenAt = now;
        br.behavior = "searching";
      } else if (br.lastSeenAt > 0 && now - br.lastSeenAt < 7000) {
        br.tx = br.lastSeenX;
        br.tz = br.lastSeenZ;
        br.behavior = "searching";
      } else {
        br.turn += dt;
        if (br.turn > 2.4 || now >= br.nextDecisionAt) {
          br.turn = 0;
          br.patrol = (br.patrol + 1) % patrolPts.length;
          br.nextDecisionAt = now + 2600;
          if (br.searchSpots.length && br.patrol % 2 === 0) {
            br.searchSpotIndex = (br.searchSpotIndex + 1) % br.searchSpots.length;
            br.tx = br.searchSpots[br.searchSpotIndex].x;
            br.tz = br.searchSpots[br.searchSpotIndex].z;
          } else {
            const pt = patrolPts[br.patrol % patrolPts.length];
            br.tx = pt.x;
            br.tz = pt.z;
          }
        }
        br.behavior = "patrolling";
      }
      const door = (map.doors ?? []).find((d) => !room.doors?.[d.id] && Math.hypot(d.x - x, d.z - z) < 2.4);
      if (door && now > br.doorAt) {
        br.doorAt = now + 2200;
        session.callDoor(door.id);
      }

      const moved = followGoal(
        br,
        x,
        z,
        { x: br.tx, z: br.tz },
        dt,
        6.6,
        poseRadius("stand"),
        cols,
        [...patrolPts, ...br.searchSpots],
        bounds,
        now,
      );
      x = moved.x;
      z = moved.z;
      yaw = moved.yaw;
      p.set("x", x);
      p.set("z", z);
      p.set("y", 0);
      p.set("yaw", yaw);
      p.set("pose", "stand");
      p.set("fill", WHITE);
      p.set("blobs", []);
      p.set("camoScore", 0);

      if (best && now > br.shootAt) {
        const dist = Math.hypot(best.x - x, best.z - z);
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const inv = 1 / Math.max(0.001, dist);
        const dot = fx * (best.x - x) * inv + fz * (best.z - z) * inv;
        const visibility = hunterVisibility(best.camoScore, dist, best.pose, true, lightLevelAt(map, best.x, best.z));
        const canSee = visibility > 0.46 && dot > 0.62 && clearSight(x, z, best.x, best.z, cols);
        if (canSee && dist <= TAG_RANGE + 0.6) {
          br.shootAt = now + SHOT_COOLDOWN + 180;
          const shootSeq = Number(p.get("shootSeq") ?? 0) + 1;
          p.set("shootSeq", shootSeq);
          session.callShot(best.id, p.id, shootSeq);
        }
      }
      continue;
    }

    if (!hunter) {
      const finalIndex = br.searchSpots.length - 1;
      const finalSpot = br.searchSpots[finalIndex];
      if (!finalSpot) continue;
      if (room.phase === "hunt") {
        br.huntStartedAt ||= now;
        if (!br.settled && br.behavior === "scouting") {
          br.searchSpotIndex = finalIndex;
          br.tx = finalSpot.x;
          br.tz = finalSpot.z;
          br.pose = finalSpot.pose;
          br.route = [];
          br.routeKey = "";
        }
        const threats = snaps
          .filter((s) => s.hunter && s.alive && s.id !== p.id)
          .map((hunterSnap) => ({
            hunter: hunterSnap,
            distance: Math.hypot(hunterSnap.x - x, hunterSnap.z - z),
            visible: clearSight(hunterSnap.x, hunterSnap.z, x, z, cols),
          }))
          .sort((left, right) => left.distance - right.distance);
        const threat = threats[0];
        const exposed =
          threat &&
          (threat.distance < 3.6 ||
            (threat.visible && hunterVisibility(Number(p.get("camoScore") ?? 0), threat.distance, br.pose) > 0.58 && threat.distance < 7));
        if (br.settled && exposed && now >= br.nextDecisionAt && now - br.huntStartedAt > 4500) {
          const choices = br.searchSpots
            .map((spot, index) => {
              if (index === br.searchSpotIndex) return null;
              const distanceFromHunter = threat ? Math.hypot(spot.x - threat.hunter.x, spot.z - threat.hunter.z) : 0;
              const hiddenFromHunter = threat ? !clearSight(threat.hunter.x, threat.hunter.z, spot.x, spot.z, cols) : true;
              return {
                spot,
                index,
                score: spot.quality + distanceFromHunter * 3 + (hiddenFromHunter ? 24 : -18) - Math.hypot(spot.x - x, spot.z - z) * 0.35,
              };
            })
            .filter((choice): choice is { spot: HideSpot; index: number; score: number } => choice !== null)
            .sort((left, right) => right.score - left.score);
          const escape = choices[0];
          if (escape) {
            br.searchSpotIndex = escape.index;
            br.tx = escape.spot.x;
            br.tz = escape.spot.z;
            br.pose = escape.spot.pose;
            br.settled = false;
            br.behavior = "fleeing";
            br.paintStartedAt = 0;
            br.route = [];
            br.routeKey = "";
            br.nextDecisionAt = now + 6500;
          }
        }
      } else {
        br.huntStartedAt = 0;
        br.behavior = "scouting";
      }
      if (room.phase === "hunt" && !br.settled && br.behavior !== "fleeing") {
        br.searchSpotIndex = finalIndex;
        br.tx = finalSpot.x;
        br.tz = finalSpot.z;
        br.pose = finalSpot.pose;
      }
      const target = br.searchSpots[br.searchSpotIndex];
      if (target) {
        br.tx = target.x;
        br.tz = target.z;
      }
      const moved = followGoal(
        br,
        x,
        z,
        { x: br.tx, z: br.tz },
        dt,
        br.behavior === "fleeing" ? 6.4 : 5.8,
        poseRadius(br.pose),
        cols,
        [...patrolPts, ...br.searchSpots],
        bounds,
        now,
      );
      x = moved.x;
      z = moved.z;
      yaw = moved.yaw;
      if (!moved.arrived || !br.settled) {
        const arrivedAtSpot = moved.arrived;
        if (arrivedAtSpot && room.phase === "hunt") {
          br.settled = true;
          br.behavior = "hiding";
          br.pauseUntil = 0;
        }
        if (room.phase === "hide" && !arrivedAtSpot) {
          br.settled = false;
        }
        p.set("x", x);
        p.set("z", z);
        p.set("yaw", yaw);
        p.set("pose", "stand");
        p.set("fill", WHITE);
        p.set("blobs", []);
        p.set("camoScore", 0);
        if (!arrivedAtSpot || room.phase === "hunt") br.paintStartedAt = 0;
      }
      if (moved.arrived) {
        if (!br.settled && room.phase === "hide") {
          br.pauseUntil ||= now + 950 + ((br.patrol + br.searchSpotIndex) % 3) * 350;
          const finalWindow = Math.max(8000, Math.min(14000, room.hideTime * 250));
          const lastSpot = br.searchSpotIndex >= br.searchSpots.length - 1;
          if (!lastSpot && now >= br.pauseUntil && now < room.phaseEndsAt - finalWindow) {
            br.searchSpotIndex += 1;
            br.pauseUntil = 0;
            br.route = [];
            br.routeKey = "";
            continue;
          }
          if (!lastSpot && now >= room.phaseEndsAt - finalWindow && finalSpot) {
            br.searchSpotIndex = finalIndex;
            br.tx = finalSpot.x;
            br.tz = finalSpot.z;
            br.pose = finalSpot.pose;
            br.pauseUntil = 0;
            br.route = [];
            br.routeKey = "";
            continue;
          }
          br.settled = lastSpot;
        }
        if (!br.settled) {
          p.set("pose", "stand");
          p.set("fill", WHITE);
          p.set("blobs", []);
          p.set("camoScore", 0);
          continue;
        }
        p.set("x", br.tx);
        p.set("z", br.tz);
        const painted = applyBotPaint(p, br, now);
        p.set("pose", painted ? br.pose : "crouch");
      }
    }
  }
}
