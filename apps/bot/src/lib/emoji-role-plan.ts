// What a reaction should do to a member's roles. Modes follow Carl-bot: toggle, unique, verify, reversed, binding, temporary.

export type EmojiRoleMode = "toggle" | "unique" | "verify" | "reversed" | "binding" | "temporary";

export type RolePlan = { add: string[]; remove: string[]; dropReaction: boolean; error: string | null };

export function planEmojiRole(input: {
  mode: EmojiRoleMode;
  roleId: string;
  panelRoleIds: string[];
  memberRoleIds: string[];
  requiredRoleId: string | null;
  adding: boolean;
}): RolePlan {
  const has = input.memberRoleIds.includes(input.roleId);
  const empty = (error: string | null = null): RolePlan => ({ add: [], remove: [], dropReaction: Boolean(error), error });

  if (input.mode === "binding" && input.requiredRoleId && !input.memberRoleIds.includes(input.requiredRoleId)) {
    return { add: [], remove: [], dropReaction: true, error: "You need the required role before you can take this one." };
  }

  if (input.mode === "reversed") {
    if (input.adding) return has ? { add: [], remove: [input.roleId], dropReaction: false, error: null } : empty();
    return has ? empty() : { add: [input.roleId], remove: [], dropReaction: false, error: null };
  }

  if (!input.adding) {
    if (input.mode === "verify" || input.mode === "temporary") return empty();
    return has ? { add: [], remove: [input.roleId], dropReaction: false, error: null } : empty();
  }

  if (input.mode === "unique") {
    const remove = input.panelRoleIds.filter((id) => id !== input.roleId && input.memberRoleIds.includes(id));
    return { add: has ? [] : [input.roleId], remove, dropReaction: false, error: null };
  }

  if (input.mode === "verify" || input.mode === "temporary") {
    return { add: has ? [] : [input.roleId], remove: [], dropReaction: true, error: null };
  }

  return { add: has ? [] : [input.roleId], remove: [], dropReaction: false, error: null };
}
