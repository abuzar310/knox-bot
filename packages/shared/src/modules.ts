export const MODULE_IDS = [
  "core",
  "admin",
  "moderation",
  "community",
  "gaming",
  "music",
  "levels",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const DEFAULT_MODULE_FLAGS: Record<ModuleId, boolean> = {
  core: true,
  admin: true,
  moderation: true,
  community: true,
  gaming: false,
  music: false,
  levels: false,
};
