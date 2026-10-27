export const DEFAULT_PREFIX = "?";

export function normalizePrefix(raw: string): string | null {
  const prefix = raw.trim();
  if (prefix.length < 1 || prefix.length > 8) return null;
  if (/\s/.test(prefix)) return null;
  if (prefix === "/") return null;
  return prefix;
}

export function tokenize(rest: string): string[] {
  return rest.match(/<@!?\d+>|<@&\d+>|<#\d+>|"[^"]+"|[^\s]+/g) ?? [];
}

export function matchPrefix(
  content: string,
  prefix: string,
  mentionIds: string[],
): { rest: string } | null {
  const trimmed = content.trimStart();
  const prefixes = [...new Set([prefix, "?"].filter(Boolean))].sort((a, b) => b.length - a.length);
  for (const mark of prefixes) {
    if (trimmed.startsWith(mark)) {
      return { rest: trimmed.slice(mark.length).trimStart() };
    }
  }
  for (const id of mentionIds) {
    const marks = [`<@${id}>`, `<@!${id}>`];
    for (const mark of marks) {
      if (trimmed.startsWith(mark)) {
        return { rest: trimmed.slice(mark.length).trimStart() };
      }
    }
  }
  return null;
}

type JsonOption = {
  name: string;
  type: number;
  required?: boolean;
  options?: JsonOption[];
};

export type ParsedPrefixArgs = {
  subcommand: string | null;
  group: string | null;
  values: Map<string, string>;
  missing: string | null;
};

const STRING = 3;
const INTEGER = 4;
const BOOLEAN = 5;
const USER = 6;
const CHANNEL = 7;
const ROLE = 8;
const MENTIONABLE = 9;
const NUMBER = 10;
const ATTACHMENT = 11;
const SUB = 1;
const GROUP = 2;

function stripQuotes(token: string) {
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    return token.slice(1, -1);
  }
  return token;
}

function mentionId(token: string): string | null {
  const m = token.match(/^<@!?(\d+)>$|^<@&(\d+)>$|^<#(\d+)>$|^(\d{17,20})$/);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? m[4] ?? null;
}

/** turn one raw token into the stored string for an option, or null when it doesn't fit the option's type */
function coerceOption(opt: JsonOption, rawValue: string): string | null {
  const v = stripQuotes(rawValue);
  if (opt.type === USER || opt.type === MENTIONABLE || opt.type === CHANNEL || opt.type === ROLE) {
    return mentionId(v);
  }
  if (opt.type === INTEGER || opt.type === NUMBER) {
    return /^-?\d+(\.\d+)?$/.test(v) ? v : null;
  }
  if (opt.type === BOOLEAN) {
    const low = v.toLowerCase();
    if (!["true", "false", "yes", "no", "on", "off", "1", "0"].includes(low)) return null;
    return ["true", "yes", "on", "1"].includes(low) ? "true" : "false";
  }
  return v;
}

export function parsePrefixArgs(
  options: JsonOption[] | undefined,
  tokens: string[],
): ParsedPrefixArgs {
  const values = new Map<string, string>();
  let i = 0;
  let list = options ?? [];
  let subcommand: string | null = null;
  let groupName: string | null = null;

  if (list.some((o) => o.type === GROUP) && tokens[i]) {
    const group = list.find((o) => o.type === GROUP && o.name === tokens[i]?.toLowerCase());
    if (group) {
      groupName = group.name;
      i += 1;
      list = group.options ?? [];
    }
  }
  if (list.some((o) => o.type === SUB) && tokens[i]) {
    const sub = list.find((o) => o.type === SUB && o.name === tokens[i]?.toLowerCase());
    if (sub) {
      subcommand = sub.name;
      i += 1;
      list = sub.options ?? [];
    } else if (list.every((o) => o.type === SUB)) {
      return { subcommand: null, group: groupName, values, missing: list.map((o) => o.name).join("|") };
    }
  }

  // attachments come from the message itself, never typed tokens
  const leaf = list.filter((o) => o.type !== SUB && o.type !== GROUP && o.type !== ATTACHMENT);
  const byName = new Map(leaf.map((o) => [o.name.toLowerCase(), o] as const));

  // first pull out NAMED arguments: tokens like "name:value" or "name=value" where name is a real option. This lets
  // "eco config chat_money_min:5 chat_money_max:15" set just those, without typing every option that comes before them.
  const positional: string[] = [];
  const named = new Set<string>();
  for (const token of tokens.slice(i)) {
    const m = token.match(/^([a-zA-Z][a-zA-Z0-9_-]*)[:=]([\s\S]+)$/);
    const opt = m ? byName.get(m[1]!.toLowerCase()) : undefined;
    if (m && opt && !named.has(opt.name)) {
      const stored = coerceOption(opt, m[2]!);
      if (stored !== null) {
        values.set(opt.name, stored);
        named.add(opt.name);
        continue;
      }
    }
    positional.push(token);
  }

  // then fill the remaining options POSITIONALLY from the leftover tokens
  const posLeaf = leaf.filter((o) => !named.has(o.name));
  let p = 0;
  for (let n = 0; n < posLeaf.length; n += 1) {
    const opt = posLeaf[n]!;
    const remaining = positional.slice(p);
    if (!remaining.length) break;
    // a trailing string option swallows the rest of the line (?zaru long sentences broke on this)
    if (opt.type === STRING && (n === posLeaf.length - 1 || posLeaf.slice(n + 1).every((o) => !o.required && o.type === STRING))) {
      values.set(opt.name, remaining.map(stripQuotes).join(" "));
      p = positional.length;
      continue;
    }
    const stored = coerceOption(opt, remaining[0]!);
    if (stored === null) {
      // this token doesn't fit; leave it for the next option (a required one with nothing valid is reported below)
      continue;
    }
    values.set(opt.name, stored);
    p += 1;
  }

  const missingOpt = leaf.find((o) => o.required && !values.has(o.name));
  return { subcommand, group: groupName, values, missing: missingOpt ? missingOpt.name : null };
}

export function prefixUsage(prefix: string, name: string, options?: JsonOption[]): string {
  const bits = [`\`${prefix}${name}\``];
  const list = options ?? [];
  const subs = list.filter((o) => o.type === SUB);
  if (subs.length) {
    bits.push(`<${subs.map((s) => s.name).join("|")}>`);
    return bits.join(" ");
  }
  for (const opt of list) {
    bits.push(opt.required ? `<${opt.name}>` : `[${opt.name}]`);
  }
  return bits.join(" ");
}
