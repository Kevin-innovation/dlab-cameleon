import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "카멜론 — 몸에 색을 칠해 숨는다",
  description:
    "메챠 카멜레온 룰의 브라우저 숨바꼭질. 한국 서버 통합 룸에서 최대 8명이 술래와 카멜레온으로 나뉘어 위장하세요.",
  icons: { icon: "/mascot.jpg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
