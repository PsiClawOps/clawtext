import { execFileSync } from "node:child_process";
import type { OpenClawAdapter } from "./openclawAdapter.js";

type RestartRequestContext = {
  reason: string;
  requestId: string;
  forceUsed?: boolean;
};

const CLAWLOGIX_RESTART_GOV_SCRIPT =
  process.env.CLAWLOGIX_RESTART_GOVERNANCE_SCRIPT ||
  `${process.env.HOME}/.openclaw/workspace/scripts/restart-governance.sh`;

const CLAWLOGIX_RESTART_GOV_ACTOR = process.env.CLAWLOGIX_RESTART_GOV_ACTOR || "operator";

function runRestartGovernance(context: RestartRequestContext) {
  const govEnv = {
    ...process.env,
    RESTART_GOV_ACTOR: CLAWLOGIX_RESTART_GOV_ACTOR,
    RESTART_GOV_REASON: `${context.requestId}:${context.reason}`,
    RESTART_GOV_SOURCE: "clawlogix",
    RESTART_GOV_COMMAND: "true",
  };

  if (context.forceUsed) {
    execFileSync(
      CLAWLOGIX_RESTART_GOV_SCRIPT,
      ["--force", "--live", "--assume-yes", "--command", "true"],
      { env: govEnv, stdio: "inherit" },
    );
    return;
  }

  // Stage the request, then execute live in approved mode.
  execFileSync(
    CLAWLOGIX_RESTART_GOV_SCRIPT,
    ["--command", "true"],
    { env: govEnv, stdio: "inherit" },
  );

  execFileSync(
    CLAWLOGIX_RESTART_GOV_SCRIPT,
    ["--live", "--assume-yes", "--command", "true"],
    { env: govEnv, stdio: "inherit" },
  );
}

export async function executeRestart(
  adapter: OpenClawAdapter,
  reason: string,
  requestId: string,
  forceUsed = false,
): Promise<void> {
  // Every ClawLogix-managed restart must pass through governance by default.
  if (process.env.CLAWLOGIX_ENABLE_RESTART_GOVERNANCE !== "0") {
    runRestartGovernance({ reason, requestId, forceUsed });
  }

  await adapter.restartGateway({
    reason,
    note: `ClawLogix restart ${requestId}: gateway is back online.`,
  });
}
