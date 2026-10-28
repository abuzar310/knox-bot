import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZARU Bot",
  description:
    "ZARU Bot for Discord: music, moderation, levels, tickets, and server setup. Add ZARU Bot, then run /setup start and /help.",
  icons: {
    icon: [
      { url: "/zaru.png", type: "image/png" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/zaru.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
