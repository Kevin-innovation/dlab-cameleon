"use client";

import dynamic from "next/dynamic";

const GameApp = dynamic(() => import("./GameApp"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center bg-[#0b100d] text-[#c6ff4a]">
      <div className="text-center">
        <div className="font-display text-4xl">카멜론</div>
        <p className="mt-2 text-sm text-white/60">로비 불러오는 중</p>
      </div>
    </div>
  ),
});

export default function ClientApp() {
  return <GameApp />;
}
