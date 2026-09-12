"use client";

import { useEffect, useRef, useState } from "react";
import { addBlob, drawCharacter, drawPreview, poseSize } from "@/lib/character";
import {
  FORCED_TAUNT,
  MAX_BLOBS,
  PAINT_SPEED,
  PLAYER_SPEED,
  SHOT_COOLDOWN,
  SNEAK_SPEED,
  SYNC_HZ,
  TAUNT_COOLDOWN,
  TAG_RANGE,
  WHITE,
} from "@/lib/config";
import { bakeMap, blocked, collideRects, getMap, MAPS, sampleMap } from "@/lib/maps";
import {
  beginRound,
  hiderAlive,
  isHunter,
  remaining,
  roleOf,
  tickRoom,
  processShot,
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
  const [hud, setHud] = useState(() => session.getRoom());
  const [people, setPeople] = useState<PlayerSnap[]>([]);
  const [paintOpen, setPaintOpen] = useState(false);
  const [color, setColor] = useState("#6b8f71");
  const [brush, setBrush] = useState(10);
  const [tool, setTool] = useState<Tool>("dropper");
  const [help, setHelp] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const paintOpenRef = useRef(false);
  const colorRef = useRef(color);
  const brushRef = useRef(brush);
  const toolRef = useRef(tool);

  useEffect(() => {
    paintOpenRef.current = paintOpen;
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const keys = new Set<string>();
    const stick = { on: false, dx: 0, dy: 0 };
    let baked = bakeMap(getMap(session.getRoom().mapId));
    let bakedId = session.getRoom().mapId;
    let camX = 0;
    let camY = 0;
    let last = performance.now();
    let lastSync = 0;
    let lastShot = 0;
    let lastTaunt = 0;
    let lastForced = Date.now();
    let seenRound = session.getRoom().round;
    const shots: { x: number; y: number; at: number; hit: boolean }[] = [];
    const hostTauntSeq = new Map<string, number>();

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const onKey = (e: KeyboardEvent, down: boolean) => {
      const k = e.key.toLowerCase();
      if (down) {
        if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k))
          e.preventDefault();
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
      }
      if (down) keys.add(k);
      else keys.delete(k);
      if (e.code === "Space") {
        if (down) keys.add("space");
        else keys.delete("space");
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const worldFromEvent = (e: { clientX: number; clientY: number }) => {
      const zoom = currentZoom();
      return {
        x: camX + e.clientX / zoom,
        y: camY + e.clientY / zoom,
      };
    };

    function currentZoom() {
      return Math.max(0.85, Math.min(1.35, window.innerWidth / 1400));
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
      session.me().set("tauntX", me.x, true);
      session.me().set("tauntY", me.y, true);
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const room = session.getRoom();
      const meSnap = snapsFrom(session).find((p) => p.id === session.myId());
      if (!meSnap) return;

      if (e.pointerType !== "mouse" && e.clientX < window.innerWidth * 0.42 && !paintOpenRef.current) {
        stick.on = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        const origin = { x: e.clientX, y: e.clientY };
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - origin.x;
          const dy = ev.clientY - origin.y;
          const m = Math.hypot(dx, dy) || 1;
          stick.dx = dx / m;
          stick.dy = dy / m;
        };
        const up = () => {
          stick.on = false;
          stick.dx = 0;
          stick.dy = 0;
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        return;
      }

      const w = worldFromEvent(e);
      if (paintOpenRef.current && (toolRef.current === "dropper" || keys.has("space"))) {
        const c = sampleMap(baked, w.x, w.y);
        setColor(c);
        colorRef.current = c;
        return;
      }

      if (room.phase === "hunt" && isHunter(room, meSnap.id)) {
        const t = Date.now();
        if (t - lastShot < SHOT_COOLDOWN) return;
        lastShot = t;
        const dist = Math.hypot(w.x - meSnap.x, w.y - meSnap.y);
        shots.push({ x: w.x, y: w.y, at: t, hit: dist <= TAG_RANGE + 8 });
        session.callShot(w.x, w.y);
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);

    const unshot = session.onShot((hunterId, x, y) => {
      if (!session.isHost()) return;
      const room = session.getRoom();
      const players = snapsFrom(session);
      const result = processShot(room, players, hunterId, x, y, Date.now());
      if (result.room !== room) session.setRoom(result.room);
    });

    let raf = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const room = session.getRoom();
      if (room.mapId !== bakedId) {
        baked = bakeMap(getMap(room.mapId));
        bakedId = room.mapId;
      }
      const map = getMap(room.mapId);
      const walls = collideRects(map);
      const players = snapsFrom(session);
      const me = players.find((p) => p.id === session.myId());

      if (room.round !== seenRound) {
        seenRound = room.round;
        if (me && room.round > 0) {
          const role = roleOf(room, me.id);
          const idx = players.findIndex((p) => p.id === me.id);
          const spawn =
            role === "hunter"
              ? map.hunterSpawns[idx % map.hunterSpawns.length]
              : map.spawns[idx % map.spawns.length];
          session.me().set("x", spawn.x, true);
          session.me().set("y", spawn.y, true);
          session.me().set("fill", WHITE, true);
          session.me().set("blobs", [], true);
          session.me().set("pose", "stand", true);
          session.me().set("role", role, true);
          session.me().set("alive", role !== "spectator", true);
          session.me().set("ready", false, true);
          setPaintOpen(role === "hider");
        }
      }

      if (me && room.phase !== "lobby" && room.phase !== "result") {
        const hunterWait = isHunter(room, me.id) && room.phase === "hide";
        const dead = room.phase === "hunt" && !isHunter(room, me.id) && !hiderAlive(room, me.id);
        if (!hunterWait) {
          let ix = 0;
          let iy = 0;
          if (keys.has("w") || keys.has("arrowup")) iy -= 1;
          if (keys.has("s") || keys.has("arrowdown")) iy += 1;
          if (keys.has("a") || keys.has("arrowleft")) ix -= 1;
          if (keys.has("d") || keys.has("arrowright")) ix += 1;
          if (stick.on) {
            ix += stick.dx;
            iy += stick.dy;
          }
          const mag = Math.hypot(ix, iy);
          if (mag > 0) {
            ix /= mag;
            iy /= mag;
            const pose = (session.me().get("pose") as Pose) || "stand";
            let speed = PLAYER_SPEED;
            if (keys.has("shift")) speed = SNEAK_SPEED;
            if (paintOpenRef.current) speed = PAINT_SPEED;
            if (pose === "lie") speed *= 0.45;
            if (pose === "crouch" || pose === "sit") speed *= 0.72;
            if (dead) speed *= 1.15;
            const { hw, hh } = poseSize(pose);
            const nx = Number(session.me().get("x") ?? me.x) + ix * speed * dt;
            const ny = Number(session.me().get("y") ?? me.y) + iy * speed * dt;
            if (dead || !blocked(nx, me.y, hw, hh, walls, map.w, map.h)) {
              session.me().set("x", nx, false);
              me.x = nx;
            }
            if (dead || !blocked(me.x, ny, hw, hh, walls, map.w, map.h)) {
              session.me().set("y", ny, false);
              me.y = ny;
            }
            session.me().set("dir", Math.atan2(iy, ix), false);
            session.me().set("vx", ix, false);
            session.me().set("vy", iy, false);
          }
        }
      }

      if (me && room.phase === "hunt" && hiderAlive(room, me.id)) {
        if (Date.now() - lastForced > FORCED_TAUNT) {
          lastForced = Date.now();
          tryTaunt();
        }
      }

      if (t - lastSync > 1000 / SYNC_HZ) {
        lastSync = t;
        const mx = session.me().get("x");
        const my = session.me().get("y");
        session.me().set("x", mx, false);
        session.me().set("y", my, false);
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
          next.lastTag?.at !== room.lastTag?.at
        ) {
          session.setRoom(next);
        }
      }

      const live = snapsFrom(session);
      const self = live.find((p) => p.id === session.myId()) ?? me;
      const zoom = currentZoom();
      const vw = window.innerWidth / zoom;
      const vh = window.innerHeight / zoom;
      if (self) {
        const tx = self.x - vw / 2;
        const ty = self.y - vh / 2;
        camX += (tx - camX) * Math.min(1, dt * 8);
        camY += (ty - camY) * Math.min(1, dt * 8);
      }
      camX = Math.max(0, Math.min(map.w - vw, camX));
      camY = Math.max(0, Math.min(map.h - vh, camY));

      const hunterHide = self && isHunter(room, self.id) && room.phase === "hide";
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      if (!hunterHide && (room.phase === "hide" || room.phase === "hunt" || room.phase === "result" || room.phase === "lobby")) {
        ctx.drawImage(baked, 0, 0);
        const now = Date.now();
        if (room.phase === "hunt") {
          for (const tn of room.taunts) {
            const a = 1 - (now - tn.at) / 1600;
            if (a <= 0) continue;
            ctx.strokeStyle = `rgba(255,220,80,${a})`;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(tn.x, tn.y, 18 + (1 - a) * 70, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        for (const p of live) {
          if (!canDraw(room, self, p)) continue;
          const hunter = isHunter(room, p.id);
          const ghost =
            room.phase === "hunt" &&
            room.mode === "normal" &&
            room.caughtIds.includes(p.id) &&
            !hunter;
          const flash =
            room.lastTag && room.lastTag.id === p.id
              ? Math.max(0, 1 - (now - room.lastTag.at) / 700)
              : 0;
          drawCharacter(ctx, p, {
            isMe: p.id === self?.id,
            hunterLook: hunter && room.phase !== "lobby",
            ghost,
            flash,
            showName: room.phase !== "hunt" || hunter,
          });
        }
        for (const s of shots) {
          const a = 1 - (Date.now() - s.at) / 280;
          if (a <= 0) continue;
          ctx.strokeStyle = s.hit ? `rgba(255,80,60,${a})` : `rgba(255,255,255,${a})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(s.x - 8, s.y - 8);
          ctx.lineTo(s.x + 8, s.y + 8);
          ctx.moveTo(s.x + 8, s.y - 8);
          ctx.lineTo(s.x - 8, s.y + 8);
          ctx.stroke();
        }
      } else if (hunterHide) {
        ctx.fillStyle = "#0b100d";
        ctx.fillRect(camX, camY, vw + 2, vh + 2);
      }

      ctx.restore();
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
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      canvas.removeEventListener("pointerdown", onPointerDown);
      unshot();
    };
  }, [session]);

  useEffect(() => {
    const c = previewRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const me = people.find((p) => p.id === session.myId());
    drawPreview(ctx, me?.fill ?? WHITE, me?.blobs ?? [], me?.pose ?? "stand");
  }, [people, session, paintOpen]);

  const me = people.find((p) => p.id === session.myId());
  const myRole = me ? roleOf(hud, me.id) : "spectator";
  const hunterHide = myRole === "hunter" && hud.phase === "hide";
  const timeLeft = remaining(hud, nowTick);

  const startRound = () => {
    if (!session.isHost()) return;
    const ids = session.players().map((p) => p.id);
    session.setRoom(beginRound(session.getRoom(), ids, Date.now()));
  };

  const paintAtPreview = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool !== "brush") return;
    const c = previewRef.current;
    if (!c) return;
    const rect = c.getBoundingClientRect();
    const px = e.clientX - rect.left - rect.width / 2;
    const py = e.clientY - rect.top - rect.height / 2 - 8;
    const x = px / 2.2;
    const y = py / 2.2;
    const blobs = addBlob(
      (session.me().get("blobs") as PaintBlob[]) || [],
      x,
      y,
      brush * 0.45,
      color,
      MAX_BLOBS,
    );
    session.me().set("blobs", blobs, true);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#0b100d] text-paper">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-10 flex items-start justify-between p-3">
        <div className="rounded-2xl bg-black/45 px-3 py-2 backdrop-blur-sm">
          <div className="text-[11px] tracking-wide text-lime/80">
            {serverName} · {roomLabel}
            {session.kind === "practice" ? " · 연습" : ""}
          </div>
          <div className="font-display text-lg leading-none">
            {hud.phase === "lobby" && "대기실"}
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

      {hud.phase === "hunt" && myRole === "hunter" && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-white/80" />
          <div className="absolute h-px w-10 bg-white/70" />
          <div className="absolute h-10 w-px bg-white/70" />
        </div>
      )}

      {hunterHide && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b100d] text-center">
          <p className="text-sm text-lime">술래는 아직 입장할 수 없습니다</p>
          <h2 className="mt-2 font-display text-5xl">위장 중...</h2>
          <p className="mt-3 text-white/70">카멜레온들이 몸에 색을 칠하고 있습니다</p>
          <div className="mt-8 font-display text-7xl text-lime">{timeLeft}</div>
        </div>
      )}

      {hud.lastTag && nowTick - hud.lastTag.at < 1800 && hud.phase === "hunt" && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-full bg-pink px-4 py-1 font-display text-black">
          {hud.lastTag.name} 발견!
        </div>
      )}

      {hud.phase === "lobby" && (
        <Lobby
          session={session}
          room={hud}
          people={people}
          serverName={serverName}
          roomLabel={roomLabel}
          onStart={startRound}
        />
      )}

      {hud.phase === "result" && (
        <ResultPanel room={hud} people={people} host={session.isHost()} onNext={startRound} />
      )}

      {(hud.phase === "hide" || hud.phase === "hunt") && !hunterHide && (
        <>
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[220px] rounded-2xl bg-black/40 p-3 text-[12px] leading-relaxed text-white/80 backdrop-blur-sm">
            <div>WASD 이동 · Shift 살금</div>
            <div>F 페인트 · R 자세 · T 도발</div>
            <div>E 스포이드 · 1-6 자세</div>
            {myRole === "hunter" && <div className="mt-1 text-pink">클릭해서 태그 · 사거리 짧음</div>}
          </div>
          <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end gap-2">
            <button
              type="button"
              className="rounded-full bg-black/50 px-3 py-1 text-sm"
              onClick={() => setHelp(true)}
            >
              도움말
            </button>
            {myRole === "hider" && (
              <button
                type="button"
                className={`rounded-full px-4 py-2 font-display ${paintOpen ? "bg-lime text-black" : "bg-black/50"}`}
                onClick={() => setPaintOpen((v) => !v)}
              >
                {paintOpen ? "페인트 ON" : "페인트"}
              </button>
            )}
            <div className="flex gap-1">
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
        </>
      )}

      {paintOpen && myRole !== "hunter" && hud.phase !== "lobby" && (
        <aside className="absolute bottom-24 right-3 z-20 w-[230px] rounded-2xl border border-white/10 bg-[#121a16]/95 p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-display">위장 팔레트</span>
            <button type="button" onClick={() => setPaintOpen(false)}>
              닫기
            </button>
          </div>
          <canvas
            ref={previewRef}
            width={200}
            height={220}
            className="w-full rounded-xl bg-[#0b100d]"
            onPointerDown={(e) => {
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
              if (tool === "fill") {
                session.me().set("fill", color, true);
                return;
              }
              paintAtPreview(e);
            }}
            onPointerMove={(e) => {
              if (e.buttons !== 1) return;
              paintAtPreview(e);
            }}
          />
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
              min={4}
              max={22}
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
            스포이드로 맵을 찍고, 붓으로 미리보기를 칠하세요. 색만 맞추면 윤곽이 남습니다. 자세도 바꾸세요.
          </p>
        </aside>
      )}

      {help && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/70 p-4" onClick={() => setHelp(false)}>
          <div
            className="max-w-lg rounded-3xl bg-[#17241c] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-2xl">어떻게 놀아요</h3>
            <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-white/80">
              <li>라운드가 시작되면 술래와 카멜레온이 무작위로 정해집니다.</li>
              <li>카멜레온은 위장 시간 동안 자리를 고르고, 스포이드로 색을 뽑아 몸을 칠하고, 자세를 맞춥니다.</li>
              <li>술래는 위장 시간이 끝난 뒤 입장합니다. 색이 어긋난 윤곽, 이상한 그림자, 단골 스팟을 찾으세요.</li>
              <li>술래는 가까이 가서 클릭해 태그합니다. 노말은 잡히면 아웃, 감염은 술래가 됩니다.</li>
              <li>시간 안에 전원 발견이면 술래 승, 한 명이라도 남으면 카멜레온 승.</li>
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

function canDraw(room: RoomState, self: PlayerSnap | undefined, other: PlayerSnap) {
  if (!self) return true;
  if (other.id === self.id) return true;
  if (room.phase === "lobby" || room.phase === "result") return true;
  if (isHunter(room, self.id) || room.caughtIds.includes(self.id)) return true;
  if (room.phase === "hide") return !isHunter(room, other.id);
  if (isHunter(room, other.id)) return true;
  return false;
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
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]">
      <div className="grid w-full max-w-4xl gap-4 rounded-3xl border border-white/10 bg-[#121c17]/95 p-5 md:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="text-xs text-lime">
            {serverName} · {roomLabel}
          </p>
          <h2 className="font-display text-3xl">방 대기실</h2>
          <p className="mt-1 text-sm text-white/65">
            호스트가 맵과 모드를 고르고 시작하면, 술래와 카멜레온이 랜덤으로 배정됩니다.
          </p>
          <ul className="mt-4 space-y-2">
            {people.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2"
              >
                <span>
                  {p.name}
                  {p.id === session.myId() ? " (나)" : ""}
                  {host && p.id === session.myId() ? " · 호스트" : ""}
                </span>
                <span className={p.ready ? "text-lime" : "text-white/40"}>
                  {p.ready ? "준비" : "대기"}
                </span>
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
            <button
              type="button"
              className="rounded-full bg-white/10 px-4"
              onClick={() => session.leave()}
            >
              나가기
            </button>
          </div>
        </div>
        <div className="rounded-2xl bg-black/25 p-4">
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
                <div className={`text-xs ${room.mapId === m.id ? "text-black/70" : "text-white/55"}`}>
                  {m.blurb}
                </div>
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
                onChange={(e) =>
                  session.setRoom({ ...room, mode: e.target.value as RoomState["mode"] })
                }
              >
                <option value="normal">노말 (잡히면 아웃)</option>
                <option value="infection">감염 (잡히면 술래)</option>
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
                onChange={(e) =>
                  session.setRoom({ ...room, hunterCount: Number(e.target.value) || 1 })
                }
              />
            </label>
            <label className="rounded-xl bg-white/8 p-2">
              위장 시간(초)
              <input
                type="number"
                min={30}
                max={180}
                disabled={!host}
                className="mt-1 w-full bg-transparent"
                value={room.hideTime}
                onChange={(e) =>
                  session.setRoom({ ...room, hideTime: Number(e.target.value) || 70 })
                }
              />
            </label>
            <label className="rounded-xl bg-white/8 p-2">
              수색 시간(초)
              <input
                type="number"
                min={60}
                max={300}
                disabled={!host}
                className="mt-1 w-full bg-transparent"
                value={room.huntTime}
                onChange={(e) =>
                  session.setRoom({ ...room, huntTime: Number(e.target.value) || 150 })
                }
              />
            </label>
          </div>
          {host ? (
            <button
              type="button"
              onClick={onStart}
              disabled={people.length < 1}
              className="mt-4 w-full rounded-full bg-lime py-3 font-display text-lg text-black disabled:opacity-50"
            >
              {people.length < 2 ? "연습 라운드 시작 (1인)" : "라운드 시작"}
            </button>
          ) : (
            <p className="mt-4 text-center text-sm text-white/60">호스트가 시작하기를 기다리는 중</p>
          )}
        </div>
      </div>
    </div>
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
  const ranked = [...people].sort(
    (a, b) => (room.scores[b.id] ?? 0) - (room.scores[a.id] ?? 0),
  );
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-3xl bg-[#121c17] p-6 text-center">
        <p className="text-lime">라운드 {room.round}</p>
        <h2 className="font-display text-4xl">
          {room.winner === "hiders" ? "카멜레온 승!" : "술래 승!"}
        </h2>
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
          <button
            type="button"
            onClick={onNext}
            className="mt-5 w-full rounded-full bg-lime py-2 font-display text-black"
          >
            다음 라운드
          </button>
        )}
        <p className="mt-3 text-xs text-white/50">잠시 후 대기실로 돌아갑니다</p>
      </div>
    </div>
  );
}
