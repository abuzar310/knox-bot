// Shared rule for every ZARU reply: server facts come from the input, everything else is said as unknown or as an opinion.

export const GROUNDED = [
  "RATIONAL RULE: Be exact. Ordinary knowledge (a capital, a game rule) is fine.",
  "For THIS server — channel names, categories, roles, who can see or send, member counts, cases, settings, commands — state only names and numbers written in the input.",
  "If a name or number is not written there, say you don't know. Do not guess, do not say probably, do not add 'etc.', 'and others', or example channels.",
  "One missing detail stays missing. Do not invent a story to make the answer sound complete.",
  "If the user describes what they see and the facts agree, agree with them. If the facts disagree, say what the facts show. Do not invent a third version.",
  "An opinion is allowed only when they asked what you think. An opinion must not smuggle in a server fact you were not given.",
].join(" ");

/** questions about the server or its people, where a creative answer is a lie */
export function looksFactual(text: string): boolean {
  return /\b(kitne|kitna|kaun|kahan|konsa|kaunsa|which|who|whose|how many|how much|channel|category|role|member|permission|dekh\w*|see|sees|seen|visible|hidden|command|case|warn|where|list|count)\b/i.test(text);
}
