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
  return chosen.slice(0, 1800);
}
