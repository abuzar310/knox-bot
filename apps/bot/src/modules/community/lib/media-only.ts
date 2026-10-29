const LINK = /https?:\/\/\S+/i;

/** pictures, clips, stickers, and links stay; plain text does not */
export function allowsMediaOnlyPost(input: { content: string; attachments: number; stickers: number }): boolean {
  if (input.attachments > 0 || input.stickers > 0) return true;
  return LINK.test(input.content);
}
