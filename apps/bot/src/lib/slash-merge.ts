import {
  ApplicationCommandOptionType,
  SlashCommandBuilder,
  SlashCommandSubcommandBuilder,
  SlashCommandSubcommandGroupBuilder,
  type APIApplicationCommandOption,
} from "discord.js";

export function applyLeafOptions(
  target: SlashCommandSubcommandBuilder,
  options: APIApplicationCommandOption[] | undefined,
) {
  for (const o of options ?? []) {
    if (o.type === ApplicationCommandOptionType.Subcommand || o.type === ApplicationCommandOptionType.SubcommandGroup) continue;
    if (o.type === ApplicationCommandOptionType.String) {
      target.addStringOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        if ("choices" in o && o.choices?.length) opt.addChoices(...o.choices.map((c) => ({ name: c.name, value: String(c.value) })));
        if ("max_length" in o && o.max_length) opt.setMaxLength(o.max_length);
        if ("min_length" in o && o.min_length) opt.setMinLength(o.min_length);
        return opt;
      });
    } else if (o.type === ApplicationCommandOptionType.Integer) {
      target.addIntegerOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        if ("min_value" in o && o.min_value != null) opt.setMinValue(o.min_value);
        if ("max_value" in o && o.max_value != null) opt.setMaxValue(o.max_value);
        return opt;
      });
    } else if (o.type === ApplicationCommandOptionType.Number) {
      target.addNumberOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        return opt;
      });
    } else if (o.type === ApplicationCommandOptionType.Boolean) {
      target.addBooleanOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        return opt;
      });
    } else if (o.type === ApplicationCommandOptionType.User) {
      target.addUserOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        return opt;
      });
    } else if (o.type === ApplicationCommandOptionType.Channel) {
      target.addChannelOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        if ("channel_types" in o && o.channel_types?.length) opt.addChannelTypes(...o.channel_types);
        return opt;
      });
    } else if (o.type === ApplicationCommandOptionType.Role) {
      target.addRoleOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        return opt;
      });
    } else if (o.type === ApplicationCommandOptionType.Attachment) {
      target.addAttachmentOption((opt) => {
        opt.setName(o.name).setDescription(o.description ?? o.name);
        if (o.required) opt.setRequired(true);
        return opt;
      });
    }
  }
}

/** Fold many top-level slash commands into one /music tree (saves Discord's 100-command cap). */
export function mergeIntoSubcommands(
  root: SlashCommandBuilder,
  commands: Array<{ data: { toJSON: () => { name: string; description: string; options?: APIApplicationCommandOption[]; default_member_permissions?: string | null } } }>,
) {
  for (const cmd of commands) {
    const j = cmd.data.toJSON();
    const subs = j.options?.filter((o) => o.type === ApplicationCommandOptionType.Subcommand) ?? [];
    const groups = j.options?.filter((o) => o.type === ApplicationCommandOptionType.SubcommandGroup) ?? [];
    if (groups.length) {
      root.addSubcommandGroup((grp) => {
        grp.setName(j.name).setDescription(j.description);
        for (const g of groups) {
          for (const sub of g.options?.filter((o) => o.type === ApplicationCommandOptionType.Subcommand) ?? []) {
            grp.addSubcommand((s) => {
              s.setName(sub.name).setDescription(sub.description ?? sub.name);
              applyLeafOptions(s, sub.options);
              return s;
            });
          }
        }
        return grp;
      });
      continue;
    }
    if (subs.length) {
      root.addSubcommandGroup((grp) => {
        grp.setName(j.name).setDescription(j.description);
        for (const sub of subs) {
          grp.addSubcommand((s) => {
            s.setName(sub.name).setDescription(sub.description ?? sub.name);
            applyLeafOptions(s, sub.options);
            return s;
          });
        }
        return grp;
      });
      continue;
    }
    root.addSubcommand((s) => {
      s.setName(j.name).setDescription(j.description);
      applyLeafOptions(s, j.options);
      return s;
    });
  }
  return root;
}
