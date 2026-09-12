import type { PaintBlob, PlayerSnap, Pose } from "./types";

export function poseSize(pose: Pose): { hw: number; hh: number } {
  switch (pose) {
    case "crouch":
      return { hw: 16, hh: 18 };
    case "sit":
      return { hw: 18, hh: 16 };
    case "lie":
      return { hw: 28, hh: 10 };
    case "stretch":
      return { hw: 9, hh: 32 };
    case "ball":
      return { hw: 15, hh: 15 };
    default:
      return { hw: 14, hh: 26 };
  }
}

export function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, "0")).join("")}`;
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
}

function blobPath(ctx: CanvasRenderingContext2D, pose: Pose) {
  ctx.beginPath();
  if (pose === "ball") {
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
  } else if (pose === "lie") {
    ctx.ellipse(0, 4, 28, 10, 0, 0, Math.PI * 2);
  } else if (pose === "stretch") {
    rr(ctx, -9, -32, 18, 64, 8);
  } else if (pose === "sit") {
    rr(ctx, -18, -8, 36, 24, 8);
    ctx.moveTo(6, -8);
    ctx.arc(0, -16, 10, 0, Math.PI * 2);
  } else if (pose === "crouch") {
    rr(ctx, -16, -6, 32, 24, 10);
    ctx.moveTo(2, -6);
    ctx.arc(0, -16, 10, 0, Math.PI * 2);
  } else {
    rr(ctx, -12, -8, 24, 30, 8);
    ctx.moveTo(2, -8);
    ctx.arc(0, -20, 10, 0, Math.PI * 2);
    rr(ctx, -20, -2, 10, 22, 5);
    rr(ctx, 10, -2, 10, 22, 5);
  }
}

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  p: PlayerSnap,
  opts: {
    isMe?: boolean;
    hunterLook?: boolean;
    ghost?: boolean;
    flash?: number;
    showName?: boolean;
  } = {},
) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.pose === "lie" ? p.dir * 0.15 : 0);
  ctx.globalAlpha = opts.ghost ? 0.28 : 1;

  ctx.save();
  blobPath(ctx, p.pose);
  ctx.clip();
  ctx.fillStyle = p.fill || "#f3f1ea";
  ctx.fillRect(-40, -40, 80, 80);
  for (const b of p.blobs) {
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (opts.hunterLook || opts.isMe) {
    ctx.lineWidth = opts.isMe ? 2.4 : 1.2;
    ctx.strokeStyle = opts.hunterLook ? "rgba(255,80,70,0.95)" : "rgba(255,255,255,0.55)";
    blobPath(ctx, p.pose);
    ctx.stroke();
  }

  if (opts.hunterLook) {
    ctx.fillStyle = "#e23b32";
    ctx.beginPath();
    ctx.moveTo(-11, -28);
    ctx.lineTo(0, -42);
    ctx.lineTo(11, -28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(-10, -24, 20, 7);
  }

  if (opts.flash && opts.flash > 0) {
    ctx.strokeStyle = `rgba(255,230,80,${opts.flash})`;
    ctx.lineWidth = 6;
    blobPath(ctx, p.pose);
    ctx.stroke();
  }

  ctx.restore();

  if (opts.isMe || opts.showName) {
    ctx.save();
    ctx.globalAlpha = opts.ghost ? 0.4 : 1;
    ctx.font = "700 12px sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.55)";
    ctx.fillStyle = opts.hunterLook ? "#ffd2cc" : "#fff6e8";
    ctx.strokeText(p.name, p.x, p.y - poseSize(p.pose).hh - 10);
    ctx.fillText(p.name, p.x, p.y - poseSize(p.pose).hh - 10);
    ctx.restore();
  }
}

export function drawPreview(
  ctx: CanvasRenderingContext2D,
  fill: string,
  blobs: PaintBlob[],
  pose: Pose,
) {
  const snap: PlayerSnap = {
    id: "me",
    name: "",
    ready: false,
    x: ctx.canvas.width / 2,
    y: ctx.canvas.height / 2 + 8,
    dir: 0,
    pose,
    fill,
    blobs,
    role: "hider",
    alive: true,
    vx: 0,
    vy: 0,
  };
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  ctx.translate(snap.x, snap.y);
  ctx.scale(2.2, 2.2);
  ctx.translate(-snap.x, -snap.y);
  drawCharacter(ctx, snap, { isMe: true });
  ctx.restore();
}

export function addBlob(
  blobs: PaintBlob[],
  x: number,
  y: number,
  r: number,
  c: string,
  max: number,
): PaintBlob[] {
  const next = [...blobs, { x, y, r, c }];
  if (next.length > max) next.splice(0, next.length - max);
  return next;
}
