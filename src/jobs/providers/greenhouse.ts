import type { Job, JobProvider, JobSearchProviderConfig, JobSearchQuery } from "../types.js";

const API_BASE = "https://boards-api.greenhouse.io/v1/boards";

type GreenhouseJob = {
  id: number;
  title: string;
  absolute_url?: string;
  location?: { name?: string };
  updated_at?: string;
  created_at?: string;
  metadata?: Array<{ name?: string; value?: string }>;
  departments?: Array<{ name?: string }>;
};

type GreenhouseResponse = {
  jobs?: GreenhouseJob[];
};

function normalizeText(value?: string | null): string {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function parseDate(value?: string): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function extractTags(job: GreenhouseJob, fallback?: string[]): string[] | undefined {
  const tags = new Set<string>();
  if (Array.isArray(fallback)) {
    for (const tag of fallback) {
      if (tag?.trim()) tags.add(tag.trim());
    }
  }
  if (Array.isArray(job.departments)) {
    for (const dept of job.departments) {
      const name = normalizeText(dept.name);
      if (name) tags.add(name);
    }
  }
  if (Array.isArray(job.metadata)) {
    for (const meta of job.metadata) {
      const value = normalizeText(meta.value);
      if (value) tags.add(value);
    }
  }
  return tags.size > 0 ? Array.from(tags) : undefined;
}

export function createGreenhouseJobProvider(config: JobSearchProviderConfig): JobProvider {
  if (config.kind !== "greenhouse") {
    throw new Error(`Invalid provider kind for Greenhouse: ${config.kind}`);
  }
  const sourceLabel = config.label?.trim() || config.id || "Greenhouse";
  const board = config.board.trim();
  const company = config.company?.trim() || board;
  const url = `${API_BASE}/${encodeURIComponent(board)}/jobs?content=true`;

  return {
    id: config.id,
    label: sourceLabel,
    fetchJobs: async (_query: JobSearchQuery) => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Greenhouse fetch failed (${res.status}) for ${board}`);
      }
      const payload = (await res.json()) as GreenhouseResponse;
      const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
      return jobs
        .map((job) => {
          const postedAt = parseDate(job.updated_at ?? job.created_at);
          const location = normalizeText(job.location?.name) || undefined;
          return {
            id: String(job.id),
            title: normalizeText(job.title) || "Untitled role",
            company,
            location,
            url: job.absolute_url ?? `${API_BASE}/${board}`,
            postedAt,
            source: sourceLabel,
            tags: extractTags(job, config.tags),
          } satisfies Job;
        })
        .filter((job) => job.url && job.id);
    },
  } satisfies JobProvider;
}
