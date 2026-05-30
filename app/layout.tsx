import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小说 AI 翻译助手",
  description: "辅助小说翻译、术语记忆和风格记忆的 AI 工具",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}