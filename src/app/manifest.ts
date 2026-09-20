import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "카멜론 — 몸에 색을 칠해 숨는다",
    short_name: "카멜론",
    description: "최대 8명이 함께하는 브라우저 숨바꼭질 게임",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#0b100d",
    theme_color: "#0b100d",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
