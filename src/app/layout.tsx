import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

// One typeface everywhere (lobby, HUD, panels); headings only differ by weight.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
  variable: "--font-noto",
});

export const metadata: Metadata = {
  title: "카멜론 — 몸에 색을 칠해 숨는다",
  description:
    "카멜론 룰의 브라우저 숨바꼭질. 한국 서버에서 방을 만들거나 골라 최대 8명이 술래와 카멜레온으로 나뉘어 위장하세요.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://playcamelon.vercel.app"),
  openGraph: {
    title: "카멜론 — 몸에 색을 칠해 숨는다",
    description: "최대 8명이 함께하는 브라우저 숨바꼭질. 몸을 칠하고 자세를 맞춰 술래를 속이세요.",
    images: [{ url: "/hero.jpg", width: 1280, height: 720, alt: "카멜론" }],
    locale: "ko_KR",
    type: "website",
  },
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
  // A zoomed page hides the bottom controls on phones (double-tap / pinch while playing).
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`h-full antialiased ${notoSansKr.variable}`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
