export const DEFAULT_PREFIX = "z!";

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
  if (prefix && trimmed.startsWith(prefix)) {
    return { rest: trimmed.slice(prefix.length).trimStart() };
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

export function parsePrefixArgs(
  options: JsonOption[] | undefined,
  tokens: string[],
): ParsedPrefixArgs {
  const values = new Map<string, string>();
  let i = 0;
  let list = options ?? [];
  let subcommand: string | null = null;

  if (list.some((o) => o.type === GROUP) && tokens[i]) {
    const group = list.find((o) => o.type === GROUP && o.name === tokens[i]?.toLowerCase());
    if (group) {
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
      return { subcommand: null, values, missing: list.map((o) => o.name).join("|") };
    }
  }

  const leaf = list.filter((o) => o.type !== SUB && o.type !== GROUP);
  for (let n = 0; n < leaf.length; n += 1) {
    const opt = leaf[n];
    const remaining = tokens.slice(i);
    if (!remaining.length) {
      if (opt.required) return { subcommand, values, missing: opt.name };
      continue;
    }
    if (
      opt.type === STRING &&
      (n === leaf.length - 1 || leaf.slice(n + 1).every((o) => !o.required && o.type === STRING))
    ) {
      values.set(opt.name, remaining.map(stripQuotes).join(" "));
      i = tokens.length;
      continue;
    }
    const token = remaining[0];
    if (opt.type === USER || opt.type === MENTIONABLE || opt.type === CHANNEL || opt.type === ROLE) {
      const id = mentionId(token);
      if (!id) {
        if (opt.required) return { subcommand, values, missing: opt.name };
        continue;
      }
      values.set(opt.name, id);
      i += 1;
      continue;
    }
    if (opt.type === INTEGER || opt.type === NUMBER) {
      if (!/^-?\d+(\.\d+)?$/.test(token)) {
        if (opt.required) return { subcommand, values, missing: opt.name };
        continue;
      }
      values.set(opt.name, token);
      i += 1;
      continue;
    }
    if (opt.type === BOOLEAN) {
      const low = token.toLowerCase();
      if (!["true", "false", "yes", "no", "on", "off", "1", "0"].includes(low)) {
        if (opt.required) return { subcommand, values, missing: opt.name };
        continue;
      }
      values.set(opt.name, ["true", "yes", "on", "1"].includes(low) ? "true" : "false");
      i += 1;
      continue;
    }
    values.set(opt.name, stripQuotes(token));
    i += 1;
  }

  return { subcommand, values, missing: null };
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
