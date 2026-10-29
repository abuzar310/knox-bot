// Variables inside a saved tag. {choose:a|b} picks one at random. Nothing here runs code.

export type TagContext = {
  user: string;
  username: string;
  server: string;
  channel: string;
  memberCount: string;
  args: string;
};

export function renderTag(template: string, ctx: TagContext, pick = Math.random): string {
  const filled = template
    .replaceAll("{user}", ctx.user)
    .replaceAll("{username}", ctx.username)
    .replaceAll("{server}", ctx.server)
    .replaceAll("{channel}", ctx.channel)
    .replaceAll("{membercount}", ctx.memberCount)
    .replaceAll("{args}", ctx.args);
  const chosen = filled.replace(/\{choose:([^{}]+)\}/g, (_match, body: string) => {
    const parts = body.split("|").map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return "";
    const index = Math.min(parts.length - 1, Math.floor(pick() * parts.length));
    return parts[index] ?? "";
  });
  const shaped = chosen
    .replace(/\{upper:([^{}]*)\}/g, (_match, body: string) => body.toUpperCase())
    .replace(/\{lower:([^{}]*)\}/g, (_match, body: string) => body.toLowerCase())
    .replace(/\{range:(\d+)-(\d+)\}/g, (_match, low: string, high: string) => {
      const start = Number(low);
      const end = Number(high);
      if (end < start || end - start > 1_000_000) return low;
      return String(start + Math.floor(pick() * (end - start + 1)));
    });
  return shaped.slice(0, 1800);
}
