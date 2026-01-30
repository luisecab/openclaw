import type { ChannelId } from "../channels/plugins/types.js";

export type Job = {
  id: string;
  title: string;
  company: string;
  location?: string;
  url: string;
  postedAt?: string;
  source: string;
  tags?: string[];
};

export type JobSearchQuery = {
  keywords?: string[];
  query?: string;
  locations?: string[];
  remotePreference?: "remote" | "hybrid" | "onsite" | "any";
  seniority?: string[];
  tags?: string[];
};

export type JobSearchSchedule = {
  time?: string;
  timezone?: string;
};

export type JobSearchDelivery = {
  channel: ChannelId;
  target: string;
  accountId?: string;
};

export type JobSearchDedupe = {
  retentionDays?: number;
  maxEntries?: number;
  storePath?: string;
};

export type JobSearchProviderBase = {
  id: string;
  label?: string;
  tags?: string[];
};

export type JobSearchProviderConfig =
  | (JobSearchProviderBase & {
      kind: "rss";
      feedUrl: string;
      company?: string;
    })
  | (JobSearchProviderBase & {
      kind: "greenhouse";
      board: string;
      company?: string;
    })
  | (JobSearchProviderBase & {
      kind: "lever";
      company: string;
    });

export type JobSearchConfig = {
  enabled?: boolean;
  schedule?: JobSearchSchedule;
  query?: JobSearchQuery;
  providers?: JobSearchProviderConfig[];
  delivery?: JobSearchDelivery;
  dedupe?: JobSearchDedupe;
};

export type JobProvider = {
  id: string;
  label: string;
  fetchJobs: (query: JobSearchQuery) => Promise<Job[]>;
};
