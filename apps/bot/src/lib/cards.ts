// Rank and welcome cards drawn with @napi-rs/canvas. The module is loaded lazily and failures fall back to null, so
// a host without the native binary (or a slow avatar CDN) still gets the text version instead of an error.
import type { User } from "discord.js";
import { logger } from "../logger.js";

type CanvasModule = typeof import("@napi-rs/canvas");
type Ctx = import("@napi-rs/canvas").SKRSContext2D;

let canvasModule: Promise<CanvasModule | null> | null = null;

export function loadCanvas(): Promise<CanvasModule | null> {
  canvasModule ??= import("@napi-rs/canvas").then(
    (m) => m,
    (err) => {
      logger.warn({ err }, "canvas unavailable: cards fall back to text");
      return null;
    },
  );
  return canvasModule;
}

const FONT = "'Segoe UI', 'DejaVu Sans', Arial, sans-serif";
const BG = "#15171c";
const PANEL = "#1f2229";
const MUTED = "#9aa0ab";
const TEXT = "#f4f5f7";

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx: Ctx, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

async function avatarImage(canvas: CanvasModule, user: User) {
  const url = user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
  const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
  if (!res.ok) throw new Error(`avatar ${res.status}`);
  return canvas.loadImage(Buffer.from(await res.arrayBuffer()));
}

function drawAvatar(ctx: Ctx, image: import("@napi-rs/canvas").Image, x: number, y: number, size: number, ring: string) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 + 5, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

export type RankCardInput = {
  user: User;
  displayName: string;
  level: number;
  xp: number;
  /** xp where the current level started and where the next one begins */
  levelStartXp: number;
  nextLevelXp: number;
  position: number;
  voiceTime: string;
  accent: string;
};

export async function renderRankCard(input: RankCardInput): Promise<Buffer | null> {
  const canvas = await loadCanvas();
  if (!canvas) return null;
  try {
    const W = 900;
    const H = 260;
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = BG;
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.fill();
    ctx.fillStyle = PANEL;
    roundRect(ctx, 20, 20, W - 40, H - 40, 22);
    ctx.fill();

    const avatar = await avatarImage(canvas, input.user);
    drawAvatar(ctx, avatar, 44, 50, 160, input.accent);

    ctx.fillStyle = TEXT;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText(fitText(ctx, input.displayName, 420), 240, 92);
    ctx.fillStyle = MUTED;
    ctx.font = `22px ${FONT}`;
    ctx.fillText(fitText(ctx, `@${input.user.username} · voice ${input.voiceTime}`, 440), 240, 126);

    ctx.textAlign = "right";
    ctx.fillStyle = input.accent;
    ctx.font = `bold 44px ${FONT}`;
    ctx.fillText(`LEVEL ${input.level}`, W - 48, 86);
    ctx.fillStyle = MUTED;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`#${input.position}`, W - 48, 122);
    ctx.textAlign = "left";

    const span = Math.max(1, input.nextLevelXp - input.levelStartXp);
    const fraction = Math.min(1, Math.max(0, (input.xp - input.levelStartXp) / span));
    const barX = 240;
    const barY = 170;
    const barW = W - barX - 48;
    const barH = 30;
    ctx.fillStyle = "#2b2f38";
    roundRect(ctx, barX, barY, barW, barH, 15);
    ctx.fill();
    if (fraction > 0) {
      ctx.fillStyle = input.accent;
      roundRect(ctx, barX, barY, Math.max(barH, barW * fraction), barH, 15);
      ctx.fill();
    }
    ctx.fillStyle = MUTED;
    ctx.font = `20px ${FONT}`;
    ctx.fillText(`${input.xp.toLocaleString()} / ${input.nextLevelXp.toLocaleString()} XP`, barX, barY + 56);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(fraction * 100)}% to level ${input.level + 1}`, barX + barW, barY + 56);
    ctx.textAlign = "left";
    return await c.encode("png");
  } catch (err) {
    logger.debug({ err }, "rank card failed");
    return null;
  }
}

export type ProfileCardInput = {
  user: User;
  displayName: string;
  level: number;
  xp: number;
  levelStartXp: number;
  nextLevelXp: number;
  position: number;
  coins: number;
  rep: number;
  currency: string;
  joined: string;
  accent: string;
};

/** an original ZARU profile card: avatar, name, level/rank, coins + rep stat tiles, and an XP bar */
export async function renderProfileCard(input: ProfileCardInput): Promise<Buffer | null> {
  const canvas = await loadCanvas();
  if (!canvas) return null;
  try {
    const W = 900;
    const H = 320;
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext("2d");
    ctx.fillStyle = BG;
    roundRect(ctx, 0, 0, W, H, 28);
    ctx.fill();
    ctx.fillStyle = PANEL;
    roundRect(ctx, 20, 20, W - 40, H - 40, 22);
    ctx.fill();
    // accent stripe along the top of the panel
    ctx.fillStyle = input.accent;
    roundRect(ctx, 20, 20, W - 40, 8, 4);
    ctx.fill();

    const avatar = await avatarImage(canvas, input.user);
    drawAvatar(ctx, avatar, 44, 56, 150, input.accent);

    ctx.fillStyle = TEXT;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText(fitText(ctx, input.displayName, 400), 220, 96);
    ctx.fillStyle = MUTED;
    ctx.font = `22px ${FONT}`;
    ctx.fillText(fitText(ctx, `@${input.user.username} · joined ${input.joined}`, 450), 220, 128);

    ctx.textAlign = "right";
    ctx.fillStyle = input.accent;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText(`LEVEL ${input.level}`, W - 48, 92);
    ctx.fillStyle = MUTED;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(`rank #${input.position}`, W - 48, 126);
    ctx.textAlign = "left";

    // stat tiles: coins and rep
    const tile = (x: number, w: number, label: string, value: string) => {
      ctx.fillStyle = "#2b2f38";
      roundRect(ctx, x, 158, w, 64, 14);
      ctx.fill();
      ctx.fillStyle = MUTED;
      ctx.font = `18px ${FONT}`;
      ctx.fillText(label, x + 16, 184);
      ctx.fillStyle = TEXT;
      ctx.font = `bold 26px ${FONT}`;
      ctx.fillText(fitText(ctx, value, w - 32), x + 16, 212);
    };
    tile(220, 320, "COINS", `${input.coins.toLocaleString()} ${input.currency}`);
    tile(556, 296, "REP", `${input.rep.toLocaleString()} ⭐`);

    // XP bar
    const span = Math.max(1, input.nextLevelXp - input.levelStartXp);
    const fraction = Math.min(1, Math.max(0, (input.xp - input.levelStartXp) / span));
    const barX = 220;
    const barY = 244;
    const barW = W - barX - 48;
    const barH = 26;
    ctx.fillStyle = "#2b2f38";
    roundRect(ctx, barX, barY, barW, barH, 13);
    ctx.fill();
    if (fraction > 0) {
      ctx.fillStyle = input.accent;
      roundRect(ctx, barX, barY, Math.max(barH, barW * fraction), barH, 13);
      ctx.fill();
    }
    ctx.fillStyle = MUTED;
    ctx.font = `18px ${FONT}`;
    ctx.fillText(`${input.xp.toLocaleString()} / ${input.nextLevelXp.toLocaleString()} XP`, barX, barY + 48);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.round(fraction * 100)}% to level ${input.level + 1}`, barX + barW, barY + 48);
    ctx.textAlign = "left";
    return await c.encode("png");
  } catch (err) {
    logger.debug({ err }, "profile card failed");
    return null;
  }
}

/** 42 → 42nd, the way Welcomer writes the member number */
export function memberOrdinal(n: number): string {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n.toLocaleString()}${suffix}`;
}

export type WelcomeCardInput = {
  user: User;
  displayName: string;
  guildName: string;
  memberCount: number;
  accent: string;
  backgroundUrl?: string | null;
  heading?: string | null;
  subtitle?: string | null;
  avatarSide?: "left" | "right";
  overlay?: number;
};

async function coverBackground(canvas: CanvasModule, ctx: Ctx, url: string, width: number, height: number, overlay: number) {
  if (!url.startsWith("https://")) return false;
  const res = await fetch(url, { signal: AbortSignal.timeout(6_000) }).catch(() => null);
  if (!res?.ok) return false;
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 32 || bytes.length > 4_000_000) return false;
  const image = await canvas.loadImage(bytes).catch(() => null);
  if (!image) return false;
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  const darkness = Math.min(80, Math.max(0, overlay)) / 100;
  ctx.fillStyle = `rgba(10, 12, 16, ${darkness})`;
  ctx.fillRect(0, 0, width, height);
  return true;
}

export async function renderWelcomeCard(input: WelcomeCardInput): Promise<Buffer | null> {
  const canvas = await loadCanvas();
  if (!canvas) return null;
  try {
    const W = 1000;
    const H = 360;
    const c = canvas.createCanvas(W, H);
    const ctx = c.getContext("2d");
    const painted = input.backgroundUrl ? await coverBackground(canvas, ctx, input.backgroundUrl, W, H, input.overlay ?? 55) : false;
    if (!painted) {
      const gradient = ctx.createLinearGradient(0, 0, W, H);
      gradient.addColorStop(0, "#12141a");
      gradient.addColorStop(1, "#1c2433");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = input.accent;
    ctx.fillRect(0, 0, 14, H);

    const avatarOnRight = input.avatarSide === "right";
    const avatarX = avatarOnRight ? W - 270 : 70;
    const textX = avatarOnRight ? 70 : 320;
    const avatar = await avatarImage(canvas, input.user);
    drawAvatar(ctx, avatar, avatarX, 80, 200, input.accent);

    ctx.textAlign = "left";
    ctx.fillStyle = input.accent;
    ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(fitText(ctx, (input.heading || "WELCOME").slice(0, 24), 620), textX, 120);
    ctx.fillStyle = TEXT;
    ctx.font = `bold 52px ${FONT}`;
    ctx.fillText(fitText(ctx, input.displayName, 620), textX, 185);
    ctx.fillStyle = MUTED;
    ctx.font = `28px ${FONT}`;
    const subtitle = (input.subtitle || `You are the ${memberOrdinal(input.memberCount)} member`).replaceAll("{count}", memberOrdinal(input.memberCount));
    ctx.fillText(fitText(ctx, subtitle, 620), textX, 235);
    ctx.font = `24px ${FONT}`;
    ctx.fillText(fitText(ctx, input.guildName, 620), textX, 280);
    return await c.encode("png");
  } catch (err) {
    logger.debug({ err }, "welcome card failed");
    return null;
  }
}
