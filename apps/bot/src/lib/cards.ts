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

export type WelcomeCardInput = { user: User; displayName: string; guildName: string; memberCount: number; accent: string };

export async function renderWelcomeCard(input: WelcomeCardInput): Promise<Buffer | null> {
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
    ctx.fillStyle = input.accent;
    roundRect(ctx, 20, 20, W - 40, 8, 4);
    ctx.fill();

    const avatar = await avatarImage(canvas, input.user);
    drawAvatar(ctx, avatar, W / 2 - 70, 46, 140, input.accent);

    ctx.textAlign = "center";
    ctx.fillStyle = TEXT;
    ctx.font = `bold 42px ${FONT}`;
    ctx.fillText(fitText(ctx, `Welcome, ${input.displayName}!`, W - 120), W / 2, 240);
    ctx.fillStyle = MUTED;
    ctx.font = `24px ${FONT}`;
    ctx.fillText(fitText(ctx, `You're member #${input.memberCount.toLocaleString()} of ${input.guildName}`, W - 120), W / 2, 280);
    ctx.textAlign = "left";
    return await c.encode("png");
  } catch (err) {
    logger.debug({ err }, "welcome card failed");
    return null;
  }
}
