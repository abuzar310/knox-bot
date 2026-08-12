export const MODULE_IDS = [
  "core",
  "admin",
  "moderation",
  "gaming",
  "music",
  "levels",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export const DEFAULT_MODULE_FLAGS: Record<ModuleId, boolean> = {
  core: true,
  admin: true,
  moderation: true,
  gaming: false,
  music: false,
  levels: false,
};
