import { WHITE } from "./config";
import type { PaintBlob } from "./types";

export type CamouflageMeter = {
  score: number | null;
  colorMatch: number;
  coverage: number;
  label: string;
  detail: string;
};

function rgb(hex: string) {
  const value = hex.trim().replace(/^#/, "");
  const normalized = value.length === 3 ? value.split("").map((v) => `${v}${v}`).join("") : value;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16));
}

export function colorMatch(a: string, b: string) {
  const left = rgb(a);
  const right = rgb(b);
  if (!left || !right) return 0;
  const distance = Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
  const maxDistance = Math.sqrt(3 * 255 ** 2);
  return Math.max(0, Math.min(100, Math.round((1 - distance / maxDistance) * 100)));
}

export function paintCoverage(fill: string, blobs: PaintBlob[]) {
  const base = fill.toLowerCase() !== WHITE.toLowerCase() ? 0.86 : 0.035;
  const parts = new Set(blobs.map((blob) => blob.part));
  const strokeArea = blobs.reduce((sum, blob) => sum + Math.min(0.12, Math.PI * blob.r * blob.r * 1.6), 0);
  return Math.max(0, Math.min(100, Math.round((base + parts.size * 0.018 + strokeArea * 0.18) * 100)));
}

function paintedColorMatch(fill: string, blobs: PaintBlob[], targetColor: string) {
  const baseWeight = fill.toLowerCase() !== WHITE.toLowerCase() ? 0.86 : 0.04;
  const strokeWeight = blobs.reduce((sum, blob) => sum + Math.min(0.12, Math.PI * blob.r * blob.r * 1.6), 0);
  if (strokeWeight <= 0) return colorMatch(fill, targetColor);
  const strokeMatch = blobs.reduce((sum, blob) => {
    const weight = Math.min(0.12, Math.PI * blob.r * blob.r * 1.6);
    return sum + colorMatch(blob.c, targetColor) * weight;
  }, 0) / strokeWeight;
  return Math.round((colorMatch(fill, targetColor) * baseWeight + strokeMatch * strokeWeight) / (baseWeight + strokeWeight));
}

export function camouflageMeter(fill: string, blobs: PaintBlob[], targetColor: string): CamouflageMeter {
  if (!targetColor) {
    return {
      score: null,
      colorMatch: 0,
      coverage: paintCoverage(fill, blobs),
      label: "색을 먼저 찍어 보세요",
      detail: "스포이드로 숨을 표면을 클릭하면 위장도를 계산합니다.",
    };
  }
  const match = paintedColorMatch(fill, blobs, targetColor);
  const coverage = paintCoverage(fill, blobs);
  const score = Math.round(match * (0.25 + coverage / 100 * 0.75));
  if (score >= 86) {
    return { score, colorMatch: match, coverage, label: "완벽한 위장", detail: "색과 칠한 범위가 모두 잘 맞습니다." };
  }
  if (score >= 68) {
    return { score, colorMatch: match, coverage, label: "좋은 위장", detail: "자세를 표면 형태에 맞추면 더 자연스럽습니다." };
  }
  if (score >= 42) {
    return { score, colorMatch: match, coverage, label: "조금 어색함", detail: "추천 색을 적용하거나 빈 곳을 더 칠해 보세요." };
  }
  return { score, colorMatch: match, coverage, label: "눈에 띔", detail: "표면 색과 몸 색의 차이가 큽니다." };
}
