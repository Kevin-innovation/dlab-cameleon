"use client";

import { memo, useState } from "react";
import { SCORE_HUNT_WIN, SCORE_SURVIVE, SCORE_TAG } from "@/lib/config";
import { MAPS } from "@/lib/maps";
import type { Session } from "@/lib/session";
import type { PlayerSnap, RoomState } from "@/lib/types";

export const Lobby = memo(function Lobby({
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
  const allReady = people.length >= 2 && readyCount === people.length;
  return (
    <aside className="z-20 flex max-h-[46dvh] w-full shrink-0 flex-col overflow-y-auto overscroll-contain border-b border-white/10 bg-[#121c17] p-4 md:h-full md:max-h-none md:w-[min(100%,360px)] md:border-b-0 md:border-r">
      <p className="text-xs text-lime">
        {serverName} · {roomLabel}
      </p>
      <h2 className="text-wrap-balance font-display text-3xl">{room.roomName || "방 대기실"}</h2>
      {session.kind === "online" && (
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/65">
          <span>
            인원 <span className="font-display text-base text-lime tabular-nums">{people.length}/{room.maxPlayers}</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>{room.isPrivate ? "비공개 방" : "공개 방"}</span>
          <span aria-hidden="true">·</span>
          <CopyCodeButton code={session.roomCode} />
        </div>
      )}
      <p className="mt-2 text-sm text-white/65">맵에서 WASD 또는 가로 화면 조이스틱으로 이동해 보세요. 전원 준비 완료 후에만 방장이 시작할 수 있습니다.</p>
      <ul className="mt-4 space-y-2" aria-label="참가자">
        {people.map((p) => {
          const isMe = p.id === session.myId();
          const isRoomHost = room.hostId === p.id;
          return (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/5 px-3 py-2">
              <span className="flex min-w-0 items-center gap-1.5">
                {isRoomHost && <HostCrown />}
                <span className="truncate">
                  {p.name}
                  {isMe ? " (나)" : ""}
                  {isRoomHost ? " · 방장" : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className={p.ready ? "text-lime" : "text-white/60"}>{p.ready ? "준비" : "대기"}</span>
                {host && !isMe && session.kind === "online" && (
                  <button
                    type="button"
                    className="rounded-full border border-pink/40 px-2 py-0.5 text-[11px] text-pink"
                    onClick={() => {
                      if (window.confirm(`${p.name}님을 강퇴할까요?`)) session.kick(p.id);
                    }}
                    aria-label={`${p.name} 강퇴`}
                  >
                    강퇴
                  </button>
                )}
              </span>
            </li>
          );
        })}
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
                onClick={() => session.patchRoom({ mapId: m.id })}
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
              onChange={(e) => session.patchRoom({ mode: e.target.value as RoomState["mode"] })}
            >
              <option value="normal" className="bg-[#121c17] text-paper">기본 숨바꼭질</option>
              <option value="infection" className="bg-[#121c17] text-paper">감염 (커스텀)</option>
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
                  session.patchRoom({
                    hunterMode,
                    hunterPlayerId: hunterMode === "random" ? undefined : session.myId(),
                  });
                }}
              >
                <option value="ai" className="bg-[#121c17] text-paper">AI 술래 (내가 숨기)</option>
                <option value="human" className="bg-[#121c17] text-paper">내가 술래</option>
                <option value="random" className="bg-[#121c17] text-paper">랜덤</option>
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
              onChange={(e) => session.patchRoom({ hunterCount: Number(e.target.value) || 1 })}
            />
          </label>
          <label className="rounded-xl bg-white/8 p-2">
            역할 확인(초)
            <input
              type="number"
              name="prepareTime"
              autoComplete="off"
              inputMode="numeric"
              min={3}
              max={20}
              disabled={!host}
              className="mt-1 w-full bg-transparent"
              value={room.prepareTime || 8}
              onChange={(e) => session.patchRoom({ prepareTime: Math.max(3, Math.min(20, Number(e.target.value) || 8)) })}
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
              onChange={(e) => session.patchRoom({ hideTime: Number(e.target.value) || 70 })}
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
              onChange={(e) => session.patchRoom({ huntTime: Number(e.target.value) || 150 })}
            />
          </label>
          <label className="rounded-xl bg-white/8 p-2">
            공개 라운드(초)
            <input
              type="number"
              name="revealTime"
              autoComplete="off"
              inputMode="numeric"
              min={10}
              max={60}
              disabled={!host}
              className="mt-1 w-full bg-transparent"
              value={room.revealTime || 30}
              onChange={(e) => session.patchRoom({ revealTime: Math.max(10, Math.min(60, Number(e.target.value) || 30)) })}
            />
          </label>
          <label className="rounded-xl bg-white/8 p-2">
            강제 도발(초)
            <input
              type="number"
              name="forcedTauntSec"
              autoComplete="off"
              inputMode="numeric"
              min={15}
              max={90}
              disabled={!host}
              className="mt-1 w-full bg-transparent"
              value={room.forcedTauntSec || 45}
              onChange={(e) => session.patchRoom({ forcedTauntSec: Math.max(15, Math.min(90, Number(e.target.value) || 45)) })}
            />
          </label>
          <label className="flex items-center justify-between rounded-xl bg-white/8 p-2 text-sm">
            <span>
              <input
                type="checkbox"
                name="hunterTps"
                className="mr-2 accent-lime"
                disabled={!host}
                checked={room.hunterTps !== false}
                onChange={(e) => session.patchRoom({ hunterTps: e.target.checked })}
              />
              술래 3인칭 허용
            </span>
          </label>
          {session.kind === "online" && (
            <label className="col-span-2 flex items-center justify-between rounded-xl bg-white/8 p-2">
              <span>
                <input
                  type="checkbox"
                  name="listWhilePlaying"
                  className="mr-2 accent-lime"
                  disabled={!host}
                  checked={room.listWhilePlaying !== false}
                  onChange={(e) => session.patchRoom({ listWhilePlaying: e.target.checked })}
                />
                게임 중에도 방 목록에 표시
              </span>
              <span className="text-[11px] text-white/55">끄면 라운드 중 코드로만 입장</span>
            </label>
          )}
          <label className="col-span-2 flex items-center justify-between rounded-xl bg-white/8 p-2">
            <span>
              <input
                type="checkbox"
                name="ammoEnabled"
                className="mr-2 accent-lime"
                disabled={!host}
                checked={Boolean(room.ammoEnabled)}
                onChange={(e) => session.patchRoom({ ammoEnabled: e.target.checked })}
              />
              탄약 제한 사용
            </span>
            <span className="text-[11px] text-white/55">빗나가면 −1 · 맞히면 +1 · 도망치는 상대는 무료</span>
          </label>
          <label className="col-span-2 rounded-xl bg-white/8 p-2">
            술래 탄 수 (옵션)
            <input
              type="number"
              name="ammoCount"
              autoComplete="off"
              inputMode="numeric"
              min={1}
              max={99}
              disabled={!host || !room.ammoEnabled}
              className="mt-1 w-full bg-transparent"
              value={room.ammoCount || 5}
              onChange={(e) =>
                session.patchRoom({ ammoCount: Math.max(1, Math.min(99, Number(e.target.value) || 5)) })
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
              {people.length < 2 ? "2인 이상 필요" : "라운드 시작"}
            </button>
            <p id="round-start-status" className="mt-2 text-center text-xs text-white/65">
              {people.length < 2
                ? "2인 이상 참가해야 라운드를 시작할 수 있습니다"
                : allReady
                  ? "전원 준비됨"
                  : `준비 ${readyCount}/${people.length} — 모두 준비해야 시작됩니다`}
            </p>
            <p className="mt-2 text-center text-[11px] text-white/60">
              점수: 발견 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승 +{SCORE_HUNT_WIN} · 술래 눈앞에서 속이면 초당 최대 10 · Tab 현황
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-center text-sm text-white/65">
              호스트 시작 대기 · 준비 {readyCount}/{people.length}
            </p>
            <p className="mt-2 text-center text-[11px] text-white/60">
              점수: 발견 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승 +{SCORE_HUNT_WIN} · 술래 눈앞에서 속이면 초당 최대 10 · Tab 현황
            </p>
          </>
        )}
      </div>
    </aside>
  );
});

export function HostCrown() {
  return (
    <span className="shrink-0 text-sm leading-none" role="img" aria-label="방장">
      👑
    </span>
  );
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const link = `${window.location.origin}/#r=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("초대 링크를 복사하세요", link);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="rounded-full border border-lime/40 px-2.5 py-0.5 font-display text-sm tracking-[0.12em] text-lime"
      title="초대 링크 복사"
    >
      {code}
      <span className="ml-1.5 text-[10px] tracking-normal text-white/60">{copied ? "복사됨" : "복사"}</span>
    </button>
  );
}
