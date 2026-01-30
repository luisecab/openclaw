import type { Job, JobProvider, JobSearchProviderConfig, JobSearchQuery } from "../types.js";

const API_BASE = "https://api.lever.co/v0/postings";

type LeverJob = {
  id: string;
  text?: string;
  hostedUrl?: string;
  createdAt?: number;
  categories?: {
    location?: string;
    team?: string;
    commitment?: string;
    level?: string;
  };
  tags?: string[];
};

function normalizeText(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function parseDate(value?: number): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function extractTags(job: LeverJob, fallback?: string[]): string[] | undefined {
  const tags = new Set<string>();
  const categories = job.categories ?? {};
  for (const value of [categories.team, categories.commitment, categories.level]) {
    const cleaned = normalizeText(value);
    if (cleaned) tags.add(cleaned);
  }
  for (const tag of job.tags ?? []) {
    const cleaned = normalizeText(tag);
    if (cleaned) tags.add(cleaned);
  }
  if (Array.isArray(fallback)) {
    for (const tag of fallback) {
      if (tag?.trim()) tags.add(tag.trim());
    }
  }
  return tags.size > 0 ? Array.from(tags) : undefined;
}

export function createLeverJobProvider(config: JobSearchProviderConfig): JobProvider {
  if (config.kind !== "lever") {
    throw new Error(`Invalid provider kind for Lever: ${config.kind}`);
  }
  const sourceLabel = config.label?.trim() || config.id || "Lever";
  const company = config.company.trim();
  const url = `${API_BASE}/${encodeURIComponent(company)}?mode=json`;

  return {
    id: config.id,
    label: sourceLabel,
    fetchJobs: async (_query: JobSearchQuery) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Lever fetch failed (${res.status}) for ${company}`);
      }
      const payload = (await res.json()) as LeverJob[];
      const jobs = Array.isArray(payload) ? payload : [];
      return jobs
        .map((job) => {
          const postedAt = parseDate(job.createdAt);
          const location = normalizeText(job.categories?.location) || undefined;
          return {
            id: job.id,
            title: normalizeText(job.text) || "Untitled role",
            company,
            location,
            url: job.hostedUrl ?? `${API_BASE}/${company}`,
            postedAt,
            source: sourceLabel,
            tags: extractTags(job, config.tags),
          } satisfies Job;
        })
        .filter((job) => job.url && job.id);
    },
  } satisfies JobProvider;
}
