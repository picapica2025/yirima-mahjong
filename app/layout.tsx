import type { Metadata } from "next";
import { headers } from "next/headers";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_TC({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const serif = Noto_Serif_TC({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["600", "700", "900"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "yique-mahjong-2026.ghwsocio918.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "一雀日麻｜四人线上东风战",
    description: "无需登录，建立房间并分享链接，四位朋友直接开始日麻东风战。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "一雀日麻｜四人线上东风战",
      description: "四人连线・即开即玩",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1000, height: 523, alt: "一雀日麻四人牌桌" }],
    },
    twitter: { card: "summary_large_image", title: "一雀日麻", description: "四人连线・即开即玩", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hans"><body className={`${sans.variable} ${serif.variable}`}>{children}</body></html>;
}
