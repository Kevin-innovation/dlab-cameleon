"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MAX_BLOBS,
  MAX_PLAYERS,
  REVEAL_TIME,
  SHOT_COOLDOWN,
  SYNC_HZ,
  TAUNT_COOLDOWN,
  FORCED_TAUNT,
  TAG_RANGE,
  WHITE,
  SCORE_TAG,
  SCORE_SURVIVE,
  SCORE_HUNT_WIN,
} from "@/lib/config";
import { drawBodyPreview } from "@/lib/engine/character";
import { GameWorld } from "@/lib/engine/world";
import { getMap, MAPS } from "@/lib/maps";
import { requestMobileLandscape } from "@/lib/mobile";
import {
  beginRound,
  hiderAlive,
  isHunter,
  remaining,
  roleOf,
  tickRoom,
  processFire,
} from "@/lib/round";
import { snapsFrom, type Session } from "@/lib/session";
import { resetSoloBots, tickSoloBots } from "@/lib/ai";
import type { PaintBlob, PlayerSnap, Pose, RoomState } from "@/lib/types";
import { POSES } from "@/lib/types";
import { AccessibleModal } from "./AccessibleModal";

type Tool = "brush" | "dropper" | "fill";

const KEY_BY_CODE: Record<string, string> = {
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  Space: " ",
  ShiftLeft: "shift",
  ShiftRight: "shift",
  ControlLeft: "control",
  ControlRight: "control",
  Tab: "tab",
  Escape: "escape",
  KeyF: "f",
  KeyH: "h",
  KeyR: "r",
  KeyC: "c",
  KeyT: "t",
  KeyE: "e",
  KeyB: "b",
  KeyV: "v",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
};

const CHAT_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
});

function normalizeKey(e: KeyboardEvent) {
  return KEY_BY_CODE[e.code] ?? e.key.toLowerCase();
}

export function GameView({
  session,
  serverName,
  roomLabel,
}: {
  session: Session;
  serverName: string;
  roomLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<GameWorld | null>(null);
  const [hud, setHud] = useState(() => session.getRoom());
  const [people, setPeople] = useState<PlayerSnap[]>([]);
  const [paintOpen, setPaintOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [color, setColor] = useState("#6b8f71");
  const [brush, setBrush] = useState(14);
  const [tool, setTool] = useState<Tool>("dropper");
  const [help, setHelp] = useState(false);
  const [watching, setWatching] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [atDoor, setAtDoor] = useState(false);
  const [tabOpen, setTabOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(() => session.getRoom().phase === "lobby");
  const socialVisible = socialOpen && hud.phase === "lobby";
  const paintOpenRef = useRef(false);
  const viewActiveRef = useRef(false);
  const watchingRef = useRef(false);
  const mobilePortraitRef = useRef(false);
  const touchKeysRef = useRef(new Set<string>());
  const touchJoystickKeysRef = useRef(new Set<string>());
  const touchLookRef = useRef({ pointerId: -1, x: 0, y: 0, dx: 0, dy: 0 });
  const touchFireRef = useRef(0);
  const helpRef = useRef(false);
  const colorRef = useRef(color);
  const brushRef = useRef(brush);
  const toolRef = useRef(tool);

  useEffect(() => {
    paintOpenRef.current = paintOpen;
    if (paintOpen) document.exitPointerLock();
  }, [paintOpen]);
  useEffect(() => {
    colorRef.current = color;
  }, [color]);
  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);
  useEffect(() => {
    helpRef.current = help;
  }, [help]);
  useEffect(() => {
    watchingRef.current = watching;
  }, [watching]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const world = new GameWorld(canvas);
    worldRef.current = world;
    const touchKeys = touchKeysRef.current;
    const startMap = getMap(session.getRoom().mapId);
    world.loadMap(startMap.id);
    const spawn0 = startMap.spawns[0];
    world.setLocal(spawn0.x, spawn0.z, 0);
    session.me().set("x", spawn0.x, true);
    session.me().set("z", spawn0.z, true);

    const keys = new Set<string>();
    const touchJoystickKeys = touchJoystickKeysRef.current;
    const mobilePortrait = window.matchMedia("(max-width: 767px) and (orientation: portrait)");
    let last = performance.now();
    let lastSync = 0;
    let lastShot = 0;
    let lastTaunt = 0;
    let lastForced = Date.now();
    let seenTouchFire = touchFireRef.current;
    let seenRound = session.getRoom().round;
    let bakedId = startMap.id;
    const hostTauntSeq = new Map<string, number>();

    const typing = (e: Event) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || !!el?.isContentEditable;
    };

    const syncMobileOrientation = () => {
      mobilePortraitRef.current = mobilePortrait.matches;
      if (!mobilePortrait.matches) return;
      document.exitPointerLock();
      viewActiveRef.current = false;
      keys.clear();
      touchKeys.clear();
      touchJoystickKeys.clear();
      touchLookRef.current.pointerId = -1;
      touchLookRef.current.dx = 0;
      touchLookRef.current.dy = 0;
      world.exitWatch();
      watchingRef.current = false;
      setWatching(false);
    };
    syncMobileOrientation();
    mobilePortrait.addEventListener("change", syncMobileOrientation);

    const tryLock = () => {
      if (paintOpenRef.current || helpRef.current) return;
      if (document.pointerLockElement === canvas) return;
      try {
        const lockRequest = canvas.requestPointerLock();
        void Promise.resolve(lockRequest).catch(() => {
          // Some browsers reject pointer lock; the click-activated fallback remains available.
        });
      } catch {
        /* ignore */
      }
    };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (typing(e)) return;
      if (mobilePortraitRef.current) return;
      const k = normalizeKey(e);
      if (down) {
        if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "tab"].includes(k)) {
          e.preventDefault();
        }
        if (k === "tab") {
          e.preventDefault();
          setTabOpen(true);
        }
        if (k === "f") setPaintOpen((v) => !v);
        if (k === "escape") {
          setPaintOpen(false);
          setHelp(false);
          viewActiveRef.current = false;
          keys.clear();
        }
        if (k === "h" || k === "?") setHelp((v) => !v);
        if (k === "r") cyclePose(session, world, 1);
        if (/^[1-7]$/.test(k)) {
          const pose = POSES[Number(k) - 1]?.id;
          if (pose) applyPosePick(session, world, pose);
        }
        if (k === "c" && !watchingRef.current) {
          const room = session.getRoom();
          const snap = snapsFrom(session).find((p) => p.id === session.myId());
          const canStick =
            !!snap &&
            !isHunter(room, snap.id) &&
            (room.phase === "lobby" ||
              ((room.phase === "hide" || room.phase === "hunt") && hiderAlive(room, snap.id)));
          if (canStick) applyPosePick(session, world, "stick");
        }
        if (k === "t") tryTaunt();
        if (k === "e") {
          if (paintOpenRef.current) setTool("dropper");
          else {
            const id = world.nearDoor();
            if (id) session.callDoor(id);
          }
        }
        if (k === "b") setTool("brush");
        if (paintOpenRef.current && (k === " " || k === "space")) {
          e.preventDefault();
          const c = world.sampleWorld(lastMx, lastMy);
          if (c) {
            setColor(c);
            colorRef.current = c;
            setTool("dropper");
          }
        }
        if (k === "v") {
          const room = session.getRoom();
          const snap = snapsFrom(session).find((p) => p.id === session.myId());
          const canWatch =
            !!snap &&
            (room.phase === "lobby" ||
              ((room.phase === "hide" || room.phase === "hunt") && hiderAlive(room, snap.id)));
          if (canWatch) {
            const on = world.toggleWatch();
            watchingRef.current = on;
            setWatching(on);
            if (on) {
              setPaintOpen(false);
              keys.delete(" ");
              keys.delete("space");
              keys.delete("shift");
              keys.delete("control");
            }
          }
        }
      }
      if (!down && k === "tab") setTabOpen(false);
      if (down) keys.add(k);
      else keys.delete(k);
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    const onBlur = () => {
      setTabOpen(false);
      viewActiveRef.current = false;
      keys.clear();
      touchKeys.clear();
      touchJoystickKeys.clear();
      touchLookRef.current.pointerId = -1;
      touchLookRef.current.dx = 0;
      touchLookRef.current.dy = 0;
    };
    window.addEventListener("blur", onBlur);

    const onMouseMove = (e: MouseEvent) => {
      if (mobilePortraitRef.current || paintOpenRef.current || helpRef.current) return;
      const lockedNow = document.pointerLockElement === canvas;
      if (!lockedNow && !viewActiveRef.current) return;
      if (!lockedNow && e.target !== canvas) return;
      world.lookDelta(e.movementX, e.movementY);
    };
    document.addEventListener("mousemove", onMouseMove);

    let hadPointerLock = document.pointerLockElement === canvas;
    const onLock = () => {
      const isLocked = document.pointerLockElement === canvas;
      setLocked(isLocked);
      if (isLocked) {
        hadPointerLock = true;
        viewActiveRef.current = true;
      } else if (hadPointerLock) {
        hadPointerLock = false;
        viewActiveRef.current = false;
        keys.clear();
      }
    };
    document.addEventListener("pointerlockchange", onLock);

    const stage = canvas.parentElement;
    let paintHeld = false;
    let lastPaintSync = 0;

    function strokePaint(clientX: number, clientY: number, dragging: boolean) {
      const prev = ((session.me().get("blobs") as PaintBlob[]) || []) as PaintBlob[];
      const next = world.paintDrag(
        clientX,
        clientY,
        colorRef.current,
        brushRef.current,
        session.myId(),
        prev,
        dragging,
      );
      if (!next) return;
      const clipped = next.slice(-MAX_BLOBS);
      const now = Date.now();
      session.me().set("blobs", clipped, !dragging || now - lastPaintSync > 90);
      if (now - lastPaintSync > 90) lastPaintSync = now;
    }

    function tryTaunt() {
      const room = session.getRoom();
      const me = snapsFrom(session).find((p) => p.id === session.myId());
      if (!me || room.phase !== "hunt") return;
      if (!hiderAlive(room, me.id)) return;
      const t = Date.now();
      if (t - lastTaunt < TAUNT_COOLDOWN) return;
      lastTaunt = t;
      const seq = Number(session.me().get("tauntSeq") ?? 0) + 1;
      session.me().set("tauntSeq", seq, true);
      session.me().set("tauntX", world.localX, true);
      session.me().set("tauntY", world.localZ, true);
    }

    let lastMx = window.innerWidth / 2;
    let lastMy = window.innerHeight / 2;
    const trackMouse = (e: PointerEvent | MouseEvent) => {
      lastMx = e.clientX;
      lastMy = e.clientY;
    };
    window.addEventListener("pointermove", trackMouse);

    const onContext = (e: Event) => e.preventDefault();
    stage?.addEventListener("contextmenu", onContext);

    const onPointerDown = (e: PointerEvent) => {
      if (mobilePortraitRef.current) {
        e.preventDefault();
        return;
      }
      if (e.button === 2) {
        const room = session.getRoom();
        const me = snapsFrom(session).find((p) => p.id === session.myId());
        if (me && room.phase === "hunt" && isHunter(room, me.id)) world.toggleHunterView();
        e.preventDefault();
        return;
      }
      if (e.button !== 0) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, input, select, textarea, aside, label")) {
        viewActiveRef.current = false;
        return;
      }
      const room = session.getRoom();
      const me = snapsFrom(session).find((p) => p.id === session.myId());
      if (!me) return;

      if (paintOpenRef.current) {
        if (toolRef.current === "dropper") {
          const c = world.sampleWorld(e.clientX, e.clientY);
          if (c) {
            setColor(c);
            colorRef.current = c;
          }
          return;
        }
        if (toolRef.current === "fill") {
          session.me().set("fill", colorRef.current, true);
          session.me().set("blobs", [], true);
          return;
        }
        paintHeld = true;
        try {
          stage?.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        strokePaint(e.clientX, e.clientY, false);
        return;
      }

      viewActiveRef.current = true;
      canvas.focus({ preventScroll: true });
      tryLock();

      if (room.phase === "hunt" && isHunter(room, me.id)) {
        const t = Date.now();
        if (t - lastShot < SHOT_COOLDOWN) return;
        const rounds = room.ammoCount || 6;
        const ammoLeft = room.ammo?.[me.id] ?? rounds;
        if (ammoLeft <= 0) return;
        lastShot = t;
        world.playShot(me.id, true);
        session.me().set("shootSeq", Number(session.me().get("shootSeq") ?? 0) + 1, true);
        const lockedNow = document.pointerLockElement === canvas;
        const aim = lockedNow
          ? world.aimPlayer(me.id)
          : world.aimPlayer(me.id, e.clientX, e.clientY);
        const hit =
          aim && aim.dist <= TAG_RANGE + 1.2 && hiderAlive(room, aim.id) ? aim.id : "";
        session.callShot(hit);
      }
    };
    const onPointerMovePaint = (e: PointerEvent) => {
      if (!paintHeld || !paintOpenRef.current) return;
      if (toolRef.current !== "brush") return;
      e.preventDefault();
      strokePaint(e.clientX, e.clientY, true);
    };
    const onPointerUpPaint = () => {
      if (!paintHeld) return;
      paintHeld = false;
      const blobs = ((session.me().get("blobs") as PaintBlob[]) || []) as PaintBlob[];
      session.me().set("blobs", blobs, true);
    };

    stage?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMovePaint);
    window.addEventListener("pointerup", onPointerUpPaint);
    window.addEventListener("pointercancel", onPointerUpPaint);

    const unshot = session.onShot((hunterId, targetId) => {
      if (!session.isHost()) return;
      const result = processFire(
        session.getRoom(),
        snapsFrom(session),
        hunterId,
        targetId,
        Date.now(),
      );
      session.setRoom(result.room);
    });
    const undoor = session.onDoor((id) => {
      if (!session.isHost()) return;
      const room = session.getRoom();
      const doors = { ...(room.doors ?? {}) };
      doors[id] = !doors[id];
      session.setRoom({ ...room, doors });
    });

    const resize = () => world.resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement ?? canvas);

    let raf = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const room = session.getRoom();
      if (room.mapId !== bakedId) {
        world.loadMap(room.mapId);
        bakedId = room.mapId;
        const s = getMap(room.mapId).spawns[0];
        world.setLocal(s.x, s.z);
      }
      const map = getMap(room.mapId);
      const players = snapsFrom(session);
      const me = players.find((p) => p.id === session.myId());

      if (touchFireRef.current !== seenTouchFire) {
        seenTouchFire = touchFireRef.current;
        if (!mobilePortraitRef.current && !paintOpenRef.current && !helpRef.current && !watchingRef.current && me && room.phase === "hunt" && isHunter(room, me.id)) {
          const shotAt = Date.now();
          const rounds = room.ammoCount || 6;
          const ammoLeft = room.ammo?.[me.id] ?? rounds;
          if (shotAt - lastShot >= SHOT_COOLDOWN && ammoLeft > 0) {
            lastShot = shotAt;
            world.playShot(me.id, true);
            session.me().set("shootSeq", Number(session.me().get("shootSeq") ?? 0) + 1, true);
            const aim = world.aimPlayer(me.id);
            const hit = aim && aim.dist <= TAG_RANGE + 1.2 && hiderAlive(room, aim.id) ? aim.id : "";
            session.callShot(hit);
          }
        }
      }

      if (room.round !== seenRound) {
        seenRound = room.round;
        if (me && room.round > 0) {
          const role = roleOf(room, me.id);
          const idx = Math.max(0, players.findIndex((p) => p.id === me.id));
          const spawn =
            role === "hunter"
              ? map.hunterSpawns[idx % map.hunterSpawns.length]
              : map.spawns[idx % map.spawns.length];
          world.setLocal(spawn.x, spawn.z);
          session.me().set("x", spawn.x, true);
          session.me().set("y", 0, true);
          session.me().set("z", spawn.z, true);
          session.me().set("fill", WHITE, true);
          session.me().set("blobs", [], true);
          session.me().set("pose", "stand", true);
          session.me().set("role", role, true);
          session.me().set("alive", role !== "spectator", true);
          session.me().set("ready", false, true);
          setPaintOpen(false);
          world.exitWatch();
          watchingRef.current = false;
          setWatching(false);
          if (session.kind === "practice") resetSoloBots(session, map, room);
        }
      }

      if (session.kind === "practice") tickSoloBots(session, map, room, dt, Date.now());
      const frameKeys = mobilePortraitRef.current ? new Set<string>() : new Set(keys);
      if (!mobilePortraitRef.current) {
        for (const key of touchKeysRef.current) frameKeys.add(key);
      }
      const look = touchLookRef.current;
      if (!mobilePortraitRef.current && !paintOpenRef.current && !helpRef.current && (look.dx !== 0 || look.dy !== 0)) {
        world.lookDelta(look.dx, look.dy);
        look.dx = 0;
        look.dy = 0;
      }
      world.syncDoors(room.doors ?? {});
      const hunterWait = !!(me && isHunter(room, me.id) && room.phase === "hide");
      const pose = ((session.me().get("pose") as Pose) || "stand") as Pose;
      const ghost =
        !!me &&
        room.phase === "hunt" &&
        room.mode === "normal" &&
        room.caughtIds.includes(me.id) &&
        !isHunter(room, me.id);
      if (ghost && watchingRef.current) {
        world.exitWatch();
        watchingRef.current = false;
        setWatching(false);
      }
      if (watchingRef.current && !mobilePortraitRef.current) world.stepSpectate(dt, frameKeys);
      const localMoving =
        !mobilePortraitRef.current &&
        !watchingRef.current &&
        (frameKeys.has("w") ||
          frameKeys.has("a") ||
          frameKeys.has("s") ||
          frameKeys.has("d") ||
          frameKeys.has("arrowup") ||
          frameKeys.has("arrowdown") ||
          frameKeys.has("arrowleft") ||
          frameKeys.has("arrowright"));
      const moved = world.stepLocal(
        dt,
        { keys: frameKeys, paintOpen: paintOpenRef.current, tool: toolRef.current, color: colorRef.current, brush: brushRef.current },
        !mobilePortraitRef.current && !hunterWait && room.phase !== "result" && !watchingRef.current,
        pose,
        ghost,
      );
      if (world.clinging()) {
        if (pose !== "stick") session.me().set("pose", "stick", true);
      } else if (pose === "stick") {
        session.me().set("pose", "stand", true);
      }
      if (!watchingRef.current) session.me().set("yaw", world.yaw, false);

      if (me && room.phase === "hunt" && hiderAlive(room, me.id)) {
        if (Date.now() - lastForced > FORCED_TAUNT) {
          lastForced = Date.now();
          tryTaunt();
        }
      }

      if (t - lastSync > 1000 / SYNC_HZ) {
        lastSync = t;
        session.me().set("x", moved.x, false);
        session.me().set("y", world.localY, false);
        session.me().set("z", moved.z, false);
        session.me().set("yaw", world.yaw, false);
      } else if (world.localY > 0.02) {
        session.me().set("y", world.localY, false);
      }

      if (session.isHost()) {
        let next = tickRoom(room, snapsFrom(session), Date.now());
        for (const p of session.players()) {
          const seq = Number(p.get("tauntSeq") ?? 0);
          const prev = hostTauntSeq.get(p.id) ?? 0;
          if (seq > prev) {
            hostTauntSeq.set(p.id, seq);
            next = {
              ...next,
              taunts: [
                ...next.taunts,
                {
                  id: p.id,
                  x: Number(p.get("tauntX") ?? 0),
                  y: Number(p.get("tauntY") ?? 0),
                  at: Date.now(),
                },
              ].slice(-12),
            };
          }
        }
        const myId = session.myId();
        const bodies = snapsFrom(session).map((p) =>
          p.id === myId ? { id: p.id, x: world.localX, z: world.localZ } : { id: p.id, x: p.x, z: p.z },
        );
        const closeIds = world.doorsToClose(next.doors ?? {}, bodies);
        if (closeIds.length) {
          const doors = { ...(next.doors ?? {}) };
          for (const id of closeIds) doors[id] = false;
          next = { ...next, doors };
        }
        if (
          next.phase !== room.phase ||
          next.phaseEndsAt !== room.phaseEndsAt ||
          next.caughtIds.length !== room.caughtIds.length ||
          next.taunts.length !== room.taunts.length ||
          next.winner !== room.winner ||
          next.round !== room.round ||
          next.lastTag?.at !== room.lastTag?.at ||
          (next.feed?.length ?? 0) !== (room.feed?.length ?? 0) ||
          JSON.stringify(next.ammo) !== JSON.stringify(room.ammo) ||
          closeIds.length
        ) {
          session.setRoom(next);
          if (closeIds.length) world.syncDoors(next.doors ?? {});
        }
      }

      const fpsHunt = !!(me && isHunter(room, me.id) && room.phase === "hunt");
      const live = snapsFrom(session);
      world.syncPlayers(live, session.myId(), room, { localMoving, dt, hideLocal: fpsHunt });
      world.updateCamera({
        paintOpen: paintOpenRef.current,
        hunterHide: hunterWait,
        fps: fpsHunt,
        moving: localMoving,
      });
      world.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const hudIv = window.setInterval(() => {
      setHud({ ...session.getRoom() });
      setPeople(snapsFrom(session));
      setNowTick(Date.now());
      setAtDoor(!!worldRef.current?.nearDoor());
    }, 120);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudIv);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerlockchange", onLock);
      canvas.parentElement?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMovePaint);
      window.removeEventListener("pointerup", onPointerUpPaint);
      window.removeEventListener("pointercancel", onPointerUpPaint);
      window.removeEventListener("pointermove", trackMouse);
      canvas.parentElement?.removeEventListener("contextmenu", onContext);
      mobilePortrait.removeEventListener("change", syncMobileOrientation);
      ro.disconnect();
      touchKeys.clear();
      touchJoystickKeys.clear();
      touchLookRef.current.pointerId = -1;
      touchLookRef.current.dx = 0;
      touchLookRef.current.dy = 0;
      unshot();
      undoor();
      world.dispose();
      viewActiveRef.current = false;
      worldRef.current = null;
    };
  }, [session]);

  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const me = people.find((p) => p.id === session.myId());
    drawBodyPreview(ctx, me?.fill ?? WHITE, me?.blobs ?? []);
  }, [people, session, paintOpen]);

  const me = people.find((p) => p.id === session.myId());
  const myRole = me ? roleOf(hud, me.id) : "spectator";
  const hunterHide = myRole === "hunter" && hud.phase === "hide";
  const timeLeft = remaining(hud, nowTick);
  const phaseAnnouncement =
    hud.phase === "lobby"
      ? "대기실"
      : hud.phase === "hide"
        ? "위장 시간"
        : hud.phase === "hunt"
          ? "수색 중"
          : hud.phase === "reveal"
            ? "검증 라운드"
            : hud.winner === "hiders"
              ? "카멜레온 승리"
              : "술래 승리";

  const startRound = (force = false) => {
    if (!session.isHost()) return;
    const players = snapsFrom(session);
    if (players.length < 1) return;
    if (!force && players.some((p) => !p.ready)) return;
    session.setRoom(beginRound(session.getRoom(), players.map((p) => p.id), Date.now()));
  };

  const toggleWatching = () => {
    const world = worldRef.current;
    if (!world) return;
    const room = session.getRoom();
    const snap = snapsFrom(session).find((p) => p.id === session.myId());
    const canWatch =
      !!snap &&
      (room.phase === "lobby" ||
        ((room.phase === "hide" || room.phase === "hunt") && hiderAlive(room, snap.id)));
    if (!canWatch) return;
    const on = world.toggleWatch();
    watchingRef.current = on;
    setWatching(on);
    if (on) {
      setPaintOpen(false);
      touchKeysRef.current.delete(" ");
      clearTouchJoystick();
      touchKeysRef.current.delete("shift");
      touchKeysRef.current.delete("control");
    }
  };

  const touchPress = (key: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    touchKeysRef.current.add(key);
  };

  const touchRelease = (key: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    touchKeysRef.current.delete(key);
  };

  const touchKeyboardPress = (key: string, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    touchKeysRef.current.add(key);
  };

  const touchKeyboardRelease = (key: string, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    touchKeysRef.current.delete(key);
  };

  const setTouchJoystickKeys = (keys: string[]) => {
    for (const key of touchJoystickKeysRef.current) touchKeysRef.current.delete(key);
    touchJoystickKeysRef.current.clear();
    for (const key of keys) {
      touchJoystickKeysRef.current.add(key);
      touchKeysRef.current.add(key);
    }
  };

  const clearTouchJoystick = () => {
    for (const key of touchJoystickKeysRef.current) touchKeysRef.current.delete(key);
    touchJoystickKeysRef.current.clear();
  };

  const triggerTouchFire = () => {
    touchFireRef.current += 1;
  };

  const touchLookStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    touchLookRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 };
  };

  const touchLookMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (touchLookRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    touchLookRef.current.dx += event.clientX - touchLookRef.current.x;
    touchLookRef.current.dy += event.clientY - touchLookRef.current.y;
    touchLookRef.current.x = event.clientX;
    touchLookRef.current.y = event.clientY;
  };

  const touchLookEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (touchLookRef.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    touchLookRef.current.pointerId = -1;
  };

  const touchLookKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const delta = {
      ArrowLeft: [-12, 0],
      ArrowRight: [12, 0],
      ArrowUp: [0, -12],
      ArrowDown: [0, 12],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    touchLookRef.current.dx += delta[0];
    touchLookRef.current.dy += delta[1];
  };

  return (
    <main id="main-content" aria-label="카멜레온 게임" className="game-shell safe-screen relative flex h-dvh w-full flex-col overflow-hidden bg-[#0b100d] text-paper md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-lime focus:px-3 focus:py-2 focus:text-sm focus:text-black"
      >
        본문으로 건너뛰기
      </a>
      <h1 className="sr-only">카멜레온 게임</h1>
      <p id="game-accessibility-help" className="sr-only">
        게임 화면에 포커스를 둔 뒤 WASD로 이동하고 마우스로 시점을 조작합니다. 1부터 7까지의 숫자 키로 자세를 고르고, T로 도발, V로 관전, Tab으로 현황을 확인하고 Escape로 열린 패널을 닫습니다.
      </p>
      {hud.phase === "lobby" && (
        <Lobby
          session={session}
          room={hud}
          people={people}
          serverName={serverName}
          roomLabel={roomLabel}
          onStart={() => startRound(false)}
        />
      )}

      <div className="relative min-h-0 min-w-0 flex-1">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label="3D 게임 화면"
          aria-describedby="game-accessibility-help"
          aria-keyshortcuts="W A S D 1 2 3 4 5 6 7 T V Tab Escape"
          className={`absolute inset-0 h-full w-full touch-none ${paintOpen ? "cursor-crosshair" : locked ? "cursor-none" : "cursor-default"}`}
        />

        {hud.phase !== "lobby" && (
          <div
            className="mobile-portrait-guard pointer-events-auto absolute inset-0 z-[80] hidden flex-col items-center justify-center bg-[#0b100d] px-6 text-center"
            role="status"
            aria-live="polite"
          >
            <div className="text-4xl" aria-hidden="true">↔</div>
            <h2 className="text-wrap-balance mt-3 font-display text-3xl text-lime">휴대폰을 가로로 돌려주세요</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">
              카멜레온 게임은 가로 화면에서만 플레이할 수 있습니다.
            </p>
            <button
              type="button"
              className="mt-5 rounded-full bg-lime px-5 py-2.5 font-display text-black"
              onClick={() => void requestMobileLandscape()}
            >
              가로 화면으로 시작
            </button>
          </div>
        )}

        <div aria-live="polite" aria-atomic="false" className="pointer-events-none absolute left-3 top-[4.5rem] z-30 flex w-[min(100%,300px)] flex-col gap-1.5">
          {(hud.feed ?? [])
            .filter((f) => nowTick - f.at < 9000)
            .slice(-6)
            .map((f) => (
              <div
                key={`${f.at}-${f.id}`}
                className="flex items-center gap-2 rounded-lg border-l-4 border-pink bg-black/70 px-2.5 py-1.5 text-[13px] leading-snug backdrop-blur-sm"
              >
                <span className="font-display text-[11px] tracking-wide text-pink">처치</span>
                <span className="font-display text-white">{f.byName}</span>
                <span className="text-white/60">→</span>
                <span className="font-display text-lime">{f.name}</span>
              </div>
            ))}
        </div>

        <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-3">
          <div className="rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-sm">
            <div className="text-[11px] tracking-wide text-lime/80">
              {serverName} · {roomLabel}
              {session.kind === "practice" ? " · AI 매치" : ""} · Three.js
            </div>
            <div className="font-display text-lg leading-none">
              {hud.phase === "lobby" && "대기실 — WASD·조이스틱으로 이동"}
              {hud.phase === "hide" && "위장 시간"}
              {hud.phase === "hunt" && "수색 중"}
              {hud.phase === "reveal" && "검증 라운드"}
              {hud.phase === "result" && (hud.winner === "hiders" ? "카멜레온 승리" : "술래 승리")}
            </div>
          </div>
          {(hud.phase === "hide" || hud.phase === "hunt" || hud.phase === "reveal") && (
            <div className="rounded-2xl bg-black/50 px-4 py-2 text-center backdrop-blur-sm">
              <div className="text-[11px] text-white/60">남은 시간</div>
              <div className="font-display text-3xl leading-none text-lime tabular-nums">{timeLeft}</div>
            </div>
          )}
          <div className="rounded-2xl bg-black/45 px-3 py-2 text-right backdrop-blur-sm">
            <div className="text-[11px] text-white/60">나</div>
            <div className="font-display text-lg leading-none">
              {hud.phase === "lobby"
                ? me?.name
                : myRole === "hunter"
                  ? "술래"
                  : myRole === "hider"
                    ? "카멜레온"
                    : "관전"}
            </div>
          </div>
        </header>

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          현재 상태: {phaseAnnouncement}
          {myRole === "hunter" ? " · 술래" : myRole === "hider" ? " · 카멜레온" : " · 관전"}
        </div>

        {!locked && !paintOpen && !hunterHide && hud.phase !== "result" && hud.phase !== "reveal" && (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm">
            {myRole === "hunter" && hud.phase === "hunt"
              ? "1인칭 수색 · 마우스 조준 · 좌클릭 발사"
              : "게임 화면에서 마우스 이동 = 시점 · 좌클릭 = 조준 태그"}
          </div>
        )}

        {hud.phase === "hunt" && myRole === "hunter" && me && (
          <>
            <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
              <div className="h-8 w-8 rounded-full border-2 border-white/80" />
              <div className="absolute h-px w-10 bg-white/70" />
              <div className="absolute h-10 w-px bg-white/70" />
            </div>
            <div className="pointer-events-none absolute bottom-28 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-center">
              <div className="text-[11px] tracking-wide text-white/65">탄약</div>
              <div className="flex items-center justify-center gap-1">
                {Array.from({ length: hud.ammoCount || 6 }).map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block h-3 w-2 rounded-sm ${
                      i < (hud.ammo?.[me.id] ?? 0) ? "bg-amber-300" : "bg-white/20"
                    }`}
                  />
                ))}
              </div>
              <div className="font-display text-lg text-amber-200">
                {hud.ammo?.[me.id] ?? 0}/{hud.ammoCount || 6}
                {(hud.ammo?.[me.id] ?? 0) <= 0 ? " · 탄 없음" : ""}
              </div>
            </div>
          </>
        )}

        {hunterHide && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b100d] text-center">
            <p className="text-sm text-lime">술래는 아직 입장할 수 없습니다</p>
            <h2 className="text-wrap-balance mt-2 font-display text-5xl">위장 중…</h2>
            <p className="mt-3 text-white/70">카멜레온들이 3D 맵에서 몸을 칠하고 있습니다</p>
            <div className="mt-8 font-display text-7xl text-lime">{timeLeft}</div>
          </div>
        )}

        {hud.lastTag && nowTick - hud.lastTag.at < 2200 && hud.phase === "hunt" && (
          <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-2xl bg-pink px-6 py-2 text-center text-black shadow-lg" role="status" aria-live="polite">
            <div className="text-[11px] font-semibold tracking-[0.2em]">처치</div>
            <div className="font-display text-2xl leading-none">
              {hud.lastTag.byName} → {hud.lastTag.name}
            </div>
          </div>
        )}

        {atDoor && !paintOpen && (
          <div className="pointer-events-none absolute left-1/2 bottom-28 z-30 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm">
            <span className="font-display text-lime">E</span> 문 열기/닫기
          </div>
        )}

        {me?.pose === "stick" && (
          <div className="pointer-events-none absolute left-1/2 top-28 z-30 -translate-x-1/2 rounded-2xl bg-black/70 px-5 py-3 text-center">
            <div className="font-display text-xl text-lime">벽에 붙음</div>
            <p className="text-sm text-white/75">A/D 좌우 · W/S 오르내리기 · C 또는 Space 떼기</p>
          </div>
        )}

        {watching && (myRole === "hider" || hud.phase === "lobby") && (
          <div className="pointer-events-none absolute left-1/2 top-44 z-30 -translate-x-1/2 rounded-2xl bg-black/70 px-5 py-3 text-center">
            <div className="font-display text-xl text-lime">{hud.phase === "lobby" ? "대기실 관전" : "숨은 채 관전"}</div>
            <p className="text-sm text-white/75">
              {hud.phase === "lobby"
                ? "WASD·Q/E로 맵 둘러보기 · V 복귀"
                : "몸은 그대로 있습니다. WASD·Q/E로 카메라 이동 · V 복귀"}
            </p>
          </div>
        )}

        {myRole === "spectator" && hud.phase === "hunt" && (
          <div className="pointer-events-none absolute left-1/2 top-36 z-30 -translate-x-1/2 rounded-2xl border border-cyan-200/40 bg-[#123038]/85 px-5 py-3 text-center backdrop-blur-sm">
            <div className="font-display text-2xl text-cyan-100">유령</div>
            <p className="text-sm text-cyan-50/80">잡혔습니다. 몸은 투명하고, 벽을 지나 맵을 둘러볼 수 있어요.</p>
          </div>
        )}

        {hud.phase === "result" && (
          <ResultPanel room={hud} people={people} host={session.isHost()} onNext={() => startRound(true)} />
        )}

        {hud.phase === "reveal" && <RevealPanel room={hud} timeLeft={timeLeft} />}

        {!hunterHide && hud.phase !== "result" && hud.phase !== "reveal" && (
          <div id="game-instructions" className="absolute bottom-3 left-3 z-10 max-w-[240px] rounded-2xl bg-black/40 p-3 text-[12px] leading-relaxed text-white/80 backdrop-blur-sm">
            {myRole === "hunter" && hud.phase === "hunt" ? (
              <>
                <div>술래 1인칭 · 우클릭 3인칭 · WASD · Shift 달리기 · Ctrl 숙이기</div>
                <div className="mt-1 text-pink">좌클릭 발사 · 맞히면 탄 회복 · Tab 현황</div>
              </>
            ) : (
              <>
                <div>WASD 걷기 · Shift 달리기 · Space 점프/벽오르기 · Ctrl 내려가기</div>
                <div>1~7 자세 · F 페인트 · T 도발 · V 관전 · E 문 · Tab 현황</div>
              </>
            )}
          </div>
        )}

        <div className="game-action-controls absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2" role="toolbar" aria-label="게임 조작">
          <button
            type="button"
            aria-keyshortcuts="H"
            className="shortcut-control rounded-full bg-black/50 px-3 py-1 text-sm"
            onClick={() => setHelp(true)}
          >
            <span className="shortcut-key-badge" aria-hidden="true">H</span>
            도움말
          </button>
          {myRole !== "hunter" && hud.phase !== "result" && hud.phase !== "reveal" && (
            <button
              type="button"
              aria-keyshortcuts="F"
              className={`shortcut-control rounded-full px-4 py-2 font-display ${paintOpen ? "bg-lime text-black" : "bg-black/50"}`}
              onClick={() => setPaintOpen((v) => !v)}
            >
              <span className="shortcut-key-badge" aria-hidden="true">F</span>
              {paintOpen ? "페인트 ON" : "페인트"}
            </button>
          )}
          {hud.phase !== "reveal" && !(myRole === "hunter" && hud.phase === "hunt") && (
            <div className="pose-action-row flex flex-wrap justify-end gap-1.5 pt-2" role="group" aria-label="자세 선택. 1번부터 7번 키로 선택합니다.">
              {POSES.map((p, index) => (
                <button
                  key={p.id}
                  type="button"
                  aria-keyshortcuts={String(index + 1)}
                  aria-label={`${p.label}, ${index + 1}번 키`}
                  title={`${p.hint} · ${index + 1}번 키`}
                  onClick={() => {
                    const w = worldRef.current;
                    if (!w) {
                      session.me().set("pose", p.id, true);
                      return;
                    }
                    applyPosePick(session, w, p.id);
                  }}
                  className={`shortcut-control rounded-lg px-2 py-1 text-[11px] ${me?.pose === p.id ? "bg-lime text-black" : "bg-black/45"}`}
                >
                  <span className="shortcut-key-badge" aria-hidden="true">{index + 1}</span>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {!hunterHide && hud.phase !== "result" && hud.phase !== "reveal" && !socialVisible && !paintOpen && (
          <TouchControls
            canWatch={myRole === "hider" || hud.phase === "lobby"}
            canFire={myRole === "hunter" && hud.phase === "hunt"}
            canPaint={myRole !== "hunter"}
            watching={watching}
            paintOpen={paintOpen}
            onTogglePaint={() => setPaintOpen((v) => !v)}
            onToggleWatch={toggleWatching}
            onFire={triggerTouchFire}
            onJoystickChange={setTouchJoystickKeys}
            onJoystickEnd={clearTouchJoystick}
            onPress={touchPress}
            onRelease={touchRelease}
            onKeyboardPress={touchKeyboardPress}
            onKeyboardRelease={touchKeyboardRelease}
            onLookStart={touchLookStart}
            onLookMove={touchLookMove}
            onLookEnd={touchLookEnd}
            onLookKey={touchLookKey}
          />
        )}

        {paintOpen && myRole !== "hunter" && hud.phase !== "result" && hud.phase !== "reveal" && (
          <aside
            className="absolute bottom-24 right-3 z-20 w-[230px] overscroll-contain rounded-2xl border border-white/10 bg-[#121a16]/95 p-3 shadow-xl"
            role="dialog"
            aria-modal="false"
            aria-labelledby="paint-panel-title"
          >
            <div className="mb-2 flex items-center justify-between text-sm">
              <span id="paint-panel-title" className="font-display">위장 팔레트</span>
              <button type="button" onClick={() => setPaintOpen(false)}>
                닫기
              </button>
            </div>
            <canvas ref={previewRef} width={200} height={200} aria-label="현재 내 캐릭터 미리보기" className="w-full rounded-xl bg-[#0b100d]" />
            <div className="mt-2 flex gap-1">
              {(
                [
                  ["dropper", "스포이드"],
                  ["brush", "붓"],
                  ["fill", "통칠"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTool(id)}
                  className={`flex-1 rounded-lg py-1 text-[12px] ${tool === id ? "bg-lime text-black" : "bg-white/10"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs">
              색
              <input
                type="color"
                name="paintColor"
                autoComplete="off"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-full cursor-pointer bg-transparent"
              />
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs">
              붓
              <input
                type="range"
                name="brushSize"
                autoComplete="off"
                min={6}
                max={28}
                value={brush}
                onChange={(e) => setBrush(Number(e.target.value))}
                className="w-full"
              />
            </label>
            <div className="mt-2 flex gap-1">
              <button
                type="button"
                className="flex-1 rounded-lg bg-white/10 py-1 text-xs"
                onClick={() => {
                  session.me().set("fill", color, true);
                  session.me().set("blobs", [], true);
                }}
              >
                몸 전체
              </button>
              <button
                type="button"
                className="flex-1 rounded-lg bg-white/10 py-1 text-xs"
                onClick={() => {
                  session.me().set("fill", WHITE, true);
                  session.me().set("blobs", [], true);
                }}
              >
                지우기
              </button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-white/65">
              스포이드로 벽 색을 찍고, 붓으로 몸을 클릭한 채 드래그하면 선이 그어집니다.
            </p>
          </aside>
        )}
      </div>

      {tabOpen && (
        <ScoreTab
          room={hud}
          people={people}
          myId={session.myId()}
        />
      )}

      {hud.phase === "lobby" && (
        <RoomSocialPanel
          session={session}
          room={hud}
          people={people}
          open={socialVisible}
          onToggle={() => setSocialOpen((value) => !value)}
        />
      )}

      {help && (
        <AccessibleModal titleId="game-help-title" onClose={() => setHelp(false)} panelClassName="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl bg-[#17241c] p-6 shadow-2xl">
          <h2 id="game-help-title" className="text-wrap-balance font-display text-2xl">3D 카멜론</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-white/80">
            <li>위치 → 자세 → 스포이드 → 페인트 순서가 정석입니다. 색만 맞추면 윤곽으로 들킵니다.</li>
            <li>WASD 걷기, Shift 달리기, Space 점프. 벽에 붙으면 Space로 오르고 Ctrl로 내려가고 Shift로 뗍니다.</li>
            <li>1~7로 자세를 고르고, F로 페인트를 엽니다. Space로 벽 색을 빨아 칠하고, T로 휘파람, V로 대기실·숨은 채 관전, E로 문을 엽니다. 열고 지나가면 닫힙니다.</li>
            <li>술래는 1인칭 총. 우클릭으로 3인칭. 맞히면 탄이 돌아오고, 빗나가야 탄이 줄어듭니다.</li>
            <li>감염(기본)은 잡히면 술래가 됩니다. 제한 시간까지 한 명이라도 남으면 카멜레온 승.</li>
            <li>Tab을 누르면 참여자·생존자·죽은자와 점수가 나옵니다. 처치 +{SCORE_TAG}, 생존 승리 +{SCORE_SURVIVE}, 술래 승리 +{SCORE_HUNT_WIN}.</li>
          </ol>
          <button
            type="button"
            className="mt-5 w-full rounded-full bg-lime py-2 font-display text-black"
            onClick={() => setHelp(false)}
          >
            닫기
          </button>
        </AccessibleModal>
      )}
    </main>
  );
}

function TouchControls({
  canWatch,
  canFire,
  canPaint,
  watching,
  paintOpen,
  onTogglePaint,
  onToggleWatch,
  onPress,
  onRelease,
  onKeyboardPress,
  onKeyboardRelease,
  onLookStart,
  onLookMove,
  onLookEnd,
  onLookKey,
  onFire,
  onJoystickChange,
  onJoystickEnd,
}: {
  canWatch: boolean;
  canFire: boolean;
  canPaint: boolean;
  watching: boolean;
  paintOpen: boolean;
  onTogglePaint: () => void;
  onToggleWatch: () => void;
  onPress: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onRelease: (key: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onKeyboardPress: (key: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onKeyboardRelease: (key: string, event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onLookStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLookMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLookEnd: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onLookKey: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onFire: () => void;
  onJoystickChange: (keys: string[]) => void;
  onJoystickEnd: () => void;
}) {
  const joystickKnobRef = useRef<HTMLSpanElement>(null);
  const joystickPointerRef = useRef(-1);

  const updateJoystick = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const max = Math.max(1, Math.min(rect.width, rect.height) / 2 - 25);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const length = Math.hypot(event.clientX - centerX, event.clientY - centerY) || 1;
    const scale = Math.min(1, max / length);
    const dx = (event.clientX - centerX) * scale;
    const dy = (event.clientY - centerY) * scale;
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    const threshold = max * 0.24;
    const next: string[] = [];
    if (dy < -threshold) next.push("w");
    if (dy > threshold) next.push("s");
    if (dx < -threshold) next.push("a");
    if (dx > threshold) next.push("d");
    onJoystickChange(next);
  };

  const resetJoystick = () => {
    joystickPointerRef.current = -1;
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate(-50%, -50%)";
    onJoystickEnd();
  };

  const joystickStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    joystickPointerRef.current = event.pointerId;
    updateJoystick(event);
  };

  const joystickMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateJoystick(event);
  };

  const joystickEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resetJoystick();
  };

  const joystickKey = (key: string) => ({
    ArrowUp: "w",
    ArrowDown: "s",
    ArrowLeft: "a",
    ArrowRight: "d",
    w: "w",
    a: "a",
    s: "s",
    d: "d",
  })[key];

  const joystickKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const key = joystickKey(event.key);
    if (!key) return;
    event.preventDefault();
    onJoystickChange([key]);
  };

  const joystickKeyUp = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!joystickKey(event.key)) return;
    event.preventDefault();
    onJoystickEnd();
  };

  const button = (key: string, label: string, className = "") => (
    <button
      type="button"
      aria-label={label}
      className={`mobile-touch-button pointer-events-auto min-h-11 select-none rounded-xl border border-white/15 bg-black/65 px-3 py-2 text-xs font-semibold text-white shadow-lg backdrop-blur-sm ${className}`}
      onPointerDown={(event) => onPress(key, event)}
      onPointerUp={(event) => onRelease(key, event)}
      onPointerCancel={(event) => onRelease(key, event)}
      onLostPointerCapture={(event) => onRelease(key, event)}
      onKeyDown={(event) => onKeyboardPress(key, event)}
      onKeyUp={(event) => onKeyboardRelease(key, event)}
    >
      {label}
    </button>
  );

  return (
    <div className="mobile-touch-controls pointer-events-none absolute inset-0 z-20 select-none" role="group" aria-label="터치 게임 조작">
      <div
        className="mobile-joystick pointer-events-auto absolute bottom-3 left-3 h-32 w-32 rounded-full border border-white/20 bg-black/35 shadow-lg backdrop-blur-sm"
        data-touch-control="true"
        role="group"
        tabIndex={0}
        aria-label="이동 조이스틱. 드래그해서 이동합니다."
        aria-keyshortcuts="W A S D ArrowUp ArrowDown ArrowLeft ArrowRight"
        onPointerDown={joystickStart}
        onPointerMove={joystickMove}
        onPointerUp={joystickEnd}
        onPointerCancel={joystickEnd}
        onLostPointerCapture={joystickEnd}
        onKeyDown={joystickKeyDown}
        onKeyUp={joystickKeyUp}
      >
        <span ref={joystickKnobRef} className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-lime/70 bg-lime/25 shadow-[0_0_18px_rgba(198,255,74,0.3)]" />
        <span className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] font-semibold tracking-widest text-white/60">이동</span>
      </div>

      <div
        className="mobile-look-pad pointer-events-auto absolute bottom-3 right-3 flex h-32 w-44 items-center justify-center rounded-2xl border border-white/15 bg-black/25 text-xs text-white/60 backdrop-blur-sm"
        data-touch-control="true"
        tabIndex={0}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        onPointerDown={onLookStart}
        onPointerMove={onLookMove}
        onPointerUp={onLookEnd}
        onPointerCancel={onLookEnd}
        onLostPointerCapture={onLookEnd}
        onKeyDown={onLookKey}
        aria-label="시야 조작 영역. 드래그해서 시점을 회전합니다."
        role="group"
      >
        시야 드래그
      </div>

      <div className="mobile-touch-actions pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
        {button("shift", "달리기")}
        {button(" ", "점프·벽 붙기")}
        {canFire && (
          <button
            type="button"
            className="mobile-touch-button min-h-11 rounded-xl border border-pink/40 bg-pink px-3 py-2 text-xs font-semibold text-black shadow-lg backdrop-blur-sm"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFire();
            }}
          >
            발사
          </button>
        )}
        {canWatch && (
          <button
            type="button"
            aria-pressed={watching}
            className={`mobile-touch-button min-h-11 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-sm ${watching ? "bg-lime text-black" : "bg-black/65 text-white"}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleWatch();
            }}
          >
            {watching ? "관전 종료" : "관전"}
          </button>
        )}
        {!watching && canPaint && (
          <button
            type="button"
            aria-pressed={paintOpen}
            className={`mobile-touch-button min-h-11 rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur-sm ${paintOpen ? "bg-lime text-black" : "bg-black/65 text-white"}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onTogglePaint();
            }}
          >
            페인트
          </button>
        )}
      </div>
    </div>
  );
}

function applyPosePick(session: Session, world: GameWorld, pose: Pose) {
  if (pose === "stick") {
    const cur = ((session.me().get("pose") as Pose) || "stand") as Pose;
    const on = world.tryCling(cur);
    session.me().set("pose", on ? "stick" : "stand", true);
    return;
  }
  world.exitCling();
  session.me().set("pose", pose, true);
}

function cyclePose(session: Session, world: GameWorld, dir: number) {
  const cur = (session.me().get("pose") as Pose) || "stand";
  const i = POSES.findIndex((p) => p.id === cur);
  const next = POSES[(i + dir + POSES.length) % POSES.length];
  applyPosePick(session, world, next.id);
}

function Lobby({
  session,
  room,
  people,
  serverName,
  roomLabel,
  onStart,
}: {
  session: Session;
  room: RoomState;
  people: PlayerSnap[];
  serverName: string;
  roomLabel: string;
  onStart: () => void;
}) {
  const host = session.isHost();
  const me = people.find((p) => p.id === session.myId());
  const readyCount = people.filter((p) => p.ready).length;
  const allReady = people.length >= 1 && readyCount === people.length;
  return (
    <aside className="z-20 flex max-h-[46dvh] w-full shrink-0 flex-col overflow-y-auto overscroll-contain border-b border-white/10 bg-[#121c17] p-4 md:h-full md:max-h-none md:w-[min(100%,360px)] md:border-b-0 md:border-r">
      <p className="text-xs text-lime">
        {serverName} · {roomLabel}
      </p>
      <h2 className="text-wrap-balance font-display text-3xl">방 대기실</h2>
      <p className="mt-1 text-sm text-white/65">맵에서 WASD 또는 가로 화면 조이스틱으로 이동해 보세요. 전원 준비 완료 후에만 호스트가 시작할 수 있습니다.</p>
      <ul className="mt-4 space-y-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span>
              {p.name}
              {p.id === session.myId() ? " (나)" : ""}
              {host && p.id === session.myId() ? " · 호스트" : ""}
            </span>
            <span className={p.ready ? "text-lime" : "text-white/60"}>{p.ready ? "준비" : "대기"}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className={`flex-1 rounded-full py-2 font-display ${me?.ready ? "bg-lime text-black" : "bg-white/10"}`}
          onClick={() => session.me().set("ready", !me?.ready, true)}
        >
          {me?.ready ? "준비 완료" : "준비"}
        </button>
        <button type="button" className="rounded-full bg-white/10 px-4" onClick={() => session.leave()}>
          나가기
        </button>
      </div>
      <div className="mt-4 rounded-2xl bg-black/25 p-3">
          <div id="map-label" className="text-xs text-white/60">맵</div>
          <div className="mt-1 grid grid-cols-1 gap-2" role="group" aria-labelledby="map-label">
            {MAPS.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!host}
                aria-pressed={room.mapId === m.id}
                onClick={() => session.setRoom({ ...room, mapId: m.id, doors: {} })}
                className={`rounded-xl px-3 py-2 text-left ${room.mapId === m.id ? "bg-lime text-black" : "bg-white/8"}`}
            >
              <div className="font-display">
                {m.name} · {m.difficulty}
              </div>
              <div className={`text-xs ${room.mapId === m.id ? "text-black/70" : "text-white/65"}`}>{m.blurb}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <label className="rounded-xl bg-white/8 p-2">
            모드
            <select
              name="mode"
              autoComplete="off"
              className="mt-1 w-full bg-[#121c17] text-paper"
              disabled={!host}
              value={room.mode}
              onChange={(e) => session.setRoom({ ...room, mode: e.target.value as RoomState["mode"] })}
            >
              <option value="infection">감염 (기본)</option>
              <option value="normal">노말</option>
            </select>
          </label>
          {session.kind === "practice" && (
            <label className="rounded-xl bg-white/8 p-2">
              술래 설정
              <select
                name="hunterMode"
                autoComplete="off"
                className="mt-1 w-full bg-[#121c17] text-paper"
                value={room.hunterMode ?? "ai"}
                onChange={(e) => {
                  const hunterMode = e.target.value as RoomState["hunterMode"];
                  session.setRoom({
                    ...room,
                    hunterMode,
                    hunterPlayerId: hunterMode === "random" ? undefined : session.myId(),
                  });
                }}
              >
                <option value="ai">AI 술래 (내가 숨기)</option>
                <option value="human">내가 술래</option>
                <option value="random">랜덤</option>
              </select>
            </label>
          )}
          <label className="rounded-xl bg-white/8 p-2">
            술래 수
            <input
              type="number"
              name="hunterCount"
              autoComplete="off"
              inputMode="numeric"
              min={1}
              max={3}
              disabled={!host}
              className="mt-1 w-full bg-transparent"
              value={room.hunterCount}
              onChange={(e) => session.setRoom({ ...room, hunterCount: Number(e.target.value) || 1 })}
            />
          </label>
          <label className="rounded-xl bg-white/8 p-2">
            위장(초)
            <input
              type="number"
              name="hideTime"
              autoComplete="off"
              inputMode="numeric"
              min={30}
              max={180}
              disabled={!host}
              className="mt-1 w-full bg-transparent"
              value={room.hideTime}
              onChange={(e) => session.setRoom({ ...room, hideTime: Number(e.target.value) || 70 })}
            />
          </label>
          <label className="rounded-xl bg-white/8 p-2">
            수색(초)
            <input
              type="number"
              name="huntTime"
              autoComplete="off"
              inputMode="numeric"
              min={60}
              max={300}
              disabled={!host}
              className="mt-1 w-full bg-transparent"
              value={room.huntTime}
              onChange={(e) => session.setRoom({ ...room, huntTime: Number(e.target.value) || 150 })}
            />
          </label>
          <label className="col-span-2 rounded-xl bg-white/8 p-2">
            술래 탄 수 (난사 방지)
            <input
              type="number"
              name="ammoCount"
              autoComplete="off"
              inputMode="numeric"
              min={3}
              max={12}
              disabled={!host}
              className="mt-1 w-full bg-transparent"
              value={room.ammoCount || 6}
              onChange={(e) =>
                session.setRoom({ ...room, ammoCount: Math.max(3, Math.min(12, Number(e.target.value) || 6)) })
              }
            />
          </label>
        </div>
        {host ? (
          <>
            <button
              type="button"
              onClick={onStart}
              aria-describedby="round-start-status"
              disabled={!allReady}
              className="mt-4 w-full rounded-full bg-lime py-3 font-display text-lg text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {people.length < 2 ? "연습 라운드 시작" : "라운드 시작"}
            </button>
            <p id="round-start-status" className="mt-2 text-center text-xs text-white/65">
              {allReady ? "전원 준비됨" : `준비 ${readyCount}/${people.length} — 모두 준비해야 시작됩니다`}
            </p>
            <p className="mt-2 text-center text-[11px] text-white/60">
              점수: 처치 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승 +{SCORE_HUNT_WIN} · Tab 현황
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-center text-sm text-white/65">
              호스트 시작 대기 · 준비 {readyCount}/{people.length}
            </p>
            <p className="mt-2 text-center text-[11px] text-white/60">
              점수: 처치 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승 +{SCORE_HUNT_WIN} · Tab 현황
            </p>
          </>
        )}
      </div>
    </aside>
  );
}

function RoomSocialPanel({
  session,
  room,
  people,
  open,
  onToggle,
}: {
  session: Session;
  room: RoomState;
  people: PlayerSnap[];
  open: boolean;
  onToggle: () => void;
}) {
  const [draft, setDraft] = useState("");
  const messages = (room.chat ?? []).slice(-24);

  const send = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    session.sendChat(text);
    setDraft("");
  };

  return (
    <aside className="room-social-shell pointer-events-auto absolute bottom-24 left-3 right-3 top-auto z-30 max-h-[calc(100dvh-11rem)] w-auto overflow-y-auto overscroll-contain md:bottom-auto md:left-auto md:right-3 md:top-[5.5rem] md:w-[min(calc(100vw-1.5rem),320px)] md:max-h-none md:overflow-visible">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="room-social-panel"
        onClick={onToggle}
        className="ml-auto flex items-center gap-2 rounded-full border border-lime/30 bg-[#101a14]/95 px-3 py-2 text-sm shadow-lg backdrop-blur-sm"
      >
        <span className="h-2 w-2 rounded-full bg-lime shadow-[0_0_10px_rgba(198,255,74,0.8)]" aria-hidden="true" />
        <span>접속자 {people.length}/{MAX_PLAYERS}</span>
        <span className="text-white/60">·</span>
        <span>{open ? "패널 닫기" : "채팅 열기"}</span>
      </button>

      {open && (
        <section
          id="room-social-panel"
          aria-labelledby="room-social-title"
          className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[#101a14]/95 shadow-2xl backdrop-blur-md"
        >
          <div className="border-b border-white/10 px-3 py-2">
            <div className="flex items-center justify-between">
              <h2 id="room-social-title" className="text-wrap-balance font-display text-lg">통합 룸</h2>
              <span className="text-xs text-lime">최대 {MAX_PLAYERS}인</span>
            </div>
            <p className="mt-0.5 text-[11px] text-white/60">현재 접속 중인 플레이어</p>
            <ul className="mt-2 grid grid-cols-2 gap-1.5" aria-label="접속자 목록">
              {people.map((person) => {
                const status = presenceStatus(room, person, session.myId());
                return (
                  <li
                    key={person.id}
                    className="flex min-w-0 items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5 text-xs"
                    title={`${person.name} · ${status}`}
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-lime" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{person.name}</span>
                    <span className="shrink-0 text-[10px] text-white/60">{status}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="px-3 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold tracking-wide text-white/65">방 채팅</h3>
              <span className="text-[10px] text-white/55">최근 {messages.length}개</span>
            </div>
            <div
              className="mt-1.5 h-40 overflow-y-auto rounded-xl bg-black/25 p-2"
              role="log"
              aria-live="polite"
              aria-label="방 채팅 메시지"
            >
              {messages.length === 0 ? (
                <p className="grid h-full place-items-center text-xs text-white/55">첫 인사를 남겨보세요.</p>
              ) : (
                <ul className="space-y-2">
                  {messages.map((message) => (
                    <li key={message.id} className="text-xs leading-snug">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold text-lime">{message.senderName}</span>
                        <time className="text-[10px] text-white/55" dateTime={new Date(message.at).toISOString()}>
                          {CHAT_TIME_FORMAT.format(message.at)}
                        </time>
                      </div>
                      <p className="break-words text-white/80">{message.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <form className="mt-2 flex gap-1.5 pb-3" onSubmit={send}>
              <label className="sr-only" htmlFor="room-chat-input">
                채팅 메시지
              </label>
              <input
                id="room-chat-input"
                name="message"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={120}
                placeholder="예: 여기로 와!…"
                aria-label="채팅 메시지"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2.5 py-2 text-xs outline-none focus-visible:border-lime/50 focus-visible:ring-1 focus-visible:ring-lime/40"
              />
              <button type="submit" className="rounded-lg bg-lime px-3 py-2 text-xs font-semibold text-black">
                전송
              </button>
            </form>
          </div>
        </section>
      )}
    </aside>
  );
}

function presenceStatus(room: RoomState, person: PlayerSnap, myId: string) {
  if (person.id === myId) return "나";
  if (room.phase === "lobby") return person.ready ? "준비" : "대기";
  if (room.phase === "reveal") return "공개됨";
  if (room.phase === "result") return "결과";
  if (room.mode === "normal" && room.caughtIds.includes(person.id)) return "탈락";
  return "플레이 중";
}

function ScoreTab({
  room,
  people,
  myId,
}: {
  room: RoomState;
  people: PlayerSnap[];
  myId: string;
}) {
  const survivors = people.filter((p) => hiderAlive(room, p.id));
  const dead = people.filter((p) => room.caughtIds.includes(p.id));
  const ranked = [...people].sort((a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0));
  const row = (p: PlayerSnap) => (
    <li
      key={p.id}
      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
        p.id === myId ? "bg-lime/15" : "bg-white/5"
      }`}
    >
      <span className="truncate">
        {p.name}
        {p.id === myId ? " (나)" : ""}
        {room.phase !== "lobby" && isHunter(room, p.id) ? " · 술래" : ""}
      </span>
      <span className="ml-2 shrink-0 tabular-nums text-lime">{room.scores[p.id] ?? 0}</span>
    </li>
  );
  return (
    <section
      className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-black/55 p-4"
      aria-label="게임 현황"
      aria-live="polite"
    >
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#121c17]/95 p-5 shadow-2xl">
        <div className="flex items-end justify-between">
          <h2 className="text-wrap-balance font-display text-3xl">현황</h2>
          <p className="text-xs text-white/60">Tab을 떼면 닫힙니다</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <section className="rounded-2xl bg-black/30 p-3">
            <h4 className="text-xs tracking-wide text-white/55">참여자 {ranked.length}</h4>
            <ul className="mt-2 space-y-1">{ranked.map(row)}</ul>
          </section>
          <section className="rounded-2xl bg-black/30 p-3">
            <h4 className="text-xs tracking-wide text-lime/80">생존자 {survivors.length}</h4>
            <ul className="mt-2 space-y-1">
              {survivors.length ? survivors.map(row) : <li className="text-sm text-white/60">없음</li>}
            </ul>
          </section>
          <section className="rounded-2xl bg-black/30 p-3">
            <h4 className="text-xs tracking-wide text-pink/80">죽은자 {dead.length}</h4>
            <ul className="mt-2 space-y-1">
              {dead.length ? dead.map(row) : <li className="text-sm text-white/60">없음</li>}
            </ul>
          </section>
        </div>
        <p className="mt-4 text-center text-xs text-white/65">
          점수 기준 · 처치 +{SCORE_TAG} · 카멜레온 생존 승리 +{SCORE_SURVIVE} · 술래 팀 승리 +{SCORE_HUNT_WIN}
        </p>
      </div>
    </section>
  );
}

function ResultPanel({
  room,
  people,
  host,
  onNext,
}: {
  room: RoomState;
  people: PlayerSnap[];
  host: boolean;
  onNext: () => void;
}) {
  const ranked = [...people].sort((a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0));
  return (
    <AccessibleModal
      titleId="result-title"
      panelClassName="max-h-[90dvh] w-full max-w-md overflow-y-auto overscroll-contain rounded-3xl bg-[#121c17] p-6 text-center shadow-2xl"
    >
        <p className="text-lime">라운드 {room.round}</p>
        <h2 id="result-title" className="text-wrap-balance font-display text-4xl">{room.winner === "hiders" ? "카멜레온 승!" : "술래 승!"}</h2>
        <p className="mt-2 text-xs text-white/65">
          처치 +{SCORE_TAG} · 생존 승리 +{SCORE_SURVIVE} · 술래 승리 +{SCORE_HUNT_WIN}
        </p>
        <ul className="mt-4 space-y-1 text-left">
          {ranked.map((p, i) => (
            <li key={p.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-1">
              <span>
                {i + 1}. {p.name}
              </span>
              <span className="text-lime">{room.scores[p.id] ?? 0}</span>
            </li>
          ))}
        </ul>
        {host && (
          <button type="button" onClick={onNext} className="mt-5 w-full rounded-full bg-lime py-2 font-display text-black">
            다음 라운드
          </button>
        )}
    </AccessibleModal>
  );
}

function RevealPanel({ room, timeLeft }: { room: RoomState; timeLeft: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-black/25 p-4">
      <div className="w-full max-w-md rounded-3xl border border-lime/25 bg-[#121c17]/90 p-6 text-center shadow-2xl backdrop-blur-sm">
        <p className="text-sm tracking-[0.18em] text-lime">마지막 {REVEAL_TIME}초</p>
        <h2 className="text-wrap-balance mt-2 font-display text-4xl">검증 라운드</h2>
        <p className="mt-3 text-sm text-white/75">
          모든 카멜레온의 위치가 공개됩니다.
          <br />
          숨은 장소를 감상하고 다음 라운드를 준비하세요.
        </p>
        <div className="mt-5 font-display text-6xl tabular-nums text-lime">{timeLeft}</div>
        <p className="mt-2 text-xs text-white/60">
          {room.winner === "hiders" ? "카멜레온 팀 승리" : "술래 팀 승리"} · Tab으로 현황 보기
        </p>
      </div>
    </div>
  );
}
