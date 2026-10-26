import type { ButtonInteraction } from "discord.js";
import type { KnoxClient } from "../client.js";
import { AGENT_PREFIX, runPending } from "../lib/assistant/run.js";

export { AGENT_PREFIX };

/** Confirm / Cancel under an assistant plan that needed a second look */
export async function handleAssistantButton(interaction: ButtonInteraction, client: KnoxClient) {
  const guild = interaction.guild;
  const [, verb, id] = interaction.customId.slice(AGENT_PREFIX.length).match(/^(ok|no):([a-z0-9-]+)$/) ?? [];
  if (!guild || !verb || !id) return;
  const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
  const channel = interaction.channel;
  if (!member || !channel || !channel.isTextBased() || channel.isDMBased()) return;
  if (verb === "no") {
    const pending = client.assistantPending.get(id);
    if (pending && pending.userId !== member.id) {
      await interaction.reply({ content: "Only the person who asked can cancel this.", ephemeral: true });
      return;
    }
    client.assistantPending.delete(id);
    await interaction.update({ content: "Cancelled.", embeds: [], components: [] });
    return;
  }
  await interaction.deferUpdate();
  const result = await runPending(client, id, member, channel);
  if ("error" in result) {
    await interaction.followUp({ content: result.error, ephemeral: true });
    return;
  }
  await interaction.editReply({ embeds: result.embeds, components: [] });
}
