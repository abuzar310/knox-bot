import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZARU",
  description:
    "Discord bot for music, moderation, levels, tickets, and server setup. Add ZARU, then run /setup start and /help.",
  icons: {
    icon: [
      { url: "/zaru.svg", type: "image/svg+xml" },
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
