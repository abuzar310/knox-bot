import { SlashCommandBuilder } from "discord.js";
import type { KnoxCommand } from "../../../types.js";
import { knoxEmbed } from "../../../interactions/router.js";
import { countInvites, topInviters } from "../lib/invite-store.js";

export const invitesCommand: KnoxCommand = {
  moduleId: "community",
  guildOnly: true,
  data: new SlashCommandBuilder()
    .setName("invites")
    .setDescription("See who invited members, or the invite leaderboard")
    .addUserOption((o) =>
      o.setName("user").setDescription("Whose invites").setRequired(false),
    )
    .addBooleanOption((o) =>
      o.setName("top").setDescription("Show the leaderboard").setRequired(false),
    ),
  async execute(interaction, ctx) {
    if (!interaction.guild) return;
    const showTop = interaction.options.getBoolean("top") ?? false;

    if (showTop) {
      const rows = await topInviters(ctx.client.db, interaction.guild.id, 10);
      const lines = rows
        .filter((r) => r.inviterId && r.inviterId !== "vanity")
        .map((r, i) => `**${i + 1}.** <@${r.inviterId}> — **${r.n}**`);
      await interaction.reply({
        embeds: [
          knoxEmbed(ctx.settings?.embedColor)
            .setTitle("Invite leaderboard")
            .setDescription(lines.length ? lines.join("\n") : "No tracked invites yet."),
        ],
      });
      return;
    }

    const user = interaction.options.getUser("user") ?? interaction.user;
    const n = await countInvites(ctx.client.db, interaction.guild.id, user.id);
    await interaction.reply({
      embeds: [
        knoxEmbed(ctx.settings?.embedColor)
          .setTitle("Invites")
          .setDescription(`${user} has **${n}** tracked invite${n === 1 ? "" : "s"}.`),
      ],
    });
  },
};
