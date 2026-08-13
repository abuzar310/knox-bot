import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knox",
  description:
    "Discord bot for music, moderation, levels, tickets, and server setup. Add Knox, then run /setup start and /help.",
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
