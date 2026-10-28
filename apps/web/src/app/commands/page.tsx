import { readFileSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand-mark";
import { CommandsBrowser, type CatalogRow } from "./commands-client";

type CatalogFile = {
  generatedAt: string;
  commandCount: number;
  modules: Array<{ id: string; name: string; description: string }>;
  rows: CatalogRow[];
};

function loadCatalog(): CatalogFile {
  const file = path.join(process.cwd(), "public", "command-catalog.json");
  try {
    return JSON.parse(readFileSync(file, "utf8")) as CatalogFile;
  } catch {
    return { generatedAt: "", commandCount: 0, modules: [], rows: [] };
  }
}

export default async function CommandsPage() {
  const session = await auth();
  const catalog = loadCatalog();

  return (
    <main>
      <div className="nav">
        <Link href="/">Home</Link>
        {session ? <Link href="/dashboard">Dashboard</Link> : <Link href="/login">Login</Link>}
      </div>
      <p className="brand">
        <BrandMark />
      </p>
      <h1>Command reference</h1>
      <p className="muted">
        Every slash command and common prefix alias for ZARU Bot. Search, then run them in Discord.
      </p>
      {catalog.rows.length === 0 ? (
        <p className="panel">
          Catalog not built yet. Run <code>pnpm --filter @knox/bot catalog:export</code> after deploying the bot package.
        </p>
      ) : (
        <CommandsBrowser rows={catalog.rows} modules={catalog.modules} defaultPrefix="?" />
      )}
      {catalog.generatedAt ? (
        <p className="muted" style={{ marginTop: "1.5rem", fontSize: "0.85rem" }}>
          Generated {new Date(catalog.generatedAt).toLocaleString()} · {catalog.commandCount} entries
        </p>
      ) : null}
    </main>
  );
}
