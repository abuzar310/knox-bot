// Words a server blocks outright through Discord's own AutoMod (a Keyword rule), so they never post, whoever is
// online. The default list covers Hindi and Hinglish abuse, which Discord's built-in English word lists miss.
// Discord's wildcard rules: `*word*` matches inside other words, `word` only whole words, up to 60 characters each.

export const HINGLISH_ABUSE: readonly string[] = [
  "*madarch*",
  "*maderch*",
  "*madarcho*",
  "*bhench*",
  "*behench*",
  "*bhainch*",
  "*bhosdi*",
  "*bhosad*",
  "*bhosri*",
  "*bsdk*",
  "*chutiy*",
  "*chutia*",
  "*gandu*",
  "*gaandu*",
  "*gaand*",
  "*lavde*",
  "*lavda*",
  "*lode*",
  "*loda*",
  "*randi*",
  "*raand*",
  "*harami*",
  "*haramz*",
  "*jhaat*",
  "*jhant*",
  "*ki aulad*",
  "*teri maa ki*",
  "*teri maa ka*",
  "*teri behen ki*",
  "*teri bahen ki*",
  "*मादरचोद*",
  "*भेनचोद*",
  "*बहनचोद*",
  "*भोसड़ी*",
  "*भोसडी*",
  "*चूतिया*",
  "*चुतिया*",
  "*रंडी*",
  "*गांड*",
  "*हरामी*",
  "*हरामज़ाद*",
  "*की औलाद*",
  "*तेरी माँ की*",
  "*तेरी माँ का*",
];

export const BLOCKED_WORDS_RULE = "ZARU · Blocked words";
export const MAX_BLOCKED_WORDS = 1000;

/** lower-case, trimmed, deduplicated, each at most 60 characters (Discord's limit) */
export function normalizeWords(words: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of words) {
    const w = raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 60);
    if (w.replace(/\*/g, "").length >= 2) out.add(w);
  }
  return [...out].slice(0, MAX_BLOCKED_WORDS);
}
