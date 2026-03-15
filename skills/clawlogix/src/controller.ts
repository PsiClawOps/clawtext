import { Ledger } from "./ledger.js";
import {
  createRequest,
  approveRequest,
  denyRequest,
  forceApproveWithMode,
  getRequest,
  listRequests,
  setRequestStatus,
} from "./approvals.js";
import { snapshotInflight } from "./preflight.js";
import { waitUntilIdle } from "./drain.js";
import { announceBackOnline, announcePreRestart } from "./announce.js";
import { executeRestart } from "./execute.js";
import { isNewWorkPaused } from "./safetyState.js";
import type { ForceApprovalMode, Urgency } from "./types.js";
import type { OpenClawAdapter } from "./openclawAdapter.js";
import { resolveWorkspacePath } from "./paths.js";

const ledger = new Ledger(resolveWorkspacePath("memory", "operational", "restart-ledger.jsonl"));

export async function requestRestart(input: {
  reason: string;
  urgency?: Urgency;
  requester: string;
}) {
  if (isNewWorkPaused()) {
    throw new Error("New work is paused due to active emergency incident.");
  }
  const req = await createRequest(input);
  await ledger.append({
    ts: new Date().toISOString(),
    type: "request.created",
    requestId: req.id,
    data: req as unknown as Record<string, unknown>,
  });
  return req;
}

export async function approveRestart(requestId: string, approver: string) {
  const req = await approveRequest(requestId, approver);
  await ledger.append({
    ts: new Date().toISOString(),
    type: "request.approved",
    requestId,
    data: { approver },
  });
  return req;
}

export async function denyRestart(requestId: string, approver: string, reason?: string) {
  const req = await denyRequest(requestId, approver);
  await ledger.append({
    ts: new Date().toISOString(),
    type: "request.denied",
    requestId,
    data: { approver, reason },
  });
  return req;
}

export async function forceRestart(
  requestId: string,
  approver: string,
  confirm: string,
  mode: ForceApprovalMode,
) {
  const outcome = await forceApproveWithMode(requestId, approver, confirm, mode);
  await ledger.append({
    ts: new Date().toISOString(),
    type: "request.force_approval",
    requestId,
    data: { approver, mode, complete: outcome.complete },
  });
  return outcome;
}

export async function runRestart(requestId: string, adapter: OpenClawAdapter) {
  const req = await getRequest(requestId);
  if (!req) throw new Error(`Unknown request: ${requestId}`);
  if (req.status !== "approved") throw new Error(`Request ${requestId} is not approved`);

  const pre = await snapshotInflight(adapter);
  await setRequestStatus(requestId, "draining");
  await ledger.append({
    ts: new Date().toISOString(),
    type: "preflight.snapshot",
    requestId,
    data: pre as unknown as Record<string, unknown>,
  });

  const drained = await waitUntilIdle({
    adapter,
    pollEveryMs: 2000,
    maxWaitMs: 15 * 60 * 1000,
    onProgress: async (msg) =>
      ledger.append({ ts: new Date().toISOString(), type: "drain.progress", requestId, data: { msg } }),
    onTimeoutDecisionRequired: async (msg) =>
      ledger.append({
        ts: new Date().toISOString(),
        type: "drain.timeout_decision_required",
        requestId,
        data: { msg },
      }),
  });

  if (drained === "timeout") {
    await setRequestStatus(requestId, "timeout_waiting_decision");
    await ledger.append({
      ts: new Date().toISOString(),
      type: "request.timeout_waiting_decision",
      requestId,
    });
    throw new Error("Drain timed out; operator decision required.");
  }

  await setRequestStatus(requestId, "restarting");
  const t0 = Date.now();
  await announcePreRestart(adapter, req.reason, requestId);
  await executeRestart(adapter, req.reason, requestId, req.forceUsed);
  await announceBackOnline(adapter, requestId, Date.now() - t0);

  await setRequestStatus(requestId, "completed");
  await ledger.append({ ts: new Date().toISOString(), type: "request.completed", requestId });
  return { ok: true, requestId };
}

export async function status(requestId?: string) {
  if (requestId) return (await getRequest(requestId)) ?? null;
  return listRequests();
}
