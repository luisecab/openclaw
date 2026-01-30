import type { Job } from "./types.js";

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function normalizeLocation(location?: string): string | undefined {
  if (!location) return undefined;
  const trimmed = location.trim();
  return trimmed ? trimmed : undefined;
}

function jobSortKey(job: Job): number {
  if (!job.postedAt) return 0;
  const parsed = new Date(job.postedAt).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatJobDigest(jobs: Job[], opts?: { heading?: string }): string {
  if (jobs.length === 0) {
    return opts?.heading ? `${opts.heading}\nNo new roles today.` : "No new roles today.";
  }

  const heading = opts?.heading ?? `Job digest (${jobs.length} new)`;
  const bySource = new Map<string, Job[]>();
  for (const job of jobs) {
    const source = job.source || "Other";
    const list = bySource.get(source) ?? [];
    list.push(job);
    bySource.set(source, list);
  }

  const sections: string[] = [heading];
  const sources = Array.from(bySource.keys()).sort();
  for (const source of sources) {
    const sourceJobs = bySource.get(source) ?? [];
    sourceJobs.sort((a, b) => jobSortKey(b) - jobSortKey(a));
    sections.push(`\n${source} (${sourceJobs.length})`);
    for (const job of sourceJobs) {
      const location = normalizeLocation(job.location);
      const date = formatDate(job.postedAt);
      const parts: string[] = [];
      if (job.company) parts.push(job.company);
      if (location) parts.push(location);
      if (date) parts.push(date);
      const detail = parts.length > 0 ? ` — ${parts.join(" • ")}` : "";
      sections.push(`- [${job.title}](${job.url})${detail}`);
    }
  }

  return sections.join("\n");
}

export function sortJobsByRecency(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => jobSortKey(b) - jobSortKey(a));
}
