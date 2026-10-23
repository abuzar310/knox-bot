import type { ModalSubmitInteraction } from "discord.js";
import type { KnoxClient } from "../client.js";
import { APP_PREFIX, handleApplyModal } from "../modules/community/lib/applications.js";

/** every modal ZARU shows has a "knox:" custom id; this hands it to the feature that opened it */
export async function handleKnoxModal(interaction: ModalSubmitInteraction, client: KnoxClient) {
  if (interaction.customId.startsWith(APP_PREFIX)) {
    if (interaction.guildId) {
      const flags = (await client.guildConfig.get(interaction.guildId)).settings.moduleFlags;
      if (!flags.community) {
        await interaction.reply({ content: "The community module is off in this server.", ephemeral: true });
        return;
      }
    }
    await handleApplyModal(interaction, client);
    return;
  }
  await interaction.reply({ content: "ZARU doesn't know that form any more.", ephemeral: true }).catch(() => undefined);
}
