import Link from "next/link";

export function DashboardNav({ guildId }: { guildId: string }) {
  const base = `/dashboard/${guildId}`;
  return (
    <div className="nav">
      <Link href="/dashboard">← Servers</Link>
      <Link href={base}>Overview</Link>
      <Link href={`${base}/tickets`}>Tickets</Link>
      <Link href={`${base}/economy`}>Economy</Link>
      <Link href={`${base}/moderation`}>Moderation</Link>
      <Link href={`${base}/logs`}>Logs</Link>
      <Link href={`${base}/welcome`}>Welcome</Link>
      <Link href={`${base}/automod`}>Automod</Link>
      <Link href={`${base}/activity`}>Activity</Link>
      <Link href={`${base}/permissions`}>Permissions</Link>
      <Link href="/commands">All commands</Link>
    </div>
  );
}
