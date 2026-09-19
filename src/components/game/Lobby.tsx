"use client";

import { memo, useState } from "react";
import { SCORE_HUNT_WIN, SCORE_SURVIVE, SCORE_TAG } from "@/lib/config";
import { MAPS } from "@/lib/maps";
import type { Session } from "@/lib/session";
import { BODY_SCALE, type BodySize, type PlayerSnap, type RoomState } from "@/lib/types";

const BODY_SIZES: { id: BodySize; label: string; hint: string }[] = [
  { id: "petit", label: "쁘띠", hint: "절반 크기 · 느림 · 점수 60%" },
  { id: "normal", label: "보통", hint: "기본" },
  { id: "plump", label: "통통", hint: "가로 1.3배 · 빠름 · 점수 140%" },
];

const FIELD_ROW = "flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg bg-white/8 px-2";
const FIELD_SELECT = "h-7 min-w-0 max-w-[60%] truncate rounded-md bg-[#121c17] px-1 text-right text-xs text-paper";
const FIELD_LABEL = "whitespace-nowrap text-xs text-white/85";
const FIELD_INPUT = "h-7 w-12 bg-transparent text-right text-sm tabular-nums disabled:opacity-40";

interface NumberFieldProps {
  label: string;
  name: string;
  min: number;
  max: number;
  disabled: boolean;
  value: number;
  onChange: (value: number) => void;
}

/** One-line numeric option: label left, narrow field right, clamped to [min, max]. */
function NumberField({ label, name, min, max, disabled, value, onChange }: NumberFieldProps) {
  return (
    <label className={FIELD_ROW}>
      <span className={FIELD_LABEL}>{label}</span>
      <input
        type="number"
        name={name}
        autoComplete="off"
        inputMode="numeric"
        min={min}
        max={max}
        disabled={disabled}
        className={FIELD_INPUT}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || min)))}
      />
    </label>
  );
}

interface CheckRowProps {
  label: string;
  name: string;
  hint?: string;
  disabled: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
  wide?: boolean;
}

function CheckRow({ label, name, hint, disabled, checked, onChange, wide }: CheckRowProps) {
  return (
    <label className={`${FIELD_ROW} ${wide ? "col-span-2" : ""}`} title={hint}>
      <span className={FIELD_LABEL}>
        <input type="checkbox" name={name} className="mr-2 accent-lime" disabled={disabled} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </span>
      {hint && <span className="truncate text-[11px] text-white/50">{hint}</span>}
    </label>
  );
}

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
      <p className="mt-1 truncate text-xs text-white/65">WASD로 둘러보기 · 전원 준비 후 방장이 시작</p>
      <ul className="mt-3 space-y-1" aria-label="참가자">
        {people.map((p) => {
          const isMe = p.id === session.myId();
          const isRoomHost = room.hostId === p.id;
          return (
            <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-sm">
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
      {room.allowBodySizes !== false && (
        <div className="mt-2 rounded-2xl bg-black/25 p-2.5">
          <div id="body-size-label" className="text-xs text-white/60">몸 크기</div>
          <div className="mt-1 grid grid-cols-3 gap-1.5" role="group" aria-labelledby="body-size-label">
            {BODY_SIZES.map((b) => {
              const active = (me?.bodySize ?? "normal") === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-pressed={active}
                  title={b.hint}
                  onClick={() => session.me().set("bodySize", b.id, true)}
                  className={`h-12 rounded-lg text-xs leading-tight ${active ? "bg-lime text-black" : "bg-white/10"}`}
                >
                  {b.label}
                  <span className="block text-[10px] opacity-70">
                    ×{BODY_SCALE[b.id].xz} · 점수 {Math.round(BODY_SCALE[b.id].score * 100)}%
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={`h-11 flex-1 rounded-full font-display ${me?.ready ? "bg-lime text-black" : "bg-white/10"}`}
          onClick={() => session.me().set("ready", !me?.ready, true)}
        >
          {me?.ready ? "준비 완료" : "준비"}
        </button>
        <button type="button" className="h-11 rounded-full bg-white/10 px-5" onClick={() => session.leave()}>
          나가기
        </button>
      </div>
      <div className="mt-2 rounded-2xl bg-black/25 p-2.5">
          <div id="map-label" className="text-xs text-white/60">맵</div>
          <div className="mt-1 grid grid-cols-2 gap-1.5" role="group" aria-labelledby="map-label">
            {MAPS.map((m) => (
              <button
                key={m.id}
                type="button"
                disabled={!host}
                aria-pressed={room.mapId === m.id}
                onClick={() => session.patchRoom({ mapId: m.id })}
                title={m.blurb}
                className={`h-12 min-w-0 rounded-xl px-2.5 text-left ${room.mapId === m.id ? "bg-lime text-black" : "bg-white/8"}`}
            >
              <div className="truncate font-display text-sm">
                {m.name} <span className="text-xs font-normal opacity-70">{m.difficulty}</span>
              </div>
              <div className={`truncate text-[11px] ${room.mapId === m.id ? "text-black/70" : "text-white/60"}`}>{m.blurb}</div>
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm">
          <label className={FIELD_ROW}>
            <span className={FIELD_LABEL} title="기본: 발견되면 관전 · 감염: 발견되면 술래 합류">모드</span>
            <select
              name="mode"
              autoComplete="off"
              className={FIELD_SELECT}
              disabled={!host}
              value={room.mode}
              onChange={(e) => session.patchRoom({ mode: e.target.value as RoomState["mode"] })}
            >
              <option value="normal" className="bg-[#121c17] text-paper">기본</option>
              <option value="infection" className="bg-[#121c17] text-paper">감염</option>
            </select>
          </label>
          {session.kind === "practice" && (
            <label className={FIELD_ROW}>
              <span className={FIELD_LABEL} title="AI: 봇이 술래 · 나: 내가 술래 · 랜덤">술래</span>
              <select
                name="hunterMode"
                autoComplete="off"
                className={FIELD_SELECT}
                value={room.hunterMode ?? "ai"}
                onChange={(e) => {
                  const hunterMode = e.target.value as RoomState["hunterMode"];
                  session.patchRoom({
                    hunterMode,
                    hunterPlayerId: hunterMode === "random" ? undefined : session.myId(),
                  });
                }}
              >
                <option value="ai" className="bg-[#121c17] text-paper">AI</option>
                <option value="human" className="bg-[#121c17] text-paper">나</option>
                <option value="random" className="bg-[#121c17] text-paper">랜덤</option>
              </select>
            </label>
          )}
          <NumberField
            label="술래 수"
            name="hunterCount"
            min={1}
            max={3}
            disabled={!host}
            value={room.hunterCount}
            onChange={(hunterCount) => session.patchRoom({ hunterCount })}
          />
          <NumberField
            label="역할 확인(초)"
            name="prepareTime"
            min={3}
            max={20}
            disabled={!host}
            value={room.prepareTime || 8}
            onChange={(prepareTime) => session.patchRoom({ prepareTime })}
          />
          <NumberField
            label="위장(초)"
            name="hideTime"
            min={30}
            max={180}
            disabled={!host}
            value={room.hideTime}
            onChange={(hideTime) => session.patchRoom({ hideTime })}
          />
          <NumberField
            label="수색(초)"
            name="huntTime"
            min={60}
            max={300}
            disabled={!host}
            value={room.huntTime}
            onChange={(huntTime) => session.patchRoom({ huntTime })}
          />
          <NumberField
            label="공개 라운드(초)"
            name="revealTime"
            min={5}
            max={60}
            disabled={!host}
            value={room.revealTime || 30}
            onChange={(revealTime) => session.patchRoom({ revealTime })}
          />
          <NumberField
            label="강제 도발(초)"
            name="forcedTauntSec"
            min={15}
            max={90}
            disabled={!host}
            value={room.forcedTauntSec || 45}
            onChange={(forcedTauntSec) => session.patchRoom({ forcedTauntSec })}
          />
          <CheckRow
            label="술래 3인칭"
            name="hunterTps"
            disabled={!host}
            checked={room.hunterTps !== false}
            onChange={(hunterTps) => session.patchRoom({ hunterTps })}
          />
          <CheckRow
            label="몸 크기 변경"
            name="allowBodySizes"
            disabled={!host}
            checked={room.allowBodySizes !== false}
            onChange={(allowBodySizes) => session.patchRoom({ allowBodySizes })}
          />
          {session.kind === "online" && (
            <CheckRow
              label="게임 중 방 목록 표시"
              name="listWhilePlaying"
              hint="끄면 라운드 중 코드로만 입장"
              disabled={!host}
              checked={room.listWhilePlaying !== false}
              onChange={(listWhilePlaying) => session.patchRoom({ listWhilePlaying })}
              wide
            />
          )}
          <label className={`${FIELD_ROW} col-span-2`} title="빗나가면 −1 · 맞히면 +1 · 도망치는 상대는 무료">
            <span className={FIELD_LABEL}>
              <input
                type="checkbox"
                name="ammoEnabled"
                className="mr-2 accent-lime"
                disabled={!host}
                checked={Boolean(room.ammoEnabled)}
                onChange={(e) => session.patchRoom({ ammoEnabled: e.target.checked })}
              />
              탄약 제한
            </span>
            <span className="flex items-center gap-1.5 text-xs text-white/60">
              탄 수
              <input
                type="number"
                name="ammoCount"
                autoComplete="off"
                inputMode="numeric"
                min={1}
                max={99}
                disabled={!host || !room.ammoEnabled}
                className={FIELD_INPUT}
                value={room.ammoCount || 5}
                onChange={(e) => session.patchRoom({ ammoCount: Math.max(1, Math.min(99, Number(e.target.value) || 5)) })}
              />
            </span>
          </label>
        </div>
        {host ? (
          <>
            <button
              type="button"
              onClick={onStart}
              aria-describedby="round-start-status"
              disabled={!allReady}
              className="mt-3 h-11 w-full rounded-full bg-lime font-display text-lg text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {people.length < 2 ? "2인 이상 필요" : "라운드 시작"}
            </button>
            <p id="round-start-status" className="mt-1.5 truncate text-center text-xs text-white/65">
              {people.length < 2 ? "2인 이상 참가해야 시작할 수 있습니다" : allReady ? "전원 준비됨" : `준비 ${readyCount}/${people.length} — 모두 준비해야 시작`}
            </p>
            <p className="mt-1.5 truncate text-center text-[11px] text-white/60" title="술래 눈앞에서 속이면 초당 최대 10점 · Tab으로 현황">
              발견 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승 +{SCORE_HUNT_WIN} · 속임 ≤10/초
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-center text-sm text-white/65">
              호스트 시작 대기 · 준비 {readyCount}/{people.length}
            </p>
            <p className="mt-1.5 truncate text-center text-[11px] text-white/60" title="술래 눈앞에서 속이면 초당 최대 10점 · Tab으로 현황">
              발견 +{SCORE_TAG} · 생존 +{SCORE_SURVIVE} · 술래 승 +{SCORE_HUNT_WIN} · 속임 ≤10/초
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
