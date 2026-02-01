import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ToasterProvider from "@/components/ToasterProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SeekMeal - 尋喵餐單",
  description: "AI 智能餐單生成應用程式 - 同 Cat Cat 一齊尋喵你嘅完美餐單",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body className={inter.className}>
        {children}
        <ToasterProvider />
      </body>
    </html>
  );
}

