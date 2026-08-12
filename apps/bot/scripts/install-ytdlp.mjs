import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const botRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(botRoot, "bin", process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
const urls =
  process.platform === "win32"
    ? ["https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"]
    : [
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux",
        "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp",
      ];

if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
  process.exit(0);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });

function curl(url) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["-fsSL", "--retry", "3", "--retry-delay", "2", "-A", "knox-bot", "-o", dest, url], {
      stdio: "inherit",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`curl ${code}`))));
    child.on("error", reject);
  });
}

let ok = false;
for (const url of urls) {
  try {
    await curl(url);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      try {
        fs.chmodSync(dest, 0o755);
      } catch {
        /* Windows */
      }
      console.log(`yt-dlp baked (${fs.statSync(dest).size} bytes)`);
      ok = true;
      break;
    }
  } catch (error) {
    console.warn(`yt-dlp bake skipped for ${url}: ${error instanceof Error ? error.message : error}`);
  }
}

if (!ok) {
  console.warn("yt-dlp bake failed; runtime download will retry");
}
