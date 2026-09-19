"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hexToHsv, hsvToHex, normalizeHex, type Hsv } from "@/lib/color";

const SV_SIZE = 148;
const HUE_HEIGHT = 12;

interface ColorWheelProps {
  value: string;
  onChange: (hex: string) => void;
  recent: readonly string[];
}

/**
 * HSV picker: saturation/value square + hue strip + hex field + recent swatches.
 * Pointer drags update continuously; keyboard users get the native colour input as fallback.
 */
export const ColorWheel = memo(function ColorWheel({ value, onChange, recent }: ColorWheelProps) {
  const svRef = useRef<HTMLCanvasElement>(null);
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [hexDraft, setHexDraft] = useState(value);

  // External changes (dropper, recent swatch) win over the local drag state.
  useEffect(() => {
    const next = hexToHsv(value);
    setHsv((cur) => (hsvToHex(cur) === value ? cur : { ...next, h: next.s === 0 ? cur.h : next.h }));
    setHexDraft(value);
  }, [value]);

  const hueHex = useMemo(() => hsvToHex({ h: hsv.h, s: 1, v: 1 }), [hsv.h]);

  useEffect(() => {
    const canvas = svRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = hueHex;
    ctx.fillRect(0, 0, SV_SIZE, SV_SIZE);
    const white = ctx.createLinearGradient(0, 0, SV_SIZE, 0);
    white.addColorStop(0, "rgba(255,255,255,1)");
    white.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, SV_SIZE, SV_SIZE);
    const black = ctx.createLinearGradient(0, 0, 0, SV_SIZE);
    black.addColorStop(0, "rgba(0,0,0,0)");
    black.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, SV_SIZE, SV_SIZE);
  }, [hueHex]);

  const commit = useCallback(
    (next: Hsv) => {
      setHsv(next);
      onChange(hsvToHex(next));
    },
    [onChange],
  );

  const dragSv = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const v = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      commit({ h: hsv.h, s, v });
    },
    [commit, hsv.h],
  );

  const dragHue = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const h = Math.max(0, Math.min(359.9, ((e.clientX - rect.left) / rect.width) * 360));
      commit({ ...hsv, h });
    },
    [commit, hsv],
  );

  const startDrag = <T extends HTMLElement>(move: (e: React.PointerEvent<T>) => void) => (e: React.PointerEvent<T>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    move(e);
  };
  const whileDragging = <T extends HTMLElement>(move: (e: React.PointerEvent<T>) => void) => (e: React.PointerEvent<T>) => {
    if (e.buttons & 1) move(e);
  };

  return (
    <div className="mt-2 select-none" role="group" aria-label="색 선택">
      <canvas
        ref={svRef}
        width={SV_SIZE}
        height={SV_SIZE}
        aria-label="채도·명도"
        className="relative w-full cursor-crosshair rounded-lg touch-none"
        style={{ aspectRatio: "5 / 3", height: "auto" }}
        onPointerDown={startDrag(dragSv)}
        onPointerMove={whileDragging(dragSv)}
      />
      <div
        className="relative mt-1.5 cursor-pointer rounded-full touch-none"
        style={{
          height: HUE_HEIGHT,
          background: "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
        }}
        role="slider"
        aria-label="색상"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        tabIndex={0}
        onPointerDown={startDrag(dragHue)}
        onPointerMove={whileDragging(dragHue)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") commit({ ...hsv, h: (hsv.h + 354) % 360 });
          if (e.key === "ArrowRight") commit({ ...hsv, h: (hsv.h + 6) % 360 });
        }}
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black/60 bg-white"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="h-6 w-6 shrink-0 rounded-md border border-white/25" style={{ backgroundColor: value }} aria-hidden="true" />
        <input
          type="text"
          name="paintHex"
          autoComplete="off"
          spellCheck={false}
          aria-label="색 코드"
          value={hexDraft}
          onChange={(e) => {
            setHexDraft(e.target.value);
            const clean = normalizeHex(e.target.value);
            if (clean) onChange(clean);
          }}
          onBlur={() => setHexDraft(value)}
          className="w-full rounded-md bg-black/40 px-2 py-1 font-mono text-[11px] text-white/90"
        />
        <input
          type="color"
          name="paintColor"
          autoComplete="off"
          aria-label="시스템 색 선택"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-8 shrink-0 cursor-pointer bg-transparent"
        />
      </div>
      {recent.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="최근 색">
          {recent.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`최근 색 ${c}`}
              aria-pressed={c === value}
              onClick={() => onChange(c)}
              className={`h-5 w-5 rounded-md border ${c === value ? "border-lime" : "border-white/20"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
});
