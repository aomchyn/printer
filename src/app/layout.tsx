import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import SessionExpiryGuard from "./SessionExpiryGuard";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Printer OP - Management System",
  description: "Internal management system for Printer OP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <SessionExpiryGuard />
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
