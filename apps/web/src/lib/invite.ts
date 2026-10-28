import { INVITE_PERMISSIONS } from "@knox/shared";

export function inviteUrl() {
  const clientId = process.env.DISCORD_CLIENT_ID ?? process.env.AUTH_DISCORD_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: INVITE_PERMISSIONS,
    scope: "bot applications.commands",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}
