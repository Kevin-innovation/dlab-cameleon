"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  MAX_BLOBS,
  SHOT_COOLDOWN,
  SYNC_HZ,
  TAUNT_COOLDOWN,
  FORCED_TAUNT,
  WHITE,
  SCORE_TAG,
  SCORE_SURVIVE,
  SCORE_HUNT_WIN,
} from "@/lib/config";
import { drawBodyPreview } from "@/lib/engine/character";
import { GameWorld } from "@/lib/engine/world";
import { camouflageMeter, tagRangeForCamouflage } from "@/lib/camouflage";
import { getMap } from "@/lib/maps";
import { joystickInput, MOBILE_PORTRAIT_QUERY, requestMobileLandscape } from "@/lib/mobile";
import { GameInputState } from "@/lib/input";
import {
  beginRound,
  canStartRound,
  claimHost,
  hiderAlive,
  isGhost,
  isHunter,
  isParticipant,
  remaining,
  reconcileRoomPlayers,
  roleOf,
  tickRoom,
  processFire,
} from "@/lib/round";
import { gatherPositions } from "@/lib/gather";
import { hudSignature, snapsFrom, type Session } from "@/lib/session";
import { resetSoloBots, tickSoloBots } from "@/lib/ai";
import type { PaintBlob, PlayerSnap, Pose } from "@/lib/types";
import { POSES } from "@/lib/types";
import { AccessibleModal } from "./AccessibleModal";
import { Lobby } from "./game/Lobby";
import { ResultPanel, RevealPanel } from "./game/ResultPanel";
import { RoulettePanel } from "./game/RoulettePanel";
import { RoomSocialPanel } from "./game/RoomSocialPanel";
import { ScoreTab } from "./game/ScoreTab";
import { useRoomDirectorySync } from "./game/useRoomDirectorySync";

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

function normalizeKey(e: KeyboardEvent) {
  return KEY_BY_CODE[e.code] ?? e.key.toLowerCase();
}

function exitPointerLockSafely() {
  if (typeof document.exitPointerLock !== "function") return;
  try {
    document.exitPointerLock();
  } catch {
    // Pointer lock is unavailable or restricted on some iPhone Safari versions.
  }
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
  const [targetColor, setTargetColor] = useState("");
  const [brush, setBrush] = useState(14);
  const [tool, setTool] = useState<Tool>("dropper");
  const [help, setHelp] = useState(false);
  const [watching, setWatching] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [atDoor, setAtDoor] = useState(false);
  const [tabOpen, setTabOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);
  const [graphicsError, setGraphicsError] = useState("");
  const socialVisible = socialOpen;
  const paintOpenRef = useRef(false);
  const viewActiveRef = useRef(false);
  const watchingRef = useRef(false);
  const mobilePortraitRef = useRef(false);
  const inputRef = useRef(new GameInputState());
  const touchFireRef = useRef(0);
  const helpRef = useRef(false);
  const colorRef = useRef(color);
  const brushRef = useRef(brush);
  const toolRef = useRef(tool);

  const toggleNearbyDoor = useCallback(() => {
    const world = worldRef.current;
    if (!world || paintOpenRef.current || helpRef.current || watchingRef.current) return;
    const id = world.nearDoor();
    if (id) session.callDoor(id);
  }, [session]);

  useEffect(() => {
    paintOpenRef.current = paintOpen;
    if (paintOpen) exitPointerLockSafely();
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
    let world: GameWorld;
    try {
      world = new GameWorld(canvas);
    } catch {
      queueMicrotask(() => setGraphicsError("이 기기에서 3D 그래픽을 시작하지 못했습니다."));
      return;
    }
    worldRef.current = world;
    if (process.env.NODE_ENV !== "production") {
      // Dev-only handle for the perf audit script (draw calls per map).
      (window as unknown as { __camelonWorld?: GameWorld }).__camelonWorld = world;
    }
    const input = inputRef.current;
    const startMap = getMap(session.getRoom().mapId);
    try {
      world.loadMap(startMap.id);
    } catch {
      world.dispose();
      worldRef.current = null;
      queueMicrotask(() => setGraphicsError("이 기기의 그래픽 메모리가 부족해 게임을 시작하지 못했습니다."));
      return;
    }
    const onContextLost = (event: Event) => {
      event.preventDefault();
      setGraphicsError("3D 그래픽 연결이 끊겼습니다. Safari 탭을 닫고 다시 열어 주세요.");
    };
    const onContextRestored = () => setGraphicsError("");
    canvas.addEventListener("webglcontextlost", onContextLost, { passive: false });
    canvas.addEventListener("webglcontextrestored", onContextRestored);
    const spawn0 = startMap.spawns[0];
    world.setLocal(spawn0.x, spawn0.z, 0);
    session.me().set("x", spawn0.x, true);
    session.me().set("z", spawn0.z, true);

    const keys = input.keyboardKeys;
    const mobilePortrait = window.matchMedia(MOBILE_PORTRAIT_QUERY);
    let last = performance.now();
    let lastSync = 0;
    let lastPresence = 0;
    let lastShot = 0;
    let lastTaunt = 0;
    let lastForced = Date.now();
    let seenTouchFire = touchFireRef.current;
    let seenRound = session.getRoom().round;
    let seenPhase = session.getRoom().phase;
    let bakedId = startMap.id;
    const hostTauntSeq = new Map<string, number>();
    let wasHost = false;
    let wasHunterRole = false;

    const typing = (e: Event) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || !!el?.isContentEditable;
    };

    const syncMobileOrientation = () => {
      mobilePortraitRef.current = mobilePortrait.matches;
      if (!mobilePortrait.matches) return;
      exitPointerLockSafely();
      viewActiveRef.current = false;
      input.clearAll();
      world.exitWatch();
      watchingRef.current = false;
      setWatching(false);
    };
    syncMobileOrientation();
    if (typeof mobilePortrait.addEventListener === "function") {
      mobilePortrait.addEventListener("change", syncMobileOrientation);
    } else {
      mobilePortrait.addListener(syncMobileOrientation);
    }
    window.addEventListener("orientationchange", syncMobileOrientation);

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
          e.preventDefault();
          exitPointerLockSafely();
          setPaintOpen(false);
          setHelp(false);
          viewActiveRef.current = false;
          input.clearAll();
          return;
        }
        if (k === "h" || k === "?") setHelp((v) => !v);
        if (k === "r") cyclePose(session, world, 1);
        if (/^[1-7]$/.test(k) && !(k === "5" && session.getRoom().phase === "lobby")) {
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
          else toggleNearbyDoor();
        }
        if (k === "b") setTool("brush");
        if (paintOpenRef.current && (k === " " || k === "space")) {
          e.preventDefault();
          const c = world.sampleWorld(lastMx, lastMy);
          if (c) {
            setColor(c);
            colorRef.current = c;
            setTargetColor(c);
            setTool("brush");
            toolRef.current = "brush";
          }
        }
        if (k === "v" || (k === "5" && session.getRoom().phase === "lobby")) {
          const room = session.getRoom();
          const snap = snapsFrom(session).find((p) => p.id === session.myId());
          // Turning watch off is always allowed; turning it on needs a non-hunter in a watchable phase.
          const canWatch =
            watchingRef.current ||
            (!!snap &&
              (room.phase === "lobby" ||
                ((room.phase === "hide" || room.phase === "hunt") &&
                  (hiderAlive(room, snap.id) || roleOf(room, snap.id) === "spectator"))));
          if (canWatch) {
            const on = world.toggleWatch();
            watchingRef.current = on;
            setWatching(on);
            if (on) {
              setPaintOpen(false);
              input.touchKeys.delete(" ");
              input.touchKeys.delete("space");
              input.touchKeys.delete("shift");
              input.touchKeys.delete("control");
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
      input.clearAll();
    };
    window.addEventListener("blur", onBlur);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onBlur();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onMouseMove = (e: MouseEvent) => {
      if (mobilePortraitRef.current || paintOpenRef.current || helpRef.current) return;
      if (!viewActiveRef.current) return;
      const lockedNow = document.pointerLockElement === canvas;
      if (!lockedNow && e.target !== canvas) return;
      world.lookDelta(e.movementX, e.movementY);
    };
    document.addEventListener("mousemove", onMouseMove);

    const onTouchLookMove = (e: PointerEvent) => {
      if (input.touchLook.pointerId !== e.pointerId) return;
      if (mobilePortraitRef.current || paintOpenRef.current || helpRef.current || watchingRef.current) {
        input.touchLook.pointerId = -1;
        input.touchLook.dx = 0;
        input.touchLook.dy = 0;
        return;
      }
      e.preventDefault();
      input.touchLook.dx += e.clientX - input.touchLook.x;
      input.touchLook.dy += e.clientY - input.touchLook.y;
      input.touchLook.x = e.clientX;
      input.touchLook.y = e.clientY;
    };
    const onTouchLookEnd = (e: PointerEvent) => {
      if (input.touchLook.pointerId !== e.pointerId) return;
      e.preventDefault();
      input.touchLook.pointerId = -1;
      input.touchLook.dx = 0;
      input.touchLook.dy = 0;
    };
    window.addEventListener("pointermove", onTouchLookMove, { passive: false });
    window.addEventListener("pointerup", onTouchLookEnd, { passive: false });
    window.addEventListener("pointercancel", onTouchLookEnd, { passive: false });

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
        input.clearKeyboard();
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
      if (e.pointerType && e.pointerType !== "mouse") return;
      const el = e.target as HTMLElement;
      if (el.closest('[data-touch-control="true"]')) {
        viewActiveRef.current = false;
        return;
      }
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
            setTargetColor(c);
            setTool("brush");
            toolRef.current = "brush";
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
        const ammoLeft = room.ammoEnabled ? (room.ammo?.[me.id] ?? 0) : Infinity;
        if (ammoLeft <= 0) return;
        lastShot = t;
        world.playShot(me.id, true);
        const shootSeq = Number(session.me().get("shootSeq") ?? 0) + 1;
        session.me().set("shootSeq", shootSeq, true);
        const lockedNow = document.pointerLockElement === canvas;
        const aim = lockedNow
          ? world.aimPlayer(me.id)
          : world.aimPlayer(me.id, e.clientX, e.clientY);
        const target = aim ? snapsFrom(session).find((p) => p.id === aim.id) : undefined;
        const hit =
          aim &&
          target &&
          aim.dist <= tagRangeForCamouflage(target.camoScore) + 1.2 &&
          hiderAlive(room, aim.id)
            ? aim.id
            : "";
        session.callShot(hit, undefined, shootSeq);
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
        !targetId || world.hasLineOfSight(hunterId, targetId),
      );
      session.setRoom(result.room);
    });
    const undoor = session.onDoor((id, actorId) => {
      if (!session.isHost()) return;
      const room = session.getRoom();
      if (room.phase === "reveal" || room.phase === "result") return;
      const door = getMap(room.mapId).doors.find((candidate) => candidate.id === id);
      const actor = actorId ? snapsFrom(session).find((player) => player.id === actorId) : undefined;
      if (!door || !actor || roleOf(room, actor.id) === "spectator") return;
      if (!Number.isFinite(actor.x) || !Number.isFinite(actor.z)) return;
      if (Math.hypot(actor.x - door.x, actor.z - door.z) > 3.05) return;
      const doors = { ...(room.doors ?? {}) };
      doors[id] = !doors[id];
      session.setRoom({ ...room, doors });
    });

    const resize = () => {
      syncMobileOrientation();
      world.resize();
    };
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
          const ammoLeft = room.ammoEnabled ? (room.ammo?.[me.id] ?? 0) : Infinity;
          if (shotAt - lastShot >= SHOT_COOLDOWN && ammoLeft > 0) {
            lastShot = shotAt;
            world.playShot(me.id, true);
            const shootSeq = Number(session.me().get("shootSeq") ?? 0) + 1;
            session.me().set("shootSeq", shootSeq, true);
            const aim = world.aimPlayer(me.id);
            const target = aim ? players.find((p) => p.id === aim.id) : undefined;
            const hit =
              aim &&
              target &&
              aim.dist <= tagRangeForCamouflage(target.camoScore) + 1.2 &&
              hiderAlive(room, aim.id)
                ? aim.id
                : "";
            session.callShot(hit, undefined, shootSeq);
          }
        }
      }

      if (room.round !== seenRound) {
        seenRound = room.round;
        seenPhase = room.phase;
        if (me && room.round > 0) {
          const role = roleOf(room, me.id);
          // Everyone meets on the gather ring for the roulette; role spawns come with the hide phase.
          const spot = gatherPositions(map, room.participantIds).get(me.id);
          const idx = Math.max(0, players.findIndex((p) => p.id === me.id));
          const spawn = spot ?? map.spawns[idx % map.spawns.length];
          world.setLocal(spawn.x, spawn.z, spot?.yaw);
          session.me().set("x", spawn.x, true);
          session.me().set("y", 0, true);
          session.me().set("z", spawn.z, true);
          session.me().set("fill", WHITE, true);
          session.me().set("blobs", [], true);
          session.me().set("camoScore", 0, true);
          session.me().set("pose", "stand", true);
          session.me().set("role", role, true);
          session.me().set("alive", role !== "spectator", true);
          session.me().set("ready", false, true);
          setTargetColor("");
          setPaintOpen(false);
          world.exitWatch();
          watchingRef.current = false;
          setWatching(false);
          if (session.kind === "practice") resetSoloBots(session, map, room);
        }
      }
      if (room.phase !== seenPhase) {
        const from = seenPhase;
        seenPhase = room.phase;
        if (from === "prepare" && room.phase === "hide" && me && isParticipant(room, me.id)) {
          // Roulette is over: hiders scatter to their spawns, hunters wait at theirs.
          const role = roleOf(room, me.id);
          const idx = Math.max(0, players.findIndex((p) => p.id === me.id));
          const spawn =
            role === "hunter"
              ? map.hunterSpawns[idx % map.hunterSpawns.length]
              : map.spawns[idx % map.spawns.length];
          world.setLocal(spawn.x, spawn.z, 0);
          session.me().set("x", spawn.x, true);
          session.me().set("y", 0, true);
          session.me().set("z", spawn.z, true);
        }
      }

      if (session.kind === "practice") tickSoloBots(session, map, room, dt, Date.now());
      const frameKeys = mobilePortraitRef.current ? new Set<string>() : new Set(keys);
      if (!mobilePortraitRef.current) {
        for (const key of input.touchKeys) frameKeys.add(key);
      }
      const look = input.touchLook;
      if (!mobilePortraitRef.current && !paintOpenRef.current && !helpRef.current && (look.dx !== 0 || look.dy !== 0)) {
        world.lookDelta(look.dx, look.dy);
        look.dx = 0;
        look.dy = 0;
      }
      world.syncDoors(room.doors ?? {});
      const hunterWait = !!(me && isHunter(room, me.id) && room.phase === "hide");
      const pose = ((session.me().get("pose") as Pose) || "stand") as Pose;
      const ghost = !!me && isGhost(room, me.id);
      // Infection: a caught hider becomes a hunter mid-hunt. Drop every hider-only
      // mode (watch camera, paint panel, wall cling) so aiming and shooting work.
      const hunterNow = !!me && room.phase === "hunt" && isHunter(room, me.id);
      if (hunterNow && !wasHunterRole) {
        if (watchingRef.current) {
          world.exitWatch();
          watchingRef.current = false;
          setWatching(false);
        }
        if (paintOpenRef.current) {
          paintOpenRef.current = false;
          setPaintOpen(false);
        }
        if (world.clinging() || pose === "stick") {
          world.exitCling();
          session.me().set("pose", "stand", true);
        }
        input.clearAll();
      }
      wasHunterRole = hunterNow;
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
        !mobilePortraitRef.current && !hunterWait && room.phase !== "result" && room.phase !== "prepare" && !watchingRef.current,
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
        if (session.kind === "online" && t - lastPresence > 2000) {
          lastPresence = t;
          session.me().set("presenceAt", Date.now(), false);
        }
      } else if (world.localY > 0.02) {
        session.me().set("y", world.localY, false);
      }

      if (session.isHost()) {
        const livePlayers = snapsFrom(session);
        if (!wasHost) {
          // Host acquisition (initial or migration): adopt every player's current
          // sequence so already-played taunts are not replayed by the new host.
          wasHost = true;
          for (const p of session.players()) hostTauntSeq.set(p.id, Number(p.get("tauntSeq") ?? 0));
        }
        const reconciled = reconcileRoomPlayers(room, livePlayers);
        let next = tickRoom(reconciled, livePlayers, Date.now());
        const myName = String(session.me().get("name") ?? "").trim().slice(0, 12);
        next = claimHost(next, session.myId(), myName, Date.now());
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
          JSON.stringify(next.hunterIds) !== JSON.stringify(room.hunterIds) ||
          JSON.stringify(next.caughtIds) !== JSON.stringify(room.caughtIds) ||
          next.taunts.length !== room.taunts.length ||
          next.winner !== room.winner ||
          next.round !== room.round ||
          next.hostId !== room.hostId ||
          next.hostName !== room.hostName ||
          next.lastTag?.at !== room.lastTag?.at ||
          (next.feed?.length ?? 0) !== (room.feed?.length ?? 0) ||
          JSON.stringify(next.ammo) !== JSON.stringify(room.ammo) ||
          closeIds.length
        ) {
          session.setRoom(next);
          if (closeIds.length) world.syncDoors(next.doors ?? {});
        }
      } else {
        wasHost = false;
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

    // HUD refresh: only publish new React state when the UI-relevant part changed,
    // so memoized panels keep their props stable between frames (B8).
    let lastRoomSig = "";
    let lastPeopleSig = "";
    let lastTickBucket = 0;
    const hudIv = window.setInterval(() => {
      const room = session.getRoom();
      const roomSig = JSON.stringify(room);
      if (roomSig !== lastRoomSig) {
        lastRoomSig = roomSig;
        setHud({ ...room });
      }
      const snaps = snapsFrom(session);
      const peopleSig = hudSignature(snaps);
      if (peopleSig !== lastPeopleSig) {
        lastPeopleSig = peopleSig;
        setPeople(snaps);
      }
      const bucket = Math.floor(Date.now() / 500);
      if (bucket !== lastTickBucket) {
        lastTickBucket = bucket;
        setNowTick(bucket * 500);
      }
      setAtDoor(!!worldRef.current?.nearDoor());
    }, 120);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudIv);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("pointermove", onTouchLookMove);
      window.removeEventListener("pointerup", onTouchLookEnd);
      window.removeEventListener("pointercancel", onTouchLookEnd);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerlockchange", onLock);
      canvas.parentElement?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMovePaint);
      window.removeEventListener("pointerup", onPointerUpPaint);
      window.removeEventListener("pointercancel", onPointerUpPaint);
      window.removeEventListener("pointermove", trackMouse);
      canvas.parentElement?.removeEventListener("contextmenu", onContext);
      if (typeof mobilePortrait.removeEventListener === "function") {
        mobilePortrait.removeEventListener("change", syncMobileOrientation);
      } else {
        mobilePortrait.removeListener(syncMobileOrientation);
      }
      window.removeEventListener("orientationchange", syncMobileOrientation);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      ro.disconnect();
      input.clearAll();
      unshot();
      undoor();
      world.dispose();
      viewActiveRef.current = false;
      worldRef.current = null;
    };
  }, [session, toggleNearbyDoor]);

  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const me = people.find((p) => p.id === session.myId());
    drawBodyPreview(ctx, me?.fill ?? WHITE, me?.blobs ?? []);
  }, [people, session, paintOpen]);

  useRoomDirectorySync(session, hud, people.length);

  const me = people.find((p) => p.id === session.myId());
  const myRole = me ? roleOf(hud, me.id) : "spectator";
  const camouflage = camouflageMeter(me?.fill ?? WHITE, me?.blobs ?? [], targetColor);
  useEffect(() => {
    const score = camouflage.score ?? 0;
    if (Number(session.me().get("camoScore") ?? 0) !== score) {
      session.me().set("camoScore", score, false);
    }
  }, [camouflage.score, session]);
  const hunterHide = myRole === "hunter" && hud.phase === "hide";
  const timeLeft = remaining(hud, nowTick);
  const phaseAnnouncement =
    hud.phase === "lobby"
      ? "대기실"
      : hud.phase === "prepare"
        ? "역할 확인"
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
    const room = session.getRoom();
    if (!force && !canStartRound(room, players)) return;
    if (force && !["lobby", "result"].includes(room.phase)) return;
    if (players.length < 2) return;
    session.setRoom(beginRound(room, players.map((p) => p.id), Date.now()));
    setTargetColor("");
  };

  const toggleWatching = () => {
    const world = worldRef.current;
    if (!world) return;
    const room = session.getRoom();
    const snap = snapsFrom(session).find((p) => p.id === session.myId());
    const canWatch =
      watchingRef.current ||
      (!!snap &&
        (room.phase === "lobby" ||
          ((room.phase === "hide" || room.phase === "hunt") &&
            (hiderAlive(room, snap.id) || roleOf(room, snap.id) === "spectator"))));
    if (!canWatch) return;
    const on = world.toggleWatch();
    watchingRef.current = on;
    setWatching(on);
    if (on) {
      setPaintOpen(false);
      clearTouchJoystick();
      inputRef.current.touchKeys.delete(" ");
      inputRef.current.touchKeys.delete("space");
      inputRef.current.touchKeys.delete("shift");
      inputRef.current.touchKeys.delete("control");
    }
  };

  const touchPress = (key: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional on older mobile browsers.
    }
    inputRef.current.touchKeys.add(key);
  };

  const touchRelease = (key: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    inputRef.current.touchKeys.delete(key);
  };

  const touchKeyboardPress = (key: string, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    inputRef.current.touchKeys.add(key);
  };

  const touchKeyboardRelease = (key: string, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    inputRef.current.touchKeys.delete(key);
  };

  const setTouchJoystickKeys = (keys: string[]) => {
    inputRef.current.setJoystick(keys);
  };

  const clearTouchJoystick = () => {
    inputRef.current.clearJoystick();
  };

  const triggerTouchFire = () => {
    touchFireRef.current += 1;
  };

  const touchLookStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (mobilePortraitRef.current || paintOpenRef.current || helpRef.current || watchingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional on older mobile browsers; window listeners keep the drag alive.
    }
    Object.assign(inputRef.current.touchLook, {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      dx: 0,
      dy: 0,
    });
  };

  const touchLookMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const look = inputRef.current.touchLook;
    if (look.pointerId !== event.pointerId) return;
    if (mobilePortraitRef.current || paintOpenRef.current || helpRef.current || watchingRef.current) {
      look.pointerId = -1;
      look.dx = 0;
      look.dy = 0;
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    look.dx += event.clientX - look.x;
    look.dy += event.clientY - look.y;
    look.x = event.clientX;
    look.y = event.clientY;
  };

  const touchLookEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (inputRef.current.touchLook.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    inputRef.current.touchLook.pointerId = -1;
    inputRef.current.touchLook.dx = 0;
    inputRef.current.touchLook.dy = 0;
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
    inputRef.current.touchLook.dx += delta[0];
    inputRef.current.touchLook.dy += delta[1];
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
        게임 화면에 포커스를 둔 뒤 WASD로 이동하고 마우스로 시점을 조작합니다. 화면의 자세 버튼과 페인트 도구를 사용하고, Tab으로 현황을 확인하고 Escape로 열린 패널을 닫습니다.
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

        {graphicsError && (
          <div className="pointer-events-auto absolute inset-0 z-[90] flex items-center justify-center bg-[#0b100d]/95 px-6 text-center" role="alert">
            <div className="max-w-sm">
              <div className="text-4xl" aria-hidden="true">⚠</div>
              <h2 className="mt-3 font-display text-2xl text-lime">게임 그래픽을 준비하지 못했어요</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/75">{graphicsError}</p>
            </div>
          </div>
        )}

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
                <span className="font-display text-[11px] tracking-wide text-pink">발견</span>
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
              {hud.phase === "prepare" && "역할 확인 · 곧 위장 시작"}
              {hud.phase === "hide" && "위장 시간"}
              {hud.phase === "hunt" && "수색 중"}
              {hud.phase === "reveal" && "검증 라운드"}
              {hud.phase === "result" && (hud.winner === "hiders" ? "카멜레온 승리" : "술래 승리")}
            </div>
          </div>
          {(hud.phase === "prepare" || hud.phase === "hide" || hud.phase === "hunt" || hud.phase === "reveal") && (
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
            <div
              className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center"
              aria-hidden="true"
            >
              <div className="relative h-10 w-10 rounded-full border-2 border-lime shadow-[0_0_10px_rgba(198,255,74,0.8)]">
                <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime shadow-[0_0_6px_rgba(198,255,74,1)]" />
                <div className="absolute -left-1.5 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-lime" />
                <div className="absolute -right-1.5 top-1/2 h-0.5 w-2 -translate-y-1/2 bg-lime" />
                <div className="absolute left-1/2 -top-1.5 h-2 w-0.5 -translate-x-1/2 bg-lime" />
                <div className="absolute left-1/2 -bottom-1.5 h-2 w-0.5 -translate-x-1/2 bg-lime" />
              </div>
            </div>
            {hud.ammoEnabled && (
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
            )}
          </>
        )}

        {hud.phase === "prepare" && <RoulettePanel room={hud} people={people} myId={session.myId()} />}

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
            <div className="text-[11px] font-semibold tracking-[0.2em]">발견</div>
            <div className="font-display text-2xl leading-none">
              {hud.lastTag.byName} → {hud.lastTag.name}
            </div>
          </div>
        )}

        {atDoor && !paintOpen && (
          <div className="pointer-events-none absolute left-1/2 bottom-28 z-30 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-sm">
            <span className="font-display text-lime">E / 문 버튼</span> 문 열기/닫기
          </div>
        )}

        {me?.pose === "stick" && (
          <div className="pointer-events-none absolute left-1/2 top-28 z-30 -translate-x-1/2 rounded-2xl bg-black/70 px-5 py-3 text-center">
            <div className="font-display text-xl text-lime">벽에 붙음</div>
            <p className="text-sm text-white/75">A/D 좌우 · W/S 오르내리기 · C 또는 Space 떼기</p>
          </div>
        )}

        {watching && (myRole === "hider" || myRole === "spectator" || hud.phase === "lobby") && (
          <div className="pointer-events-none absolute left-1/2 top-44 z-30 -translate-x-1/2 rounded-2xl bg-black/70 px-5 py-3 text-center">
            <div className="font-display text-xl text-lime">{hud.phase === "lobby" ? "대기실 관전" : "숨은 채 관전"}</div>
            <p className="text-sm text-white/75">
              {hud.phase === "lobby"
                ? "WASD·Q/E로 맵 둘러보기 · V 복귀"
                : "몸은 그대로 있습니다. WASD·Q/E로 카메라 이동 · V 복귀"}
            </p>
          </div>
        )}

        {me && hud.phase !== "lobby" && !isParticipant(hud, me.id) && (
          <div
            className="pointer-events-none absolute left-1/2 top-36 z-30 -translate-x-1/2 rounded-2xl border border-cyan-200/40 bg-[#123038]/85 px-5 py-3 text-center backdrop-blur-sm"
            role="status"
            aria-live="polite"
          >
            <div className="font-display text-2xl text-cyan-100">관전 중</div>
            <p className="text-sm text-cyan-50/80">
              라운드가 진행 중입니다. 다음 라운드부터 참가해요.
              {hud.phase === "hunt" || hud.phase === "hide" || hud.phase === "prepare" ? ` 이번 단계 종료까지 ${timeLeft}초.` : ""}
            </p>
            <p className="mt-1 text-[11px] text-cyan-50/60">벽을 지나 맵을 둘러볼 수 있어요.</p>
          </div>
        )}

        {me && myRole === "spectator" && hud.phase === "hunt" && isParticipant(hud, me.id) && (
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
                <div className="mt-1 text-pink">좌클릭 발견 · {hud.ammoEnabled ? "탄 1발 소모 · " : "탄약 제한 없음 · "}Tab 현황</div>
              </>
            ) : (
              <>
                <div>WASD 걷기 · Shift 달리기 · Space 점프/벽오르기 · Ctrl 내려가기</div>
                <div>화면 버튼으로 자세·페인트 · T 도발 · V 관전 · E 문 · Tab 현황</div>
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
            <div className="pose-action-row flex flex-wrap justify-end gap-1.5 pt-2" role="group" aria-label="자세 선택">
              {POSES.map((p, index) => (
                <button
                  key={p.id}
                  type="button"
                  aria-keyshortcuts={String(index + 1)}
                  aria-label={p.label}
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

        {!hunterHide && hud.phase !== "result" && hud.phase !== "reveal" && !paintOpen && (
          <TouchControls
            canWatch={myRole === "hider" || myRole === "spectator" || hud.phase === "lobby"}
            canFire={myRole === "hunter" && hud.phase === "hunt"}
            canOpenDoor={atDoor && !watching}
            canPaint={myRole !== "hunter"}
            watching={watching}
            paintOpen={paintOpen}
            onTogglePaint={() => setPaintOpen((v) => !v)}
            onToggleWatch={toggleWatching}
            onOpenDoor={toggleNearbyDoor}
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
            className="absolute bottom-24 right-3 z-20 max-h-[calc(100dvh-6rem)] w-[230px] overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-[#121a16]/95 p-3 shadow-xl"
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
            <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">위장도</span>
                <span className={camouflage.score !== null && camouflage.score >= 68 ? "text-lime" : "text-pink"}>
                  {camouflage.score === null ? "—" : `${camouflage.score}%`}
                </span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-black/45"
                role="progressbar"
                aria-label="위장도"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={camouflage.score ?? 0}
                aria-valuetext={camouflage.score === null ? "측정 전" : `${camouflage.score}%`}
              >
                <div
                  className={`h-full rounded-full transition-[width] ${camouflage.score !== null && camouflage.score >= 68 ? "bg-lime" : "bg-pink"}`}
                  style={{ width: `${camouflage.score ?? 0}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] font-semibold text-white/85">{camouflage.label}</div>
              <div className="mt-1 text-[10px] leading-snug text-white/60">{camouflage.detail}</div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-white/60">
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-white/25"
                  style={{ backgroundColor: targetColor || "#2a332d" }}
                  aria-hidden="true"
                />
                <span>{targetColor ? `찍은 표면 ${targetColor}` : "찍은 표면 없음"}</span>
              </div>
              {targetColor && (
                <button
                  type="button"
                  className="mt-2 w-full rounded-lg bg-lime/90 py-1.5 text-[11px] font-semibold text-black"
                  onClick={() => {
                    setColor(targetColor);
                    colorRef.current = targetColor;
                    session.me().set("fill", targetColor, true);
                    session.me().set("blobs", [], true);
                  }}
                >
                  추천 색으로 몸 전체 칠하기
                </button>
              )}
            </div>
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
              스포이드로 표면을 클릭하면 추천 색으로 저장되고 붓 도구로 자동 전환됩니다. 몸을 클릭한 채 드래그하면 선이 그어집니다.
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

      <RoomSocialPanel
        session={session}
        room={hud}
        people={people}
        nowTick={nowTick}
        open={socialVisible}
        onToggle={() => setSocialOpen((value) => !value)}
      />

      {help && (
        <AccessibleModal titleId="game-help-title" onClose={() => setHelp(false)} panelClassName="max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl bg-[#17241c] p-6 shadow-2xl">
          <h2 id="game-help-title" className="text-wrap-balance font-display text-2xl">3D 카멜론</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-white/80">
            <li>위치 → 자세 → 스포이드 → 페인트 순서가 정석입니다. 색만 맞추면 윤곽으로 들킵니다.</li>
            <li>WASD 걷기, Shift 달리기, Space 점프. 벽에 붙으면 Space로 오르고 Ctrl로 내려가고 Shift로 뗍니다.</li>
            <li>화면의 자세 버튼으로 몸의 형태를 고르고, F로 페인트를 엽니다. Space로 벽 색을 빨아 칠하고, T로 휘파람, V로 관전, E로 문을 엽니다. 열고 지나가면 닫힙니다.</li>
            <li>위장도가 높으면 술래 화면에서 멀리 있을 때 희미하게 보이고, 가까이 접근할수록 선명해집니다. 움직이면 더 쉽게 드러납니다.</li>
            <li>술래는 1인칭으로 맵을 수색합니다. 우클릭으로 3인칭을 전환하고, 가까이 조준해 맞히면 상대를 발견합니다. 탄약 제한은 방 옵션입니다.</li>
            <li>기본 숨바꼭질에서는 발견된 Hider가 관전 상태가 됩니다. 감염은 별도 커스텀 모드입니다.</li>
            <li>Tab을 누르면 참여자·생존자·탈락자와 점수가 나옵니다. 발견 +{SCORE_TAG}, 생존 승리 +{SCORE_SURVIVE}, 술래 승리 +{SCORE_HUNT_WIN}.</li>
            <li>우측 접속자 패널에서 현재 참여자와 방 채팅을 대기실·라운드 중 모두 확인할 수 있습니다.</li>
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
  canOpenDoor,
  canPaint,
  watching,
  paintOpen,
  onTogglePaint,
  onToggleWatch,
  onOpenDoor,
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
  canOpenDoor: boolean;
  canPaint: boolean;
  watching: boolean;
  paintOpen: boolean;
  onTogglePaint: () => void;
  onToggleWatch: () => void;
  onOpenDoor: () => void;
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
  const joystickRef = useRef<HTMLDivElement>(null);
  const joystickPointerRef = useRef(-1);
  const onJoystickChangeRef = useRef(onJoystickChange);
  const onJoystickEndRef = useRef(onJoystickEnd);

  onJoystickChangeRef.current = onJoystickChange;
  onJoystickEndRef.current = onJoystickEnd;

  const updateJoystickAt = (clientX: number, clientY: number) => {
    const rect = joystickRef.current?.getBoundingClientRect();
    if (!rect) return;
    const max = Math.max(1, Math.min(rect.width, rect.height) / 2 - 25);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const input = joystickInput(clientX - centerX, clientY - centerY, max);
    if (joystickKnobRef.current) {
      joystickKnobRef.current.style.transform = `translate(calc(-50% + ${input.x}px), calc(-50% + ${input.y}px))`;
    }
    onJoystickChangeRef.current(input.keys);
  };

  const resetJoystick = () => {
    joystickPointerRef.current = -1;
    if (joystickKnobRef.current) joystickKnobRef.current.style.transform = "translate(-50%, -50%)";
    onJoystickEndRef.current();
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (joystickPointerRef.current !== event.pointerId) return;
      event.preventDefault();
      updateJoystickAt(event.clientX, event.clientY);
    };
    const end = (event: PointerEvent) => {
      if (joystickPointerRef.current !== event.pointerId) return;
      event.preventDefault();
      resetJoystick();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end, { passive: false });
    window.addEventListener("pointercancel", end, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const joystickStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is optional on older mobile browsers; window listeners keep the drag alive.
    }
    joystickPointerRef.current = event.pointerId;
    updateJoystickAt(event.clientX, event.clientY);
  };

  const joystickMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (joystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateJoystickAt(event.clientX, event.clientY);
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
      data-touch-control="true"
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
        ref={joystickRef}
        className="mobile-joystick pointer-events-auto absolute bottom-3 left-3 h-32 w-32 touch-none rounded-full border border-white/20 bg-black/35 shadow-lg backdrop-blur-sm"
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
        className="mobile-look-pad pointer-events-auto absolute bottom-3 right-3 flex h-32 w-44 touch-none items-center justify-center rounded-2xl border border-white/15 bg-black/25 text-xs text-white/60 backdrop-blur-sm"
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
        {canOpenDoor && (
          <button
            type="button"
            data-touch-control="true"
            aria-label="근처 문 열기 또는 닫기"
            className="mobile-touch-button min-h-11 rounded-xl border border-lime/40 bg-black/65 px-3 py-2 text-xs font-semibold text-lime shadow-lg backdrop-blur-sm"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onOpenDoor();
            }}
          >
            문 열기/닫기
          </button>
        )}
        {canFire && (
          <button
            type="button"
            data-touch-control="true"
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
            data-touch-control="true"
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
            data-touch-control="true"
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
