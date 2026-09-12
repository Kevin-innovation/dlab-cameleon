import type { Metadata } from "next";
import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const noto = Noto_Sans_KR({
  variable: "--font-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

const display = Black_Han_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "카멜론 — 몸에 색을 칠해 숨는다",
  description:
    "메챠 카멜레온 룰의 브라우저 숨바꼭질. 닉네임을 정하고 서버와 방을 고른 뒤, 술래와 카멜레온으로 나뉘어 위장하세요. DB 없이 Vercel 배포.",
  icons: { icon: "/mascot.jpg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${noto.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
