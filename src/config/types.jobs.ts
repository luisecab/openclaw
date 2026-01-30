import type { ChannelId } from "../channels/plugins/types.js";

export type JobsQueryConfig = {
  keywords?: string[];
  query?: string;
  locations?: string[];
  remotePreference?: "remote" | "hybrid" | "onsite" | "any";
  seniority?: string[];
  tags?: string[];
};

export type JobsScheduleConfig = {
  time?: string;
  timezone?: string;
};

export type JobsDeliveryConfig = {
  channel: ChannelId;
  target: string;
  accountId?: string;
};

export type JobsDedupeConfig = {
  retentionDays?: number;
  maxEntries?: number;
  storePath?: string;
};

export type JobsProviderBaseConfig = {
  id: string;
  label?: string;
  tags?: string[];
};

export type JobsProviderConfig =
  | (JobsProviderBaseConfig & {
      kind: "rss";
      feedUrl: string;
      company?: string;
    })
  | (JobsProviderBaseConfig & {
      kind: "greenhouse";
      board: string;
      company?: string;
    })
  | (JobsProviderBaseConfig & {
      kind: "lever";
      company: string;
    });

export type JobsConfig = {
  enabled?: boolean;
  schedule?: JobsScheduleConfig;
  query?: JobsQueryConfig;
  providers?: JobsProviderConfig[];
  delivery?: JobsDeliveryConfig;
  dedupe?: JobsDedupeConfig;
};
