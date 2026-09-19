import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "카멜론 — 몸에 색을 칠해 숨는다",
  description:
    "메챠 카멜레온 룰의 브라우저 숨바꼭질. 한국 서버에서 방을 만들거나 골라 최대 8명이 술래와 카멜레온으로 나뉘어 위장하세요.",
  icons: { icon: "/mascot.jpg" },
  appleWebApp: {
    capable: true,
    title: "카멜론",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0b100d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
