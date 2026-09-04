import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { KnoxModule } from "../types.js";
import { logger } from "../logger.js";

export async function loadModules(modulesDir: string): Promise<KnoxModule[]> {
  const entries = await fs.readdir(modulesDir, { withFileTypes: true });
  const modules: KnoxModule[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexPath = path.join(modulesDir, entry.name, "index.ts");
    const indexJs = path.join(modulesDir, entry.name, "index.js");
    const file = await fileExists(indexPath)
      ? indexPath
      : (await fileExists(indexJs))
        ? indexJs
        : null;
    if (!file) {
      logger.warn({ module: entry.name }, "module missing index");
      continue;
    }

    logger.info({ module: entry.name }, "loading module");
    const imported = await import(pathToFileURL(file).href);
    const mod = (imported.default ?? imported.module) as KnoxModule;
    if (!mod?.id) {
      logger.warn({ module: entry.name }, "invalid module export");
      continue;
    }
    modules.push(mod);
  }

  return modules;
}

async function fileExists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
