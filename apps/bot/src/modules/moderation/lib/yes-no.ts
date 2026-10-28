import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from "discord.js";
import { knoxEmbed } from "../../../interactions/embed.js";

export const MOD_YESNO_PREFIX = "knox:modyn:";

type Pending = {
  userId: string;
  expires: number;
  run: () => Promise<Pick<InteractionReplyOptions, "content" | "embeds">>;
};

const pending = new Map<string, Pending>();
const TTL_MS = 2 * 60_000;

/** show Yes / No before an irreversible kick, ban, mute, purge, etc. */
export async function askYesNo(
  interaction: ChatInputCommandInteraction,
  question: string,
  run: Pending["run"],
  color?: string,
) {
  const id = randomUUID().slice(0, 8);
  pending.set(id, { userId: interaction.user.id, expires: Date.now() + TTL_MS, run });
  await interaction.reply({
    embeds: [
      knoxEmbed(color)
        .setTitle("Should I do it?")
        .setDescription(`${question}\n\n**This cannot be undone.** Yes or no?`)
        .setFooter({ text: "Only you can answer · expires in 2 minutes" }),
    ],
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`${MOD_YESNO_PREFIX}ok:${id}`).setLabel("Yes").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`${MOD_YESNO_PREFIX}no:${id}`).setLabel("No").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
}

export async function handleModYesNo(interaction: ButtonInteraction) {
  const [, verb, id] = interaction.customId.slice(MOD_YESNO_PREFIX.length).match(/^(ok|no):([a-z0-9-]+)$/) ?? [];
  if (!verb || !id) return;
  const job = pending.get(id);
  if (!job || job.expires < Date.now()) {
    pending.delete(id);
    await interaction.reply({ content: "That expired. Run the command again.", ephemeral: true });
    return;
  }
  if (job.userId !== interaction.user.id) {
    await interaction.reply({ content: "Only the person who asked can answer.", ephemeral: true });
    return;
  }
  pending.delete(id);
  if (verb === "no") {
    await interaction.update({ content: "No. I won't do it.", embeds: [], components: [] });
    return;
  }
  await interaction.deferUpdate();
  try {
    const result = await job.run();
    await interaction.editReply({ ...result, components: [] });
  } catch (err) {
    await interaction.editReply({
      content: err instanceof Error ? err.message : "That failed.",
      embeds: [],
      components: [],
    });
  }
}
