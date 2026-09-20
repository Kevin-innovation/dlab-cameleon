"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { MAX_PLAYERS } from "@/lib/config";
import { randomNickname } from "@/lib/nickname";

interface HomeProps {
  nick: string;
  setNick: (value: string) => void;
  error: string;
  notice: string;
  rejoinCode: string;
  onRejoin: () => void;
  onEnter: () => void;
  onPractice: () => void;
}

/** Three-beat pitch under the headline; each line is short enough never to wrap on a phone. */
const HOW_IT_WORKS: { icon: string; label: string }[] = [
  { icon: "🎨", label: "벽 색을 찍어 몸에 칠하고" },
  { icon: "🧍", label: "자세로 실루엣을 맞춘 뒤" },
  { icon: "🔦", label: "술래의 눈을 속인다" },
];

const FACTS: string[] = [`최대 ${MAX_PLAYERS}명`, "한국 서버", "설치 없음", "PC · 모바일"];

export function Home({ nick, setNick, error, notice, rejoinCode, onRejoin, onEnter, onPractice }: HomeProps) {
  const nicknameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) nicknameRef.current?.focus();
  }, [error]);

  return (
    <main id="main-content" className="flex flex-1 flex-col items-start justify-center gap-10 py-8 md:flex-row md:items-center md:justify-between">
      <div className="w-full max-w-xl break-keep">
        <p className="flex flex-wrap gap-1.5" aria-label="게임 특징">
          {FACTS.map((fact) => (
            <span key={fact} className="whitespace-nowrap rounded-full border border-lime/40 bg-lime/10 px-2.5 py-0.5 text-xs font-semibold text-lime">
              {fact}
            </span>
          ))}
        </p>
        <h1 className="mt-4 font-display text-[clamp(2.2rem,10vw,3.5rem)] leading-[1.08] md:text-7xl">
          <span className="block whitespace-nowrap">흰 몸으로 들어가</span>
          <span className="block whitespace-nowrap text-lime">배경이 되어 나와라</span>
        </h1>

        <ol className="mt-5 flex flex-col gap-1.5 text-base text-white/85" aria-label="게임 방법">
          {HOW_IT_WORKS.map((step, index) => (
            <li key={step.label} className="flex items-center gap-2.5 whitespace-nowrap">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 font-display text-xs text-lime" aria-hidden="true">
                {index + 1}
              </span>
              <span aria-hidden="true">{step.icon}</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>

        {notice && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink" role="status">
            <span>{notice}</span>
            {rejoinCode && (
              <button type="button" onClick={onRejoin} className="h-8 rounded-full bg-pink px-3 text-xs font-semibold text-black transition hover:brightness-110 active:scale-95">
                {rejoinCode} 방으로 다시 입장
              </button>
            )}
          </div>
        )}

        <form
          className="mt-7 flex w-full max-w-md flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onEnter();
          }}
        >
          <label htmlFor="nickname" className="text-xs tracking-wide text-white/60">
            닉네임
          </label>
          <div className="flex gap-2">
            <input
              ref={nicknameRef}
              id="nickname"
              name="nickname"
              type="text"
              inputMode="text"
              autoComplete="nickname"
              spellCheck={false}
              value={nick}
              onChange={(e) => setNick(e.target.value)}
              maxLength={12}
              placeholder="예: 초록커튼"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "nickname-error" : undefined}
              className="h-14 min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/40 px-4 text-lg outline-none ring-lime/40 transition focus-visible:border-lime/60 focus-visible:ring-2"
            />
            <button
              type="button"
              onClick={() => setNick(randomNickname())}
              title="랜덤 닉네임"
              aria-label="랜덤 닉네임 뽑기"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/15 bg-black/40 text-2xl transition hover:border-lime/60 hover:bg-lime/10 active:scale-95"
            >
              🎲
            </button>
          </div>
          {error && (
            <p id="nickname-error" className="text-sm text-pink" aria-live="polite">
              {error}
            </p>
          )}
          <button
            type="submit"
            className="h-14 w-full rounded-full bg-lime font-display text-xl text-black shadow-[0_10px_30px_rgba(198,255,74,0.25)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-[0.98]"
          >
            한국 서버 입장
          </button>
          <button
            type="button"
            onClick={onPractice}
            className="h-14 w-full rounded-full border border-white/20 font-display text-xl transition hover:border-lime/60 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime active:scale-[0.98]"
          >
            AI와 플레이 <span className="text-sm font-normal text-white/60">혼자 연습</span>
          </button>
        </form>
      </div>

      <div className="relative mx-auto shrink-0">
        <div className="home-mascot-float">
          <Image
            src="/mascot.jpg"
            alt="카멜론 마스코트"
            width={288}
            height={288}
            priority
            className="h-56 w-56 rounded-[2.2rem] object-cover shadow-2xl ring-4 ring-lime/30 md:h-72 md:w-72"
          />
        </div>
        <div className="absolute -left-4 -top-3 rounded-2xl rounded-bl-sm bg-paper px-3 py-1.5 font-display text-sm text-black shadow-lg md:-left-8" aria-hidden="true">
          나 찾아봐!
        </div>
      </div>
    </main>
  );
}
