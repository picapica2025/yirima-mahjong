import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "yique-mahjong-2026.ghwsocio918.chatgpt.site";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    title: "谐不压怔！一日麻！",
    description: "杨振山快来，就等你来玩了！无需登录，四位朋友直接开始日麻东风战。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "谐不压怔！一日麻！",
      description: "杨振山快来，就等你来玩了！",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1000, height: 523, alt: "谐不压怔！一日麻！四人牌桌" }],
    },
    twitter: { card: "summary_large_image", title: "谐不压怔！一日麻！", description: "杨振山快来，就等你来玩了！", images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hans"><body>{children}</body></html>;
}
