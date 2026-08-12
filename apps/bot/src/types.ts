import type {
  ChatInputCommandInteraction,
  ClientEvents,
  Collection,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { KnoxRank } from "@knox/shared";
import type { GuildSettings } from "@knox/config";
import type { KnoxClient } from "./client.js";

export type SlashCommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder
  | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;

export type CommandContext = {
  client: KnoxClient;
  settings: GuildSettings | null;
};

export type KnoxCommand = {
  data: SlashCommandData;
  execute: (
    interaction: ChatInputCommandInteraction,
    ctx: CommandContext,
  ) => Promise<void>;
  requiredRank?: KnoxRank;
  guildOnly?: boolean;
  moduleId: string;
};

export type KnoxEvent<K extends keyof ClientEvents = keyof ClientEvents> = {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
};

/** Runtime event binding — keeps module arrays from fighting Discord's event union */
export type KnoxBoundEvent = {
  name: keyof ClientEvents;
  once?: boolean;
  execute: (...args: unknown[]) => Promise<void> | void;
};

export type KnoxModule = {
  id: string;
  name: string;
  description: string;
  defaultEnabled: boolean;
  commands: KnoxCommand[];
  events?: KnoxBoundEvent[];
  onLoad?: (client: KnoxClient) => Promise<void> | void;
  onUnload?: (client: KnoxClient) => Promise<void> | void;
};

export type PermissionRoleRow = {
  rank: KnoxRank;
  roleId: string;
};

export type CommandOverrideRow = {
  commandName: string;
  allowType: "role" | "user";
  allowId: string;
  effect: "allow" | "deny";
};

declare module "discord.js" {
  interface Client {
    commands: Collection<string, KnoxCommand>;
    modules: Map<string, KnoxModule>;
  }
}
