export type TemplateContext = {
  user: string;
  username: string;
  server: string;
  membercount: string;
  inviter: string;
  invites: string;
};

export function renderTemplate(template: string, ctx: TemplateContext): string {
  return template
    .replaceAll("{user}", ctx.user)
    .replaceAll("{username}", ctx.username)
    .replaceAll("{server}", ctx.server)
    .replaceAll("{membercount}", ctx.membercount)
    .replaceAll("{inviter}", ctx.inviter)
    .replaceAll("{invites}", ctx.invites);
}
