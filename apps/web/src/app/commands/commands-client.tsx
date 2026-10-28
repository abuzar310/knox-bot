"use client";

import { useMemo, useState } from "react";

export type CatalogRow = {
  moduleId: string;
  moduleName: string;
  slash: string;
  description: string;
  prefixExamples: string[];
};

export function CommandsBrowser({
  rows,
  modules,
  defaultPrefix,
}: {
  rows: CatalogRow[];
  modules: Array<{ id: string; name: string; description: string }>;
  defaultPrefix: string;
}) {
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (mod !== "all" && r.moduleId !== mod) return false;
      if (!needle) return true;
      const hay = `${r.slash} ${r.description} ${r.prefixExamples.join(" ")} ${r.moduleName}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q, mod]);

  return (
    <>
      <div className="row" style={{ marginTop: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 220px" }}>
          <span className="muted">Search</span>
          <input
            type="search"
            placeholder="e.g. ticket, rob, music play…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: "100%", marginTop: "0.35rem" }}
          />
        </label>
        <label style={{ flex: "0 1 200px" }}>
          <span className="muted">Module</span>
          <select value={mod} onChange={(e) => setMod(e.target.value)} style={{ width: "100%", marginTop: "0.35rem" }}>
            <option value="all">All modules</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="muted" style={{ marginTop: "1rem" }}>
        Showing <strong>{filtered.length}</strong> of {rows.length} entries. Prefix defaults to{" "}
        <code>{defaultPrefix}</code> — your server may use a different one from <code>/prefix</code>.
      </p>

      <div className="panel" style={{ marginTop: "1rem", padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--knox-border)", textAlign: "left" }}>
              <th style={{ padding: "0.75rem 1rem" }}>Slash</th>
              <th style={{ padding: "0.75rem 1rem" }}>Prefix</th>
              <th style={{ padding: "0.75rem 1rem" }}>Module</th>
              <th style={{ padding: "0.75rem 1rem" }}>What it does</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.slash} style={{ borderBottom: "1px solid var(--knox-border)" }}>
                <td style={{ padding: "0.65rem 1rem", whiteSpace: "nowrap" }}>
                  <code>{r.slash}</code>
                </td>
                <td style={{ padding: "0.65rem 1rem" }}>
                  {r.prefixExamples.length ? (
                    r.prefixExamples.map((p) => (
                      <code key={p} style={{ display: "block", marginBottom: "0.2rem" }}>
                        {p.replace(/^\?/, defaultPrefix)}
                      </code>
                    ))
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td style={{ padding: "0.65rem 1rem" }}>{r.moduleName}</td>
                <td style={{ padding: "0.65rem 1rem", color: "var(--knox-muted)" }}>{r.description || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
