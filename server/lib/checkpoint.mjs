import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_DIR = path.resolve(__dirname, "../state");

await fs.mkdir(STATE_DIR, { recursive: true });

function filePath(importId) {
  return path.join(STATE_DIR, `import-${importId}.json`);
}

export async function saveCheckpoint(importId, state) {
  const tmp = filePath(importId) + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf-8");
  await fs.rename(tmp, filePath(importId));
}

export async function loadCheckpoint(importId) {
  try {
    const raw = await fs.readFile(filePath(importId), "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteCheckpoint(importId) {
  try {
    await fs.unlink(filePath(importId));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

export async function listCheckpoints() {
  const entries = await fs.readdir(STATE_DIR);
  return entries
    .filter((f) => f.startsWith("import-") && f.endsWith(".json"))
    .map((f) => f.replace(/^import-/, "").replace(/\.json$/, ""));
}
