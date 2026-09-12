import { SHOT_COOLDOWN, TAG_RANGE, WHITE } from "./config";
import { moveWithSlide, poseRadius } from "./engine/collision";
import { doorColliders, mapColliders } from "./maps";
import { hiderAlive, isHunter, roleOf } from "./round";
import type { Session } from "./session";
import type { GameMap, PaintBlob, Pose, RoomState } from "./types";

type Brain = {
  tx: number;
  tz: number;
  pose: Pose;
  fill: string;
  blobs: PaintBlob[];
  settled: boolean;
  shootAt: number;
  patrol: number;
  turn: number;
  doorAt: number;
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

function hideSpot(map: GameMap, i: number): { x: number; z: number; pose: Pose; fill: string } {
  const props = map.boxes.filter((b) => b.h >= 0.55 && b.h <= 3.4 && b.w < map.w * 0.2 && b.d < map.d * 0.2);
  const rnd = mul(`spot${i}${map.id}`);
  const p = props[Math.floor(rnd() * Math.max(1, props.length))] ?? {
    x: map.w * (0.2 + rnd() * 0.6),
    z: map.d * (0.2 + rnd() * 0.6),
    w: 1,
    d: 1,
    color: "#6b4a32",
  };
  const side = rnd();
  const pad = 0.55 + rnd() * 0.35;
  let x = p.x;
  let z = p.z;
  if (side < 0.25) x = p.x + p.w / 2 + pad;
  else if (side < 0.5) x = p.x - p.w / 2 - pad;
  else if (side < 0.75) z = p.z + p.d / 2 + pad;
  else z = p.z - p.d / 2 - pad;
  x = Math.max(2, Math.min(map.w - 2, x));
  z = Math.max(2, Math.min(map.d - 2, z));
  const poses: Pose[] = ["stick", "crouch", "sit", "lie", "stretch", "stick"];
  return { x, z, pose: poses[Math.floor(rnd() * poses.length)], fill: p.color || "#6b4a32" };
}

function blobsFor(fill: string, i: number): PaintBlob[] {
  const rnd = mul(`paint${i}${fill}`);
  const parts: PaintBlob["part"][] = ["head", "torso", "armL", "armR", "legL", "legR"];
  const out: PaintBlob[] = [];
  for (const part of parts) {
    out.push({ x: 0.5, y: 0.5, r: 0.55, c: fill, part, tx: 0.5, ty: 0.5 });
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

export function resetSoloBots(session: Session, map: GameMap, room: RoomState) {
  brains.clear();
  const players = session.players();
  for (const p of players) {
    if (p.id === session.myId()) continue;
    const i = Number(String(p.id).replace("bot-", "")) || 0;
    const role = roleOf(room, p.id);
    const hid = hideSpot(map, i);
    const sp = role === "hunter" ? map.hunterSpawns[i % map.hunterSpawns.length] : hid;
    p.set("x", sp.x);
    p.set("z", sp.z);
    p.set("y", 0);
    p.set("yaw", 0);
    p.set("pose", role === "hunter" ? "stand" : hid.pose);
    p.set("fill", role === "hunter" ? WHITE : hid.fill);
    p.set("blobs", role === "hunter" ? [] : blobsFor(hid.fill, i));
    p.set("ready", true);
    p.set("alive", true);
    p.set("role", role);
    p.set("shootSeq", 0);
    brains.set(p.id, {
      tx: role === "hunter" ? sp.x : hid.x,
      tz: role === "hunter" ? sp.z : hid.z,
      pose: role === "hunter" ? "stand" : hid.pose,
      fill: role === "hunter" ? WHITE : hid.fill,
      blobs: role === "hunter" ? [] : blobsFor(hid.fill, i),
      settled: false,
      shootAt: 0,
      patrol: i,
      turn: 0,
      doorAt: 0,
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
      const hiders = snaps.filter((s) => s.alive && s.id !== p.id);
      let best = hiders[0];
      let bestScore = -1;
      for (const h of hiders) {
        const dist = Math.hypot(h.x - x, h.z - z);
        const painted = h.fill !== WHITE;
        const see = painted ? (dist < 5.8 ? 1.15 : dist < 9 ? 0.55 : 0.12) : dist < 12 ? 1.4 : 0.2;
        const score = see * (18 - Math.min(18, dist));
        if (score > bestScore) {
          bestScore = score;
          best = h;
        }
      }
      if (best && bestScore > 2.2) {
        br.tx = best.x;
        br.tz = best.z;
      } else {
        br.turn += dt;
        if (br.turn > 2.4) {
          br.turn = 0;
          br.patrol = (br.patrol + 1) % patrolPts.length;
        }
        const pt = patrolPts[br.patrol % patrolPts.length];
        br.tx = pt.x;
        br.tz = pt.z;
      }
      const door = (map.doors ?? []).find((d) => !room.doors?.[d.id] && Math.hypot(d.x - x, d.z - z) < 2.4);
      if (door && now > br.doorAt) {
        br.doorAt = now + 2200;
        session.callDoor(door.id);
      }

      const speed = 6.6;
      const dx = br.tx - x;
      const dz = br.tz - z;
      const len = Math.hypot(dx, dz) || 1;
      const step = Math.min(speed * dt, len);
      const moved = moveWithSlide(x, z, (dx / len) * step, (dz / len) * step, poseRadius("stand"), cols, bounds);
      x = moved.x;
      z = moved.z;
      yaw = Math.atan2(-(dx / len), -(dz / len));
      p.set("x", x);
      p.set("z", z);
      p.set("y", 0);
      p.set("yaw", yaw);
      p.set("pose", "stand");

      if (best && now > br.shootAt) {
        const dist = Math.hypot(best.x - x, best.z - z);
        const fx = -Math.sin(yaw);
        const fz = -Math.cos(yaw);
        const inv = 1 / Math.max(0.001, dist);
        const dot = fx * (best.x - x) * inv + fz * (best.z - z) * inv;
        const painted = best.fill !== WHITE;
        const canSee = !painted ? dist < 8.5 && dot > 0.62 : (dist < 4.6 && dot > 0.55) || (dist < 3.1 && dot > 0.2);
        if (canSee && dist <= TAG_RANGE + 0.6) {
          br.shootAt = now + SHOT_COOLDOWN + 180;
          p.set("shootSeq", Number(p.get("shootSeq") ?? 0) + 1);
          session.callShot(best.id, p.id);
        }
      }
      continue;
    }

    if (!hunter) {
      const dx = br.tx - x;
      const dz = br.tz - z;
      const dist = Math.hypot(dx, dz);
      if (room.phase === "hide" && dist > 0.35 && !br.settled) {
        const speed = 5.8;
        const step = Math.min(speed * dt, dist);
        const moved = moveWithSlide(x, z, (dx / dist) * step, (dz / dist) * step, poseRadius(br.pose), cols, bounds);
        x = moved.x;
        z = moved.z;
        yaw = Math.atan2(-(dx / dist), -(dz / dist));
        p.set("x", x);
        p.set("z", z);
        p.set("yaw", yaw);
        p.set("pose", "stand");
      } else {
        br.settled = true;
        p.set("x", br.tx);
        p.set("z", br.tz);
        p.set("pose", br.pose);
        p.set("fill", br.fill);
        p.set("blobs", br.blobs);
        if (room.phase === "hunt" && Math.random() < 0.0009) {
          p.set("x", br.tx + (Math.random() - 0.5) * 0.18);
          p.set("z", br.tz + (Math.random() - 0.5) * 0.18);
        }
      }
    }
  }
}
