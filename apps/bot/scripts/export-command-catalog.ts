/**
 * Writes apps/web/public/command-catalog.json for the public /commands page.
 * Run: pnpm --filter @knox/bot catalog:export
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadModules } from "../src/load/modules.js";
import { COMMAND_ALIASES } from "../src/lib/command-aliases.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulesDir = path.join(__dirname, "../src/modules");
const outPath = path.join(__dirname, "../../web/public/command-catalog.json");

type CatalogRow = {
  moduleId: string;
  moduleName: string;
  slash: string;
  description: string;
  prefixExamples: string[];
};

const SUB = 1;
const GROUP = 2;

function prefixExamplesFor(slashPath: string): string[] {
  const parts = slashPath.replace(/^\//, "").split(/\s+/);
  const [cmd, ...rest] = parts;
  if (!cmd) return [];
  const out = new Set<string>();
  const aliasKey = rest.length ? `${cmd} ${rest.join(" ")}` : cmd;
  for (const [alias, target] of Object.entries(COMMAND_ALIASES)) {
    if (target === aliasKey || target.startsWith(`${aliasKey} `)) {
      out.add(`?${alias}`);
    }
  }
  if (rest.length === 0) out.add(`?${cmd}`);
  else out.add(`?${cmd} ${rest.join(" ")}`);
  return [...out].slice(0, 6);
}

function walkOptions(
  moduleId: string,
  moduleName: string,
  base: string,
  options: Array<{ type: number; name: string; description?: string; options?: unknown[] }> | undefined,
  rows: CatalogRow[],
) {
  if (!options?.length) {
    rows.push({
      moduleId,
      moduleName,
      slash: base,
      description: "",
      prefixExamples: prefixExamplesFor(base),
    });
    return;
  }
  for (const opt of options) {
    if (opt.type === SUB) {
      const slash = `${base} ${opt.name}`;
      const subOpts = opt.options as typeof options | undefined;
      if (subOpts?.some((o) => o.type === SUB)) {
        walkOptions(moduleId, moduleName, slash, subOpts, rows);
      } else {
        rows.push({
          moduleId,
          moduleName,
          slash,
          description: opt.description ?? "",
          prefixExamples: prefixExamplesFor(slash),
        });
      }
    } else if (opt.type === GROUP) {
      for (const sub of (opt.options ?? []) as typeof options) {
        if (sub.type === SUB) {
          rows.push({
            moduleId,
            moduleName,
            slash: `${base} ${opt.name} ${sub.name}`,
            description: sub.description ?? "",
            prefixExamples: prefixExamplesFor(`${base} ${opt.name} ${sub.name}`),
          });
        }
      }
    }
  }
}

const modules = await loadModules(modulesDir);
const rows: CatalogRow[] = [];

for (const mod of modules) {
  for (const cmd of mod.commands) {
    const json = cmd.data.toJSON() as {
      name: string;
      description: string;
      options?: Array<{ type: number; name: string; description?: string; options?: unknown[] }>;
    };
    const base = `/${json.name}`;
    if (!json.options?.length) {
      rows.push({
        moduleId: mod.id,
        moduleName: mod.name,
        slash: base,
        description: json.description,
        prefixExamples: prefixExamplesFor(base),
      });
      continue;
    }
    const hasSub = json.options.some((o) => o.type === SUB || o.type === GROUP);
    if (!hasSub) {
      rows.push({
        moduleId: mod.id,
        moduleName: mod.name,
        slash: base,
        description: json.description,
        prefixExamples: prefixExamplesFor(base),
      });
      continue;
    }
    walkOptions(mod.id, mod.name, base, json.options, rows);
  }
}

rows.sort((a, b) => a.slash.localeCompare(b.slash));

const payload = {
  generatedAt: new Date().toISOString(),
  commandCount: rows.length,
  modules: modules.map((m) => ({ id: m.id, name: m.name, description: m.description })),
  rows,
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${rows.length} command rows to ${outPath}`);
