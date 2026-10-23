// Readable nicknames: zalgo marks and look-alike letters are removed, symbol spam is trimmed, and a name with
// nothing left becomes a moderated placeholder. Letters of every script are kept, so Hindi or Arabic names stay.

const CONFUSABLES: Record<string, string> = {
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ԁ: "d", ѕ: "s", һ: "h", к: "k", т: "t", в: "b", н: "h", м: "m",
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", І: "I", Ј: "J", Ѕ: "S",
  α: "a", ε: "e", ι: "i", κ: "k", ν: "v", ο: "o", ρ: "p", τ: "t", υ: "u",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Χ: "X",
};

const COMBINING = /[̀-ͯ҃-҉᪰-᫿᷀-᷿⃐-⃿︠-︯]/gu;
const KEEP = /[\p{L}\p{N} _.'-]/u;

export function hasZalgo(name: string) {
  const marks = name.match(COMBINING)?.length ?? 0;
  return marks >= 3;
}

/** the name with marks, look-alikes and symbols removed; may be empty */
export function cleanName(input: string): string {
  const base = input.normalize("NFKD").replace(COMBINING, "");
  let out = "";
  for (const ch of base) out += KEEP.test(CONFUSABLES[ch] ?? ch) ? (CONFUSABLES[ch] ?? ch) : "";
  return out.replace(/\s+/g, " ").trim().slice(0, 32);
}

export function moderatedName(seed = Math.floor(Math.random() * 10_000)) {
  return `Moderated Nickname ${String(seed).padStart(4, "0")}`;
}

/** true when a name is unreadable enough to fix on its own: zalgo, mostly symbols, or nothing readable left */
export function shouldAutoClean(name: string) {
  if (hasZalgo(name)) return true;
  const cleaned = cleanName(name);
  if (cleaned.length < 2) return true;
  const readable = [...name].filter((ch) => /[\p{L}\p{N}]/u.test(ch)).length;
  return readable / Math.max(1, [...name].length) < 0.5;
}

/** what the member should be called instead, or null when the current name is fine */
export function fixedName(name: string, force = false): string | null {
  if (!force && !shouldAutoClean(name)) return null;
  const cleaned = cleanName(name);
  if (cleaned === name.trim()) return null;
  return cleaned.length >= 2 ? cleaned : moderatedName();
}
