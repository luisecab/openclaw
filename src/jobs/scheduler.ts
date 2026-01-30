import { Cron } from "croner";

import type { OutboundSendDeps } from "../infra/outbound/deliver.js";
import type { OpenClawConfig } from "../config/types.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { resolveJobSearchSchedule, runJobSearch } from "./job-search.js";

export type JobSearchScheduler = {
  updateConfig: (cfg: OpenClawConfig) => void;
  stop: () => void;
};

type Logger = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

function parseTime(value: string): { hour: number; minute: number } | null {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function buildCronExpr(time: string): string | null {
  const parsed = parseTime(time);
  if (!parsed) return null;
  return `${parsed.minute} ${parsed.hour} * * *`;
}

function buildScheduleKey(cfg: OpenClawConfig): string {
  const jobs = cfg.jobs;
  if (!jobs || jobs.enabled !== true) return "disabled";
  const schedule = resolveJobSearchSchedule(jobs);
  return `${schedule.time}|${schedule.timezone}`;
}

export function startJobSearchScheduler(params: {
  cfg: OpenClawConfig;
  outboundDeps: OutboundSendDeps;
  log: Logger;
}): JobSearchScheduler {
  let cron: Cron | null = null;
  let currentKey = "";
  let running = false;
  let currentCfg = params.cfg;

  const stop = () => {
    if (cron) {
      cron.stop();
      cron = null;
    }
  };

  const scheduleNext = (cfg: OpenClawConfig) => {
    const jobs = cfg.jobs;
    if (!jobs || jobs.enabled !== true) {
      params.log.info("jobs: scheduler disabled");
      stop();
      return;
    }
    const schedule = resolveJobSearchSchedule(jobs);
    const expr = buildCronExpr(schedule.time);
    if (!expr) {
      params.log.warn(`jobs: invalid schedule time ${schedule.time}; skipping scheduler`);
      stop();
      return;
    }

    stop();
    cron = new Cron(
      expr,
      {
        timezone: schedule.timezone,
        catch: false,
      },
      () => {
        void run();
      },
    );
    params.log.info(`jobs: scheduled daily run at ${schedule.time} ${schedule.timezone}`);
  };

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runJobSearch({
        cfg: currentCfg,
        outboundDeps: params.outboundDeps,
        opts: {
          client: {
            name: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
            mode: GATEWAY_CLIENT_MODES.BACKEND,
          },
          log: {
            info: params.log.info,
            warn: params.log.warn,
            error: params.log.error,
          },
        },
      });
      if (result.status === "invalid" && result.errors?.length) {
        params.log.warn(`jobs: skipped run: ${result.errors.join(" ")}`);
      }
    } catch (error) {
      params.log.error(`jobs: run failed: ${String(error)}`);
    } finally {
      running = false;
    }
  };

  const updateConfig = (cfg: OpenClawConfig) => {
    currentCfg = cfg;
    const nextKey = buildScheduleKey(cfg);
    if (nextKey === currentKey) return;
    currentKey = nextKey;
    scheduleNext(cfg);
  };

  updateConfig(params.cfg);

  return { updateConfig, stop };
}
