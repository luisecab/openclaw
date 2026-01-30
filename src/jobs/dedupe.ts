import fs from "node:fs";
import path from "node:path";

import type { Job } from "./types.js";

export type JobSeenEntry = {
  url: string;
  seenAt: number;
  title?: string;
  source: string;
};

export type JobSeenStore = {
  version: 1;
  seen: Record<string, JobSeenEntry>;
};

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_ENTRIES = 5_000;

export function createEmptyJobSeenStore(): JobSeenStore {
  return { version: 1, seen: {} };
}

export async function loadJobSeenStore(storePath: string): Promise<JobSeenStore> {
  try {
    const raw = await fs.promises.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<JobSeenStore> | null;
    if (!parsed || typeof parsed !== "object" || !parsed.seen) {
      return createEmptyJobSeenStore();
    }
    return {
      version: 1,
      seen: parsed.seen ?? {},
    };
  } catch {
    return createEmptyJobSeenStore();
  }
}

export async function saveJobSeenStore(storePath: string, store: JobSeenStore) {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(store, null, 2), "utf-8");
  await fs.promises.rename(tmp, storePath);
}

export function buildJobKey(job: Job): string {
  return `${job.source}:${job.id}`;
}

export function applyJobDedupe(params: {
  jobs: Job[];
  store: JobSeenStore;
  nowMs: number;
  retentionDays?: number;
  maxEntries?: number;
}): { fresh: Job[]; nextStore: JobSeenStore } {
  const retentionDays =
    typeof params.retentionDays === "number" && params.retentionDays > 0
      ? params.retentionDays
      : DEFAULT_RETENTION_DAYS;
  const maxEntries =
    typeof params.maxEntries === "number" && params.maxEntries > 0
      ? params.maxEntries
      : DEFAULT_MAX_ENTRIES;
  const cutoffMs = params.nowMs - retentionDays * 24 * 60 * 60 * 1000;

  const nextSeen: Record<string, JobSeenEntry> = {};
  for (const [key, entry] of Object.entries(params.store.seen)) {
    if (entry.seenAt >= cutoffMs) {
      nextSeen[key] = entry;
    }
  }

  const fresh: Job[] = [];
  for (const job of params.jobs) {
    const key = buildJobKey(job);
    if (nextSeen[key]) continue;
    fresh.push(job);
    nextSeen[key] = {
      url: job.url,
      seenAt: params.nowMs,
      title: job.title,
      source: job.source,
    };
  }

  const keys = Object.keys(nextSeen);
  if (keys.length > maxEntries) {
    const sorted = keys
      .map((key) => ({ key, seenAt: nextSeen[key]?.seenAt ?? 0 }))
      .sort((a, b) => b.seenAt - a.seenAt);
    const trimmed = sorted.slice(0, maxEntries);
    const trimmedSeen: Record<string, JobSeenEntry> = {};
    for (const entry of trimmed) {
      trimmedSeen[entry.key] = nextSeen[entry.key];
    }
    return { fresh, nextStore: { version: 1, seen: trimmedSeen } };
  }

  return { fresh, nextStore: { version: 1, seen: nextSeen } };
}
