// A small tag language for saved replies. Blocks can nest. Nothing here runs code or reaches the network.

export type TagContext = {
  user: string;
  username: string;
  server: string;
  channel: string;
  memberCount: string;
  args: string;
};

const MAX_DEPTH = 8;

function findBlock(input: string, from: number): { start: number; end: number } | null {
  const start = input.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < input.length; i++) {
    if (input[i] === "{") depth++;
    else if (input[i] === "}") {
      depth--;
      if (depth === 0) return { start, end: i };
    }
  }
  return null;
}

function splitTop(body: string, sep: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts;
}

function evalTag(inner: string, ctx: TagContext, pick: () => number, depth: number): string {
  const parts = splitTop(inner, ":");
  const name = (parts[0] ?? "").trim().toLowerCase();
  const args = parts.slice(1).map((part) => renderTag(part, ctx, pick, depth + 1));
  switch (name) {
    case "user":
      return ctx.user;
    case "username":
      return ctx.username;
    case "server":
      return ctx.server;
    case "channel":
      return ctx.channel;
    case "membercount":
      return ctx.memberCount;
    case "args":
      return ctx.args;
    case "arg": {
      const words = ctx.args.split(/\s+/).filter(Boolean);
      const index = Math.max(1, Number(args[0]) || 1) - 1;
      return words[index] ?? "";
    }
    case "choose": {
      const options = (args[0] ?? "").split("|").map((part) => part.trim()).filter(Boolean);
      if (!options.length) return "";
      const index = Math.min(options.length - 1, Math.floor(pick() * options.length));
      return options[index] ?? "";
    }
    case "upper":
      return (args[0] ?? "").toUpperCase();
    case "lower":
      return (args[0] ?? "").toLowerCase();
    case "range": {
      const raw = args[0] ?? "";
      const match = raw.match(/^(\d+)\s*[-:]\s*(\d+)$/);
      if (!match) return "0";
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (end < start || end - start > 1_000_000) return String(start);
      return String(start + Math.floor(pick() * (end - start + 1)));
    }
    case "if": {
      const cond = args[0] ?? "";
      const yes = args[1] ?? "";
      const no = args[2] ?? "";
      let ok = false;
      if (cond.includes("!=")) {
        const [left, right] = cond.split("!=");
        ok = (left ?? "").trim() !== (right ?? "").trim();
      } else if (cond.includes("~")) {
        const [left, right] = cond.split("~");
        ok = (left ?? "").toLowerCase().includes((right ?? "").trim().toLowerCase());
      } else if (cond.includes("=")) {
        const [left, right] = cond.split("=");
        ok = (left ?? "").trim() === (right ?? "").trim();
      } else {
        const value = cond.trim().toLowerCase();
        ok = value.length > 0 && value !== "0" && value !== "false";
      }
      return ok ? yes : no;
    }
    case "math": {
      const op = args[0];
      const left = Number(args[1]);
      const right = Number(args[2]);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return "0";
      if (op === "+") return String(left + right);
      if (op === "-") return String(left - right);
      if (op === "*") return String(left * right);
      if (op === "/") return right === 0 ? "0" : String(Math.trunc(left / right));
      return "0";
    }
    case "replace": {
      const text = args[0] ?? "";
      const from = args[1] ?? "";
      const to = args[2] ?? "";
      if (!from) return text;
      return text.split(from).join(to).slice(0, 800);
    }
    case "repeat": {
      const times = Math.min(20, Math.max(0, Math.trunc(Number(args[0]) || 0)));
      return (args[1] ?? "").repeat(times).slice(0, 800);
    }
    case "newline":
    case "n":
      return "\n";
    default:
      return parts.length === 1 ? `{${name}}` : "";
  }
}

export function renderTag(template: string, ctx: TagContext, pick = Math.random, depth = 0): string {
  if (depth > MAX_DEPTH) return template.slice(0, 1800);
  let out = "";
  let cursor = 0;
  while (cursor < template.length) {
    const block = findBlock(template, cursor);
    if (!block) {
      out += template.slice(cursor);
      break;
    }
    out += template.slice(cursor, block.start);
    out += evalTag(template.slice(block.start + 1, block.end), ctx, pick, depth);
    cursor = block.end + 1;
  }
  return (depth === 0 ? out : out).slice(0, 1800);
}
