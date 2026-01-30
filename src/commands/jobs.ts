import { createOutboundSendDeps, type CliDeps } from "../cli/deps.js";
import { loadConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { runJobSearch } from "../jobs/job-search.js";

export async function jobsRunCommand(
  opts: { json?: boolean; dryRun?: boolean; preview?: boolean; deliver?: boolean },
  deps: CliDeps,
  runtime: RuntimeEnv,
) {
  const cfg = loadConfig();
  const outboundDeps = createOutboundSendDeps(deps);
  const result = await runJobSearch({
    cfg,
    outboundDeps,
    opts: {
      dryRun: opts.dryRun,
      preview: opts.preview,
      deliver: opts.deliver,
      client: { name: GATEWAY_CLIENT_NAMES.CLI, mode: GATEWAY_CLIENT_MODES.CLI },
      log: {
        info: (msg) => runtime.log(msg),
        warn: (msg) => runtime.error(msg),
        error: (msg) => runtime.error(msg),
      },
    },
  });

  if (result.status === "invalid") {
    const message = result.errors?.join("\n") ?? "Invalid jobs configuration.";
    throw new Error(message);
  }

  if (opts.json) {
    runtime.log(
      JSON.stringify(
        {
          status: result.status,
          newJobs: result.newJobs?.length ?? 0,
          digest: result.digest,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (result.status === "disabled") {
    runtime.log("Job search is disabled. Enable jobs.enabled in config to run it.");
    return;
  }

  if (result.status === "no-new") {
    runtime.log("No new jobs found.");
    return;
  }

  if (result.digest) {
    runtime.log(result.digest);
  }
}
