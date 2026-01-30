import type { Job, JobSearchQuery } from "./types.js";

function normalize(value?: string | null): string {
  if (!value) return "";
  return value.toLowerCase();
}

function matchAllTerms(haystack: string, terms: string[]): boolean {
  return terms.every((term) => haystack.includes(term));
}

function matchAnyTerms(haystack: string, terms: string[]): boolean {
  return terms.some((term) => haystack.includes(term));
}

function parseBooleanQuery(query: string): { andTerms: string[]; orGroups: string[][] } {
  const cleaned = query.trim();
  if (!cleaned) return { andTerms: [], orGroups: [] };
  const orGroups = cleaned.split(/\s+OR\s+/i).map((group) =>
    group
      .split(/\s+AND\s+/i)
      .map((term) => term.trim())
      .filter(Boolean),
  );
  const andTerms = orGroups.length === 1 ? (orGroups[0] ?? []) : [];
  return { andTerms, orGroups };
}

function matchesBooleanQuery(haystack: string, query?: string): boolean {
  if (!query) return true;
  const { andTerms, orGroups } = parseBooleanQuery(query);
  if (orGroups.length === 0) return true;
  if (andTerms.length > 0) return matchAllTerms(haystack, andTerms.map(normalize));
  return orGroups.some((group) => matchAllTerms(haystack, group.map(normalize)));
}

function matchesKeywords(haystack: string, keywords?: string[]): boolean {
  if (!keywords || keywords.length === 0) return true;
  return matchAllTerms(
    haystack,
    keywords.map((keyword) => keyword.toLowerCase()),
  );
}

function matchesLocations(job: Job, locations?: string[]): boolean {
  if (!locations || locations.length === 0) return true;
  const location = normalize(job.location);
  if (!location) return false;
  return matchAnyTerms(
    location,
    locations.map((loc) => loc.toLowerCase()),
  );
}

function matchesSeniority(job: Job, seniority?: string[]): boolean {
  if (!seniority || seniority.length === 0) return true;
  const haystack = normalize(`${job.title} ${job.tags?.join(" ") ?? ""}`);
  return matchAnyTerms(
    haystack,
    seniority.map((term) => term.toLowerCase()),
  );
}

function matchesTags(job: Job, tags?: string[]): boolean {
  if (!tags || tags.length === 0) return true;
  const jobTags = job.tags?.map((tag) => tag.toLowerCase()) ?? [];
  return tags.some((tag) => jobTags.includes(tag.toLowerCase()));
}

function matchesRemotePreference(job: Job, pref?: JobSearchQuery["remotePreference"]): boolean {
  if (!pref || pref === "any") return true;
  const haystack = normalize(`${job.title} ${job.location ?? ""} ${job.tags?.join(" ") ?? ""}`);
  if (pref === "remote") return haystack.includes("remote");
  if (pref === "hybrid") return haystack.includes("hybrid");
  return !haystack.includes("remote") && !haystack.includes("hybrid");
}

export function applyJobFilters(jobs: Job[], query?: JobSearchQuery): Job[] {
  if (!query) return jobs;
  return jobs.filter((job) => {
    const haystack = normalize(
      `${job.title} ${job.company} ${job.location ?? ""} ${job.tags?.join(" ") ?? ""}`,
    );
    return (
      matchesKeywords(haystack, query.keywords) &&
      matchesBooleanQuery(haystack, query.query) &&
      matchesLocations(job, query.locations) &&
      matchesRemotePreference(job, query.remotePreference) &&
      matchesSeniority(job, query.seniority) &&
      matchesTags(job, query.tags)
    );
  });
}
