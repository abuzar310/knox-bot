import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Knox Dashboard",
  description: "Control panel for the Knox Discord master bot",
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
