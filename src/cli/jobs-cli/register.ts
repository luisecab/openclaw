import type { Command } from "commander";

import { jobsRunCommand } from "../../commands/jobs.js";
import { danger, setVerbose } from "../../globals.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { createDefaultDeps } from "../deps.js";

export function registerJobsCli(program: Command) {
  const jobs = program
    .command("jobs")
    .description("Job search automation")
    .action(() => {
      jobs.help({ error: true });
    });

  jobs
    .command("run")
    .description("Run job search and send digest")
    .option("--dry-run", "Skip sending the digest", false)
    .option("--preview", "Skip sending and avoid updating the seen store", false)
    .option("--no-deliver", "Skip sending the digest (still updates seen store)")
    .option("--json", "Output as JSON", false)
    .option("--verbose", "Verbose logging", false)
    .action(async (opts) => {
      setVerbose(Boolean(opts.verbose));
      const deps = createDefaultDeps();
      await runCommandWithRuntime(
        defaultRuntime,
        async () => {
          await jobsRunCommand(
            {
              json: opts.json === true,
              dryRun: opts.dryRun === true,
              preview: opts.preview === true,
              deliver: opts.deliver !== false,
            },
            deps,
            defaultRuntime,
          );
        },
        (err) => {
          defaultRuntime.error(danger(String(err)));
          defaultRuntime.exit(1);
        },
      );
    });
}
