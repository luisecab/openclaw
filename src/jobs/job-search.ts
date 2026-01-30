import path from "node:path";

import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import { runMessageAction } from "../infra/outbound/message-action-runner.js";
import type { OpenClawConfig } from "../config/types.js";
import { CONFIG_DIR, resolveUserPath } from "../utils.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { applyJobDedupe, buildJobKey, loadJobSeenStore, saveJobSeenStore } from "./dedupe.js";
import { formatJobDigest, sortJobsByRecency } from "./digest.js";
import { applyJobFilters } from "./filter.js";
import { createGreenhouseJobProvider } from "./providers/greenhouse.js";
import { createLeverJobProvider } from "./providers/lever.js";
import { createRssJobProvider } from "./providers/rss.js";
import type {
  Job,
  JobProvider,
  JobSearchConfig,
  JobSearchQuery,
  JobSearchSchedule,
} from "./types.js";

const DEFAULT_SCHEDULE_TIME = "08:30";
const DEFAULT_SCHEDULE_TIMEZONE = "Europe/Warsaw";
const DEFAULT_DEDUPE_PATH = path.join(CONFIG_DIR, "jobs", "seen.json");

export type JobSearchRunStatus = "disabled" | "invalid" | "no-new" | "sent" | "skipped";

export type JobSearchRunResult = {
  status: JobSearchRunStatus;
  digest?: string;
  newJobs?: Job[];
  errors?: string[];
};

export type JobSearchRunOptions = {
  dryRun?: boolean;
  preview?: boolean;
  deliver?: boolean;
  client?: { name: string; mode: string };
  nowMs?: () => number;
  log?: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void };
};

function resolveSchedule(schedule?: JobSearchSchedule): Required<JobSearchSchedule> {
  const time = schedule?.time?.trim() || DEFAULT_SCHEDULE_TIME;
  const timezone = schedule?.timezone?.trim() || DEFAULT_SCHEDULE_TIMEZONE;
  return { time, timezone };
}

function resolveStorePath(config: JobSearchConfig): string {
  const raw = config.dedupe?.storePath?.trim();
  if (raw) return resolveUserPath(raw);
  return DEFAULT_DEDUPE_PATH;
}

function normalizeQuery(query?: JobSearchQuery): JobSearchQuery | undefined {
  if (!query) return undefined;
  const normalizeList = (list?: string[]) => list?.map((value) => value.trim()).filter(Boolean);
  return {
    ...query,
    keywords: normalizeList(query.keywords),
    locations: normalizeList(query.locations),
    seniority: normalizeList(query.seniority),
    tags: normalizeList(query.tags),
    query: query.query?.trim(),
  };
}

function buildProviders(config: JobSearchConfig): JobProvider[] {
  const providers = config.providers ?? [];
  return providers.map((provider) => {
    switch (provider.kind) {
      case "rss":
        return createRssJobProvider(provider);
      case "greenhouse":
        return createGreenhouseJobProvider(provider);
      case "lever":
        return createLeverJobProvider(provider);
      default:
        throw new Error(`Unsupported provider kind: ${(provider as { kind?: string }).kind}`);
    }
  });
}

function buildValidationErrors(
  config?: JobSearchConfig,
  opts?: { requireDelivery?: boolean },
): string[] {
  if (!config || config.enabled !== true) return [];
  const errors: string[] = [];
  if (!config.providers || config.providers.length === 0) {
    errors.push("jobs.providers must include at least one provider entry.");
  }
  if (opts?.requireDelivery !== false) {
    const delivery = config.delivery;
    if (!delivery?.channel || !delivery?.target) {
      errors.push("jobs.delivery.channel and jobs.delivery.target are required to send digests.");
    }
  }
  return errors;
}

async function fetchProviderJobs(
  provider: JobProvider,
  query: JobSearchQuery | undefined,
  log?: { warn: (msg: string) => void },
): Promise<Job[]> {
  try {
    return await provider.fetchJobs(query ?? {});
  } catch (error) {
    log?.warn(`jobs: provider ${provider.label} failed: ${String(error)}`);
    return [];
  }
}

function dedupeJobs(jobs: Job[]): Job[] {
  const seen = new Set<string>();
  const unique: Job[] = [];
  for (const job of jobs) {
    const key = buildJobKey(job);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(job);
  }
  return unique;
}

export async function runJobSearch(params: {
  cfg: OpenClawConfig;
  outboundDeps: OutboundSendDeps;
  opts?: JobSearchRunOptions;
}): Promise<JobSearchRunResult> {
  const { cfg, outboundDeps } = params;
  const jobsConfig = cfg.jobs;
  const opts = params.opts ?? {};
  if (!jobsConfig || jobsConfig.enabled !== true) {
    return { status: "disabled" };
  }
  const errors = buildValidationErrors(jobsConfig, { requireDelivery: opts.deliver !== false });
  if (errors.length > 0) {
    return { status: "invalid", errors };
  }

  const query = normalizeQuery(jobsConfig.query);
  const providers = buildProviders(jobsConfig);
  const log = opts.log;
  const nowMs = opts.nowMs ?? (() => Date.now());

  const providerResults = await Promise.all(
    providers.map((provider) => fetchProviderJobs(provider, query, log)),
  );
  const allJobs = dedupeJobs(providerResults.flat());
  const filtered = applyJobFilters(allJobs, query);
  const sorted = sortJobsByRecency(filtered);

  const storePath = resolveStorePath(jobsConfig);
  const store = await loadJobSeenStore(storePath);
  const { fresh, nextStore } = applyJobDedupe({
    jobs: sorted,
    store,
    nowMs: nowMs(),
    retentionDays: jobsConfig.dedupe?.retentionDays,
    maxEntries: jobsConfig.dedupe?.maxEntries,
  });

  if (fresh.length === 0) {
    return { status: "no-new" };
  }

  const digest = formatJobDigest(fresh, { heading: "Job digest" });
  const shouldPersist = opts.preview !== true && opts.dryRun !== true;

  if (opts.deliver === false) {
    if (shouldPersist) {
      await saveJobSeenStore(storePath, nextStore);
    }
    return { status: "skipped", digest, newJobs: fresh };
  }

  const delivery = jobsConfig.delivery;
  if (!delivery) {
    return { status: "invalid", errors: ["jobs.delivery is missing."] };
  }

  const dryRun = opts.dryRun === true;
  const clientName = opts.client?.name ?? GATEWAY_CLIENT_NAMES.CLI;
  const clientMode = opts.client?.mode ?? GATEWAY_CLIENT_MODES.CLI;

  await runMessageAction({
    cfg,
    action: "send",
    params: {
      channel: delivery.channel,
      target: delivery.target,
      accountId: delivery.accountId,
      message: digest,
    },
    deps: outboundDeps,
    gateway: {
      clientName,
      mode: clientMode,
    },
    dryRun,
  });

  if (shouldPersist) {
    await saveJobSeenStore(storePath, nextStore);
  }

  return { status: "sent", digest, newJobs: fresh };
}

export function resolveJobSearchSchedule(config?: JobSearchConfig): Required<JobSearchSchedule> {
  return resolveSchedule(config?.schedule);
}
