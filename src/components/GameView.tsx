"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_BLOBS, SHOT_COOLDOWN, SYNC_HZ, TAUNT_COOLDOWN, FORCED_TAUNT, TAG_RANGE, WHITE } from "@/lib/config";
import { drawBodyPreview } from "@/lib/engine/character";
import { GameWorld } from "@/lib/engine/world";
import { getMap, MAPS } from "@/lib/maps";
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
import type { PaintBlob, PlayerSnap, Pose, RoomState } from "@/lib/types";
import { POSES } from "@/lib/types";

type Tool = "brush" | "dropper" | "fill";

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
  const paintOpenRef = useRef(false);
  const watchingRef = useRef(false);
  const helpRef = useRef(false);
  const colorRef = useRef(color);
  const brushRef = useRef(brush);
  const toolRef = useRef(tool);

  useEffect(() => {
    paintOpenRef.current = paintOpen;
    if (paintOpen) document.exitPointerLock();
    else canvasRef.current?.requestPointerLock();
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
    const startMap = getMap(session.getRoom().mapId);
    world.loadMap(startMap.id);
    const spawn0 = startMap.spawns[0];
    world.setLocal(spawn0.x, spawn0.z, 0);
    session.me().set("x", spawn0.x, true);
    session.me().set("z", spawn0.z, true);

    const keys = new Set<string>();
    let last = performance.now();
    let lastSync = 0;
    let lastShot = 0;
    let lastTaunt = 0;
    let lastForced = Date.now();
    let seenRound = session.getRoom().round;
    let bakedId = startMap.id;
    const hostTauntSeq = new Map<string, number>();

    const typing = (e: Event) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA";
    };

    const tryLock = () => {
      if (paintOpenRef.current || helpRef.current) return;
      if (document.pointerLockElement === canvas) return;
      try {
        canvas.requestPointerLock();
      } catch {
        /* ignore */
      }
    };

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if (down) {
        if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) {
          e.preventDefault();
          tryLock();
        }
        if (k === "f") setPaintOpen((v) => !v);
        if (k === "escape") setPaintOpen(false);
        if (k === "h" || k === "?") setHelp((v) => !v);
        if (k === "r") cyclePose(session, 1);
        if (k >= "1" && k <= "6") {
          const pose = POSES[Number(k) - 1]?.id;
          if (pose) session.me().set("pose", pose, true);
        }
        if (k === "t") tryTaunt();
        if (k === "e") setTool("dropper");
        if (k === "b") setTool("brush");
        if (k === "v") {
          const room = session.getRoom();
          const snap = snapsFrom(session).find((p) => p.id === session.myId());
          const hiding =
            !!snap &&
            (room.phase === "hide" || room.phase === "hunt") &&
            hiderAlive(room, snap.id);
          if (hiding) {
            const on = world.toggleWatch();
            watchingRef.current = on;
            setWatching(on);
            if (on) setPaintOpen(false);
          }
        }
      }
      if (down) keys.add(k);
      else keys.delete(k);
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const onMouseMove = (e: MouseEvent) => {
      if (paintOpenRef.current || helpRef.current) return;
      const lockedNow = document.pointerLockElement === canvas;
      if (lockedNow) {
        world.lookDelta(e.movementX, e.movementY);
        return;
      }
      const stage = canvas.parentElement;
      const overGame =
        e.target === canvas ||
        (stage !== null && stage.contains(e.target as Node) && (e.target as HTMLElement).closest("button, input, select, aside") === null);
      if (overGame) {
        world.lookDelta(e.movementX, e.movementY);
      }
    };
    document.addEventListener("mousemove", onMouseMove);

    const onLock = () => setLocked(document.pointerLockElement === canvas);
    document.addEventListener("pointerlockchange", onLock);

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

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const el = e.target as HTMLElement;
      if (el.closest("button, input, select, textarea, aside, label")) return;
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
        const blob = world.paintSelf(e.clientX, e.clientY, colorRef.current, brushRef.current, me.id);
        if (blob) {
          const prev = ((session.me().get("blobs") as PaintBlob[]) || []).concat(blob);
          session.me().set("blobs", prev.slice(-MAX_BLOBS), true);
        }
        return;
      }

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
    const stage = canvas.parentElement;
    stage?.addEventListener("pointerdown", onPointerDown);

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
        }
      }

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
      if (watchingRef.current) world.stepSpectate(dt, keys);
      const localMoving =
        !watchingRef.current &&
        (keys.has("w") ||
          keys.has("a") ||
          keys.has("s") ||
          keys.has("d") ||
          keys.has("arrowup") ||
          keys.has("arrowdown") ||
          keys.has("arrowleft") ||
          keys.has("arrowright"));
      const moved = world.stepLocal(
        dt,
        { keys, paintOpen: paintOpenRef.current, tool: toolRef.current, color: colorRef.current, brush: brushRef.current },
        !hunterWait && room.phase !== "result" && !watchingRef.current,
        pose,
        ghost,
      );
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
        session.me().set("z", moved.z, false);
        session.me().set("yaw", world.yaw, false);
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
        if (
          next.phase !== room.phase ||
          next.phaseEndsAt !== room.phaseEndsAt ||
          next.caughtIds.length !== room.caughtIds.length ||
          next.taunts.length !== room.taunts.length ||
          next.winner !== room.winner ||
          next.round !== room.round ||
          next.lastTag?.at !== room.lastTag?.at ||
          JSON.stringify(next.ammo) !== JSON.stringify(room.ammo)
        ) {
          session.setRoom(next);
        }
      }

      const live = snapsFrom(session);
      world.syncPlayers(live, session.myId(), room, { localMoving, dt });
      world.updateCamera({
        paintOpen: paintOpenRef.current,
        hunterHide: hunterWait,
      });
      world.render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const hudIv = window.setInterval(() => {
      setHud({ ...session.getRoom() });
      setPeople(snapsFrom(session));
      setNowTick(Date.now());
    }, 120);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(hudIv);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerlockchange", onLock);
      canvas.parentElement?.removeEventListener("pointerdown", onPointerDown);
      ro.disconnect();
      unshot();
      world.dispose();
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

  const startRound = (force = false) => {
    if (!session.isHost()) return;
    const players = snapsFrom(session);
    if (players.length < 1) return;
    if (!force && players.some((p) => !p.ready)) return;
    session.setRoom(beginRound(session.getRoom(), players.map((p) => p.id), Date.now()));
  };

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-[#0b100d] text-paper">
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

      <div className="relative min-w-0 flex-1">
        <canvas
          ref={canvasRef}
          className={`absolute inset-0 h-full w-full touch-none ${paintOpen ? "cursor-crosshair" : locked ? "cursor-none" : "cursor-default"}`}
        />

        <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-3">
          <div className="rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-sm">
            <div className="text-[11px] tracking-wide text-lime/80">
              {serverName} · {roomLabel}
              {session.kind === "practice" ? " · 연습" : ""} · Three.js
            </div>
            <div className="font-display text-lg leading-none">
              {hud.phase === "lobby" && "대기실 — WASD로 걸어보세요"}
              {hud.phase === "hide" && "위장 시간"}
              {hud.phase === "hunt" && "수색 중"}
              {hud.phase === "result" && (hud.winner === "hiders" ? "카멜레온 승리" : "술래 승리")}
            </div>
          </div>
          {(hud.phase === "hide" || hud.phase === "hunt") && (
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

        {!locked && !paintOpen && !hunterHide && hud.phase !== "result" && (
          <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/55 px-4 py-2 text-sm">
            게임 화면에서 마우스 이동 = 시점 · 좌클릭 = 조준 태그
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
              <div className="text-[11px] tracking-wide text-white/55">탄약</div>
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
            <h2 className="mt-2 font-display text-5xl">위장 중...</h2>
            <p className="mt-3 text-white/70">카멜레온들이 3D 맵에서 몸을 칠하고 있습니다</p>
            <div className="mt-8 font-display text-7xl text-lime">{timeLeft}</div>
          </div>
        )}

        {hud.lastTag && nowTick - hud.lastTag.at < 1800 && hud.phase === "hunt" && (
          <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-full bg-pink px-4 py-1 font-display text-black">
            {hud.lastTag.name} 발견!
          </div>
        )}

        {watching && myRole === "hider" && (
          <div className="pointer-events-none absolute left-1/2 top-28 z-30 -translate-x-1/2 rounded-2xl bg-black/70 px-5 py-3 text-center">
            <div className="font-display text-xl text-lime">숨은 채 관전</div>
            <p className="text-sm text-white/75">몸은 그대로 있습니다. WASD·Q/E로 카메라 이동 · V 복귀</p>
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

        {!hunterHide && hud.phase !== "result" && (
          <div className="absolute bottom-3 left-3 z-10 max-w-[240px] rounded-2xl bg-black/40 p-3 text-[12px] leading-relaxed text-white/80 backdrop-blur-sm">
            <div>마우스 이동 = 시점 · WASD 이동</div>
            <div>Shift 살금 · F 페인트 · R 자세 · V 숨은 채 관전</div>
            {myRole === "hunter" && hud.phase === "hunt" && (
              <div className="mt-1 text-pink">좌클릭 발사 · 맞히면 태그 · 탄 떨어지면 카멜레온 승</div>
            )}
          </div>
        )}

        <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
          <button type="button" className="rounded-full bg-black/50 px-3 py-1 text-sm" onClick={() => setHelp(true)}>
            도움말
          </button>
          {myRole !== "hunter" && hud.phase !== "result" && (
            <button
              type="button"
              className={`rounded-full px-4 py-2 font-display ${paintOpen ? "bg-lime text-black" : "bg-black/50"}`}
              onClick={() => setPaintOpen((v) => !v)}
            >
              {paintOpen ? "페인트 ON" : "페인트"}
            </button>
          )}
          <div className="flex flex-wrap justify-end gap-1">
            {POSES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => session.me().set("pose", p.id, true)}
                className={`rounded-lg px-2 py-1 text-[11px] ${me?.pose === p.id ? "bg-lime text-black" : "bg-black/45"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {paintOpen && myRole !== "hunter" && hud.phase !== "result" && (
          <aside className="absolute bottom-24 right-3 z-20 w-[230px] rounded-2xl border border-white/10 bg-[#121a16]/95 p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-display">위장 팔레트</span>
              <button type="button" onClick={() => setPaintOpen(false)}>
                닫기
              </button>
            </div>
            <canvas ref={previewRef} width={200} height={200} className="w-full rounded-xl bg-[#0b100d]" />
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
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-full cursor-pointer bg-transparent"
              />
            </label>
            <label className="mt-1 flex items-center gap-2 text-xs">
              붓
              <input
                type="range"
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
            <p className="mt-2 text-[11px] leading-snug text-white/55">
              스포이드로 벽을 찍고, 붓으로 머리·몸·팔·다리를 따로 클릭해 칠하세요.
            </p>
          </aside>
        )}
      </div>

      {help && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={() => setHelp(false)}>
          <div className="max-w-lg rounded-3xl bg-[#17241c] p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl">3D 카멜론</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-white/80">
              <li>마우스를 움직이면 시점이 돌아가고, WASD로 그 방향으로 걷습니다. 좌클릭은 시점이 아니라 태그입니다.</li>
              <li>숨은 뒤 V를 누르면 몸은 고정되고 카메라만 날리며 관전할 수 있습니다. 다시 V로 돌아옵니다.</li>
              <li>위장 시간에 자리를 고르고 F로 페인트를 연 뒤, 스포이드로 벽 색을 찍고 팔·몸·머리를 따로 칠합니다.</li>
              <li>자세를 바꿔 소파·책장·파이프 실루엣에 맞추세요.</li>
              <li>술래는 조준점을 맞추고 클릭해서 태그합니다.</li>
            </ol>
            <button
              type="button"
              className="mt-5 w-full rounded-full bg-lime py-2 font-display text-black"
              onClick={() => setHelp(false)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function cyclePose(session: Session, dir: number) {
  const cur = (session.me().get("pose") as Pose) || "stand";
  const i = POSES.findIndex((p) => p.id === cur);
  const next = POSES[(i + dir + POSES.length) % POSES.length];
  session.me().set("pose", next.id, true);
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
    <aside className="z-20 flex h-full w-[min(100%,360px)] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#121c17] p-4">
      <p className="text-xs text-lime">
        {serverName} · {roomLabel}
      </p>
      <h2 className="font-display text-3xl">방 대기실</h2>
      <p className="mt-1 text-sm text-white/65">오른쪽 맵에서 WASD로 걸어보세요. 전원 준비 완료 후에만 호스트가 시작할 수 있습니다.</p>
      <ul className="mt-4 space-y-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
            <span>
              {p.name}
              {p.id === session.myId() ? " (나)" : ""}
              {host && p.id === session.myId() ? " · 호스트" : ""}
            </span>
            <span className={p.ready ? "text-lime" : "text-white/40"}>{p.ready ? "준비" : "대기"}</span>
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
        <label className="text-xs text-white/60">맵</label>
        <div className="mt-1 grid grid-cols-1 gap-2">
          {MAPS.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={!host}
              onClick={() => session.setRoom({ ...room, mapId: m.id })}
              className={`rounded-xl px-3 py-2 text-left ${room.mapId === m.id ? "bg-lime text-black" : "bg-white/8"}`}
            >
              <div className="font-display">
                {m.name} · {m.difficulty}
              </div>
              <div className={`text-xs ${room.mapId === m.id ? "text-black/70" : "text-white/55"}`}>{m.blurb}</div>
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <label className="rounded-xl bg-white/8 p-2">
            모드
            <select
              className="mt-1 w-full bg-transparent"
              disabled={!host}
              value={room.mode}
              onChange={(e) => session.setRoom({ ...room, mode: e.target.value as RoomState["mode"] })}
            >
              <option value="normal">노말</option>
              <option value="infection">감염</option>
            </select>
          </label>
          <label className="rounded-xl bg-white/8 p-2">
            술래 수
            <input
              type="number"
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
              disabled={!allReady}
              className="mt-4 w-full rounded-full bg-lime py-3 font-display text-lg text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {people.length < 2 ? "연습 라운드 시작" : "라운드 시작"}
            </button>
            <p className="mt-2 text-center text-xs text-white/55">
              {allReady ? "전원 준비됨" : `준비 ${readyCount}/${people.length} — 모두 준비해야 시작됩니다`}
            </p>
          </>
        ) : (
          <p className="mt-4 text-center text-sm text-white/60">
            호스트 시작 대기 · 준비 {readyCount}/{people.length}
          </p>
        )}
      </div>
    </aside>
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
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#121c17] p-6 text-center">
        <p className="text-lime">라운드 {room.round}</p>
        <h2 className="font-display text-4xl">{room.winner === "hiders" ? "카멜레온 승!" : "술래 승!"}</h2>
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
      </div>
    </div>
  );
}
