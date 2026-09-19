"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { MAX_PLAYERS } from "@/lib/config";

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

export function Home({ nick, setNick, error, notice, rejoinCode, onRejoin, onEnter, onPractice }: HomeProps) {
  const nicknameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error) nicknameRef.current?.focus();
  }, [error]);

  return (
    <main id="main-content" className="flex flex-1 flex-col items-start justify-center gap-8 py-10 md:flex-row md:items-center md:justify-between">
      <div className="max-w-xl">
        <p className="text-sm text-lime">IO 숨바꼭질 · 페인트 위장</p>
        <h1 className="text-wrap-balance mt-2 font-display text-5xl leading-tight md:text-7xl">
          흰 몸으로 들어가
          <br />
          배경이 되어 나와라
        </h1>
        <p className="mt-4 text-base text-white/75">
          닉네임을 정하고 한국 서버의 방 목록에서 들어갈 방을 고르거나 직접 방을 만드세요. 한 방에 최대 {MAX_PLAYERS}명이
          모여 라운드마다 술래와 카멜레온으로 나뉩니다. 배경에서 색을 찍고, 몸을 칠하고, 자세를 맞춰 술래의 눈을 속이세요.
        </p>
        {notice && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-pink/40 bg-pink/10 px-4 py-3 text-sm text-pink" role="status">
            <span>{notice}</span>
            {rejoinCode && (
              <button type="button" onClick={onRejoin} className="rounded-full bg-pink px-3 py-1 text-xs font-semibold text-black">
                {rejoinCode} 방으로 다시 입장
              </button>
            )}
          </div>
        )}
        <form
          className="mt-8 flex w-full max-w-md flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onEnter();
          }}
        >
          <label htmlFor="nickname" className="text-xs tracking-wide text-white/60">
            닉네임
          </label>
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
            placeholder="예: 초록커튼…"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "nickname-error" : undefined}
            className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-lg outline-none ring-lime/40 focus-visible:ring-2"
          />
          {error && (
            <p id="nickname-error" className="text-sm text-pink" aria-live="polite">
              {error}
            </p>
          )}
          <button type="submit" className="rounded-full bg-lime py-3 font-display text-xl text-black">
            한국 서버 입장
          </button>
          <button type="button" onClick={onPractice} className="rounded-full border border-white/20 py-3 text-sm">
            AI와 플레이 (나 + AI 7인)
          </button>
        </form>
      </div>
      <Image
        src="/mascot.jpg"
        alt="카멜론"
        width={288}
        height={288}
        priority
        className="mx-auto h-56 w-56 rounded-[2.2rem] object-cover shadow-2xl ring-4 ring-lime/30 md:h-72 md:w-72"
      />
    </main>
  );
}
