import { TAG_RANGE, WHITE } from "./config";
import type { PaintBlob, Pose } from "./types";

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

/** Painted UV area of one stroke segment: a capsule of radius r along its length. */
function blobArea(blob: PaintBlob) {
  const length = Math.hypot((blob.tx ?? blob.x) - blob.x, (blob.ty ?? blob.y) - blob.y);
  return Math.min(0.12, (Math.PI * blob.r * blob.r + 2 * blob.r * length) * 1.6);
}

export function paintCoverage(fill: string, blobs: PaintBlob[]) {
  const base = fill.toLowerCase() !== WHITE.toLowerCase() ? 0.86 : 0.035;
  const parts = new Set(blobs.map((blob) => blob.part));
  const strokeArea = blobs.reduce((sum, blob) => sum + blobArea(blob), 0);
  return Math.max(0, Math.min(100, Math.round((base + parts.size * 0.018 + strokeArea * 0.18) * 100)));
}

function paintedColorMatch(fill: string, blobs: PaintBlob[], targetColor: string) {
  const baseWeight = fill.toLowerCase() !== WHITE.toLowerCase() ? 0.86 : 0.04;
  const strokeWeight = blobs.reduce((sum, blob) => sum + blobArea(blob), 0);
  if (strokeWeight <= 0) return colorMatch(fill, targetColor);
  const strokeMatch = blobs.reduce((sum, blob) => sum + colorMatch(blob.c, targetColor) * blobArea(blob), 0) / strokeWeight;
  return Math.round((colorMatch(fill, targetColor) * baseWeight + strokeMatch * strokeWeight) / (baseWeight + strokeWeight));
}

/** 0..1 how well the body's surface finish matches the sampled surface (undefined target = neutral). */
export function materialMatch(roughness: number | undefined, targetRoughness: number | undefined): number {
  if (roughness === undefined || targetRoughness === undefined) return 0.7;
  return Math.max(0, 1 - Math.abs(roughness - targetRoughness) / 0.6);
}

export function camouflageMeter(
  fill: string,
  blobs: PaintBlob[],
  targetColor: string,
  roughness?: number,
  targetRoughness?: number,
): CamouflageMeter {
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
  // Colour and coverage carry the score; a wrong finish (matte body on a glossy wall) costs up to 15%.
  const finish = materialMatch(roughness, targetRoughness);
  const score = Math.round(match * (0.25 + (coverage / 100) * 0.75) * (0.85 + 0.15 * finish));
  if (score >= 86) {
    return { score, colorMatch: match, coverage, label: "완벽한 위장", detail: "색과 칠한 범위가 모두 잘 맞습니다." };
  }
  if (score >= 68) {
    return { score, colorMatch: match, coverage, label: "좋은 위장", detail: "자세를 표면 형태에 맞추면 더 자연스럽습니다." };
  }
  if (score >= 42) {
    return {
      score,
      colorMatch: match,
      coverage,
      label: "조금 어색함",
      detail: finish < 0.5 ? "표면 광택이 안 맞습니다. 재질 슬라이더를 추천값에 맞추세요." : "추천 색을 적용하거나 빈 곳을 더 칠해 보세요.",
    };
  }
  return { score, colorMatch: match, coverage, label: "눈에 띔", detail: "표면 색과 몸 색의 차이가 큽니다." };
}

/**
 * How clearly a hunter sees a hider: 1 = fully visible, 0.24 = as faint as it gets.
 * `light` is the local brightness 0..1 (windows, fixtures); dark spots help, bright ones hurt.
 */
export function hunterVisibility(
  score: number | undefined,
  distance: number,
  pose: Pose = "stand",
  moving = false,
  light = 0.6,
) {
  const concealment = Math.max(0, Math.min(1, (score ?? 0) / 100));
  const distanceFactor = Math.max(0, Math.min(1, (distance - 1.5) / 7));
  const poseBonus = pose === "stick" || pose === "lie" || pose === "ball" ? 0.08 : 0;
  const motionPenalty = moving ? 0.16 : 0;
  const lightFactor = 0.85 + Math.max(0, Math.min(1, light)) * 0.3; // 0.85 (dark) .. 1.15 (bright)
  return Math.max(
    0.24,
    Math.min(1, (1 - concealment * Math.max(0, distanceFactor * 0.72 + poseBonus - motionPenalty)) * lightFactor),
  );
}

/** Local brightness from the room the point is in; 0.6 outside any declared room. */
export function lightLevelAt(map: { rooms?: { x: number; z: number; w: number; d: number; light?: number }[] }, x: number, z: number) {
  const room = map.rooms?.find((r) => x >= r.x && x <= r.x + r.w && z >= r.z && z <= r.z + r.d);
  return room?.light ?? 0.6;
}

export function tagRangeForCamouflage(score: number | undefined) {
  const concealment = Math.max(0, Math.min(1, (score ?? 0) / 100));
  return TAG_RANGE * (1 - concealment * 0.32);
}
