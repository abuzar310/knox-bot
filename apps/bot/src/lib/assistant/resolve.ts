// Turning what the model (or a person) wrote into real channels, roles and members: an id, a mention, an exact
// name, or the closest name; things created earlier in the same plan are found by the name they were given.
import { ChannelType, type CategoryChannel, type Guild, type GuildBasedChannel, type GuildMember, type Role } from "discord.js";
import { plainName } from "../server-brain.js";

export type Created = Map<string, string>;

const ID = /^\d{17,20}$/;

function idFrom(ref: string): string | null {
  const m = ref.match(/\d{17,20}/);
  return m ? m[0] : null;
}

function best<T extends { name: string }>(items: T[], ref: string): T | null {
  const want = plainName(ref);
  if (!want) return null;
  const exact = items.find((i) => plainName(i.name) === want);
  if (exact) return exact;
  const starts = items.filter((i) => plainName(i.name).startsWith(want));
  if (starts.length === 1) return starts[0] ?? null;
  const contains = items.filter((i) => plainName(i.name).includes(want) || want.includes(plainName(i.name)));
  return contains.length === 1 ? (contains[0] ?? null) : null;
}

export function resolveChannel(guild: Guild, ref: string | undefined, created: Created, kinds?: ChannelType[]): GuildBasedChannel | null {
  if (!ref) return null;
  const id = ID.test(ref) ? ref : idFrom(ref) ?? created.get(plainName(ref)) ?? null;
  const pool = [...guild.channels.cache.values()].filter((c) => !c.isThread() && (!kinds || kinds.includes(c.type)));
  if (id) return pool.find((c) => c.id === id) ?? null;
  return best(pool, ref);
}

export function resolveCategory(guild: Guild, ref: string | undefined, created: Created): CategoryChannel | null {
  const found = resolveChannel(guild, ref, created, [ChannelType.GuildCategory]);
  return found && found.type === ChannelType.GuildCategory ? (found as CategoryChannel) : null;
}

export function resolveRole(guild: Guild, ref: string | undefined, created: Created): Role | null {
  if (!ref) return null;
  const id = ID.test(ref) ? ref : idFrom(ref) ?? created.get(`role:${plainName(ref)}`) ?? null;
  const pool = [...guild.roles.cache.values()].filter((r) => r.id !== guild.id);
  if (id) return pool.find((r) => r.id === id) ?? null;
  return best(pool, ref);
}

export async function resolveMember(guild: Guild, ref: string | undefined): Promise<GuildMember | null> {
  if (!ref) return null;
  const id = ID.test(ref) ? ref : idFrom(ref);
  if (id) return guild.members.cache.get(id) ?? (await guild.members.fetch(id).catch(() => null));
  const want = plainName(ref.replace(/^@/, ""));
  const pool = [...guild.members.cache.values()];
  const byName = (m: GuildMember) => [plainName(m.user.username), plainName(m.displayName), plainName(m.user.globalName ?? "")];
  const exact = pool.find((m) => byName(m).includes(want));
  if (exact) return exact;
  const partial = pool.filter((m) => byName(m).some((n) => n && (n.startsWith(want) || n.includes(want))));
  if (partial.length === 1) return partial[0] ?? null;
  const fetched = await guild.members.fetch({ query: ref.replace(/^@/, ""), limit: 5 }).catch(() => null);
  return fetched && fetched.size === 1 ? (fetched.first() ?? null) : null;
}
