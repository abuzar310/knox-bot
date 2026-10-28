import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { DashboardNav } from "@/components/dashboard-nav";
import {
  canManageGuild,
  ensureGuildRow,
  fetchUserGuilds,
  getGuildSettings,
} from "@/lib/guilds";
import { getDb } from "@/lib/db";
import { saveEconomyAction } from "../actions";

export default async function EconomySettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const userGuilds = await fetchUserGuilds(session.accessToken);
  const guild = userGuilds.find((g) => g.id === guildId);
  if (!guild || !canManageGuild(guild)) redirect("/dashboard");

  const { db } = getDb();
  await ensureGuildRow(db, { id: guild.id, name: guild.name, icon: guild.icon });
  const settings = await getGuildSettings(guildId);
  const f = settings.features;

  return (
    <main>
      <DashboardNav guildId={guildId} />
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Economy</h1>
      <p className="muted">
        UnbelievaBoat-style tuning. Members use prefix commands like <code>?work</code> and <code>?money</code>.{" "}
        <Link href="/commands">Full command list →</Link>
      </p>

      <form action={saveEconomyAction} className="panel grid">
        <input type="hidden" name="guildId" value={guildId} />
        <input type="hidden" name="guildName" value={guild.name} />

        <label className="toggle">
          <span>
            <strong>Economy enabled</strong>
          </span>
          <input type="checkbox" name="economyEnabled" defaultChecked={f.economyEnabled} />
        </label>

        <div className="row">
          <label style={{ flex: 1 }}>
            Currency name
            <input type="text" name="currencyName" defaultValue={f.currencyName} maxLength={30} />
          </label>
          <label style={{ width: "6rem" }}>
            Symbol
            <input type="text" name="currencySymbol" defaultValue={f.currencySymbol} maxLength={8} />
          </label>
        </div>

        <label>
          Money log channel ID
          <span className="muted"> — staff grants, pay, rob (/safety money-log)</span>
          <input type="text" name="moneyLogChannelId" defaultValue={f.moneyLogChannelId ?? ""} />
        </label>

        <div className="row">
          <label>
            Start bank (new members)
            <input type="number" name="startBankBalance" min={0} defaultValue={f.startBankBalance ?? 0} />
          </label>
          <label>
            Max cash (0 = ∞)
            <input type="number" name="maxWalletBalance" min={0} defaultValue={f.maxWalletBalance ?? 0} />
          </label>
          <label>
            Max bank (0 = ∞)
            <input type="number" name="maxBankBalance" min={0} defaultValue={f.maxBankBalance ?? 0} />
          </label>
        </div>

        <div className="row">
          <label>
            Work min
            <input type="number" name="workMin" min={1} defaultValue={f.workMin} />
          </label>
          <label>
            Work max
            <input type="number" name="workMax" min={1} defaultValue={f.workMax} />
          </label>
          <label>
            Daily min
            <input type="number" name="dailyMin" min={1} defaultValue={f.dailyMin} />
          </label>
          <label>
            Daily max
            <input type="number" name="dailyMax" min={1} defaultValue={f.dailyMax} />
          </label>
        </div>

        <button type="submit" className="btn">
          Save economy settings
        </button>
      </form>
    </main>
  );
}
