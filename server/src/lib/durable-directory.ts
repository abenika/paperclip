import { promises as fs } from "node:fs";
import path from "node:path";

// These application-owned directories are stable after creation. Check their
// identity on reuse, so deleting/recreating one cannot reuse its durability proof.
const durableDirectories = new Map<string, string>();

export async function syncDirectory(directory: string) {
  if (process.platform === "win32") return;
  const handle = await fs.open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

/** An existing directory may be left by an interrupted mkdir/flush sequence.
 * A fresh process must flush its complete ancestry before trusting it. Never
 * waive a permission error based on an in-memory creation boundary: a restart
 * would forget that boundary and could acknowledge a non-durable token write. */
export async function ensureDurableDirectory(directory: string) {
  const resolved = path.resolve(directory);
  if (process.platform === "win32") {
    await fs.mkdir(resolved, { recursive: true, mode: 0o700 });
    return;
  }
  const existing = await fs.stat(resolved, { bigint: true }).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return null;
  });
  const identity = (stat: NonNullable<typeof existing>) => `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
  if (existing && durableDirectories.get(resolved) === identity(existing)) return;
  await fs.mkdir(resolved, { recursive: true, mode: 0o700 });
  const stat = await fs.stat(resolved, { bigint: true });
  for (let current = resolved; ; current = path.dirname(current)) {
    await syncDirectory(current);
    if (path.dirname(current) === current) break;
  }
  // Cache only a fully flushed path. Failures, siblings and fresh processes
  // each retry the entire chain rather than inferring durability from existence.
  if (durableDirectories.size >= 1024) durableDirectories.delete(durableDirectories.keys().next().value!);
  durableDirectories.set(resolved, identity(stat));
}
