// Live verification driver for amazon-dsp-mcp.
// Spawns the server in stdio mode (auto-loads creds from packages/amazon-dsp-mcp/.env via dotenv)
// then invokes each tool against the production Amazon DSP API.
//
// Run: cd packages/amazon-dsp-mcp && pnpm exec tsx tests/live/run-live-test.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(__dirname, "../..");

// Inline .env loader (avoids requiring dotenv as a tests/ devDep).
function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const [, k, rawVal] = m;
    if (process.env[k]) continue;
    let v = rawVal.trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}
loadEnv(resolve(pkgRoot, ".env"));

type Result = {
  tool: string;
  scenario: string;
  status: "PASS" | "FAIL" | "SKIP";
  notes?: string;
  errorMessage?: string;
  responsePreview?: unknown;
};

const results: Result[] = [];

function record(r: Result) {
  results.push(r);
  const tag = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "~";
  console.log(
    `${tag} ${r.tool} [${r.scenario}] ${r.status}${r.notes ? " — " + r.notes : ""}${r.errorMessage ? " — " + r.errorMessage : ""}`
  );
}

async function call(client: Client, tool: string, args: Record<string, unknown>) {
  try {
    const res = await client.callTool({ name: tool, arguments: args });
    const txt = (res.content as Array<{ type: string; text?: string }>)
      ?.filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    // Prefer structuredContent (MCP 1.27); fall back to extracting a JSON
    // object out of the response text (tools wrap JSON inside "Found N…\n{…}").
    let parsed: unknown = (res as { structuredContent?: unknown }).structuredContent;
    if (parsed === undefined) {
      parsed = txt;
      if (txt) {
        const firstBrace = txt.indexOf("{");
        const lastBrace = txt.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
          try {
            parsed = JSON.parse(txt.slice(firstBrace, lastBrace + 1));
          } catch {
            /* leave as text */
          }
        }
      }
    }
    if (res.isError) {
      return { ok: false as const, error: txt ?? "unknown error", parsed };
    }
    return { ok: true as const, parsed };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [resolve(pkgRoot, "dist/index.js")],
    env: {
      ...process.env,
      MCP_TRANSPORT_MODE: "stdio",
    } as Record<string, string>,
    cwd: pkgRoot,
  });

  const client = new Client({ name: "amazon-dsp-live-test", version: "1.0.0" });
  await client.connect(transport);
  console.log("Connected to amazon-dsp-mcp via stdio");

  const tools = await client.listTools();
  console.log(`Server exposed ${tools.tools.length} tools`);

  const profileId = process.env.AMAZON_DSP_PROFILE_ID!;
  let advertiserId: string | undefined;
  let orderId: string | undefined;
  let lineItemId: string | undefined;
  let creativeId: string | undefined;
  let reportTaskId: string | undefined;
  let reportDownloadUrl: string | undefined;

  // 1. list_advertisers
  {
    const r = await call(client, "amazon_dsp_list_advertisers", {});
    if (r.ok) {
      const adv = (r.parsed as { advertisers?: Array<Record<string, unknown>> })?.advertisers ?? [];
      advertiserId = (adv[0]?.advertiserId ?? adv[0]?.profileId ?? adv[0]?.id) as
        | string
        | undefined;
      record({
        tool: "amazon_dsp_list_advertisers",
        scenario: "default",
        status: "PASS",
        notes: `${adv.length} advertisers; first=${advertiserId}`,
      });
    } else {
      record({
        tool: "amazon_dsp_list_advertisers",
        scenario: "default",
        status: "FAIL",
        errorMessage: r.error,
      });
    }
  }

  const scope = advertiserId ?? profileId;

  // 2. list_entities × 3 (order, lineItem, creative)
  for (const entityType of ["order", "lineItem", "creative"] as const) {
    const args: Record<string, unknown> = {
      entityType,
      profileId: scope,
      pageSize: 5,
    };
    if (entityType === "lineItem" || entityType === "creative") {
      if (!orderId) {
        record({
          tool: "amazon_dsp_list_entities",
          scenario: entityType,
          status: "SKIP",
          notes: "no orderId discovered",
        });
        continue;
      }
      args.filters = { orderId };
    }
    const r = await call(client, "amazon_dsp_list_entities", args);
    if (r.ok) {
      const entities = (r.parsed as { entities?: Array<Record<string, unknown>> })?.entities ?? [];
      if (entityType === "order" && entities[0]) {
        orderId = (entities[0].orderId ?? entities[0].id) as string;
      } else if (entityType === "lineItem" && entities[0]) {
        lineItemId = (entities[0].lineItemId ?? entities[0].id) as string;
      } else if (entityType === "creative" && entities[0]) {
        creativeId = (entities[0].creativeId ?? entities[0].id) as string;
      }
      record({
        tool: "amazon_dsp_list_entities",
        scenario: entityType,
        status: "PASS",
        notes: `${entities.length} items${entities[0] ? "; first=" + JSON.stringify(Object.keys(entities[0])).slice(0, 80) : ""}`,
      });
    } else {
      record({
        tool: "amazon_dsp_list_entities",
        scenario: entityType,
        status: "FAIL",
        errorMessage: r.error,
      });
    }
  }

  // 3. get_entity for each available
  const entityTargets: Array<[string, string | undefined]> = [
    ["order", orderId],
    ["lineItem", lineItemId],
    ["creative", creativeId],
  ];
  for (const [entityType, id] of entityTargets) {
    if (!id) {
      record({
        tool: "amazon_dsp_get_entity",
        scenario: entityType,
        status: "SKIP",
        notes: "no ID discovered",
      });
      continue;
    }
    const r = await call(client, "amazon_dsp_get_entity", {
      entityType,
      profileId: scope,
      entityId: id,
    });
    if (r.ok) {
      record({
        tool: "amazon_dsp_get_entity",
        scenario: entityType,
        status: "PASS",
        notes: `id=${id}`,
      });
    } else {
      record({
        tool: "amazon_dsp_get_entity",
        scenario: entityType,
        status: "FAIL",
        errorMessage: r.error,
      });
    }
  }

  // 4. validate_entity (non-destructive validation pass)
  {
    const r = await call(client, "amazon_dsp_validate_entity", {
      entityType: "order",
      profileId: scope,
      data: { name: "live-test-validation", advertiserId: scope },
      mode: "create",
    });
    record({
      tool: "amazon_dsp_validate_entity",
      scenario: "order create payload",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error,
    });
  }

  // 5. get_ad_preview (read-only)
  if (creativeId) {
    const r = await call(client, "amazon_dsp_get_ad_preview", {
      profileId: scope,
      creativeId,
    });
    record({
      tool: "amazon_dsp_get_ad_preview",
      scenario: "by creativeId",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error,
    });
  } else {
    record({
      tool: "amazon_dsp_get_ad_preview",
      scenario: "by creativeId",
      status: "SKIP",
      notes: "no creativeId discovered",
    });
  }

  // 6. submit_report → check_report_status → download_report → get_report_breakdowns
  {
    const r = await call(client, "amazon_dsp_submit_report", {
      datePreset: "LAST_7_DAYS",
      type: "CAMPAIGN",
      dimensions: ["ORDER"],
      metrics: ["impressions", "totalCost"],
      timeUnit: "DAILY",
    });
    if (r.ok) {
      reportTaskId = (r.parsed as { taskId?: string })?.taskId;
      record({
        tool: "amazon_dsp_submit_report",
        scenario: "CAMPAIGN+ORDER LAST_7_DAYS",
        status: "PASS",
        notes: `taskId=${reportTaskId}`,
      });
    } else {
      record({
        tool: "amazon_dsp_submit_report",
        scenario: "CAMPAIGN+ORDER LAST_7_DAYS",
        status: "FAIL",
        errorMessage: r.error,
      });
    }
  }

  if (reportTaskId) {
    // poll up to 12x with 5s interval
    let finalStatus: string | undefined;
    for (let i = 0; i < 12; i++) {
      const r = await call(client, "amazon_dsp_check_report_status", {
        taskId: reportTaskId,
      });
      if (!r.ok) {
        record({
          tool: "amazon_dsp_check_report_status",
          scenario: "poll",
          status: "FAIL",
          errorMessage: r.error,
        });
        break;
      }
      const p = r.parsed as {
        state?: string;
        rawStatus?: string;
        isComplete?: boolean;
        downloadUrl?: string;
      };
      finalStatus = p.rawStatus ?? p.state;
      if (p.isComplete && p.downloadUrl) {
        reportDownloadUrl = p.downloadUrl;
        record({
          tool: "amazon_dsp_check_report_status",
          scenario: "poll",
          status: "PASS",
          notes: `rawStatus=${p.rawStatus} after ${i + 1} polls`,
        });
        break;
      }
      if (p.state === "failed") {
        record({
          tool: "amazon_dsp_check_report_status",
          scenario: "poll",
          status: "FAIL",
          notes: `rawStatus=${p.rawStatus} state=failed`,
        });
        break;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (finalStatus && !reportDownloadUrl) {
      record({
        tool: "amazon_dsp_check_report_status",
        scenario: "poll",
        status: "FAIL",
        notes: `did not complete in 60s; last status=${finalStatus}`,
      });
    }
  } else {
    record({
      tool: "amazon_dsp_check_report_status",
      scenario: "poll",
      status: "SKIP",
      notes: "no taskId from submit_report",
    });
  }

  if (reportTaskId && reportDownloadUrl) {
    const r = await call(client, "amazon_dsp_download_report", {
      downloadUrl: reportDownloadUrl,
    });
    record({
      tool: "amazon_dsp_download_report",
      scenario: "after submit + poll",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error,
    });
  } else {
    record({
      tool: "amazon_dsp_download_report",
      scenario: "after submit + poll",
      status: "SKIP",
      notes: reportTaskId ? "polled but did not reach SUCCESS" : "no taskId",
    });
  }

  // get_report (blocking) — separate small report
  {
    const r = await call(client, "amazon_dsp_get_report", {
      datePreset: "LAST_7_DAYS",
      type: "CAMPAIGN",
      dimensions: ["ORDER"],
      metrics: ["impressions"],
      timeUnit: "DAILY",
    });
    record({
      tool: "amazon_dsp_get_report",
      scenario: "blocking CAMPAIGN+ORDER",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error,
    });
  }

  // get_report_breakdowns
  {
    const r = await call(client, "amazon_dsp_get_report_breakdowns", {
      datePreset: "LAST_7_DAYS",
      type: "CAMPAIGN",
      dimensions: ["ORDER"],
      breakdowns: ["LINE_ITEM"],
      metrics: ["impressions", "totalCost"],
      timeUnit: "DAILY",
    });
    record({
      tool: "amazon_dsp_get_report_breakdowns",
      scenario: "ORDER × LINE_ITEM",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error,
    });
  }

  // 7. Mutations against a disposable order created here, then cleaned up.
  // If create_entity fails (Amazon DSP order minima vary by account / campaign type),
  // we SKIP downstream mutation tools with a clear reason rather than touch real entities.
  let disposableOrderId: string | undefined;
  const now = new Date();
  const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const end = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
  {
    const r = await call(client, "amazon_dsp_create_entity", {
      entityType: "order",
      profileId: scope,
      data: {
        name: `cesteral-live-test-${Date.now()}`,
        advertiserId: scope,
        startDateTime: iso(start),
        endDateTime: iso(end),
        // Common required-by-Amazon fields beyond the contract's declared minima.
        // If the account's defaults reject this we still capture a clean error.
        totalBudget: { amount: 100, currencyCode: "USD" },
      },
    });
    if (r.ok) {
      disposableOrderId =
        ((r.parsed as { entity?: Record<string, unknown> })?.entity?.orderId as string) ??
        (r.parsed as { orderId?: string })?.orderId;
      record({
        tool: "amazon_dsp_create_entity",
        scenario: "create disposable order",
        status: "PASS",
        notes: `disposableOrderId=${disposableOrderId}`,
      });
    } else {
      record({
        tool: "amazon_dsp_create_entity",
        scenario: "create disposable order",
        status: "FAIL",
        errorMessage: r.error?.slice(0, 500),
      });
    }
  }

  // update_entity (no-op rename touching only the disposable order)
  if (disposableOrderId) {
    const r = await call(client, "amazon_dsp_update_entity", {
      entityType: "order",
      profileId: scope,
      entityId: disposableOrderId,
      data: { name: `cesteral-live-test-updated-${Date.now()}` },
    });
    record({
      tool: "amazon_dsp_update_entity",
      scenario: "rename disposable order",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error?.slice(0, 300),
    });
  } else {
    record({
      tool: "amazon_dsp_update_entity",
      scenario: "rename disposable order",
      status: "SKIP",
      notes: "no disposableOrderId",
    });
  }

  // duplicate_entity (on disposable)
  if (disposableOrderId) {
    const r = await call(client, "amazon_dsp_duplicate_entity", {
      entityType: "order",
      profileId: scope,
      entityId: disposableOrderId,
    });
    record({
      tool: "amazon_dsp_duplicate_entity",
      scenario: "duplicate disposable order",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error?.slice(0, 300),
    });
  } else {
    record({
      tool: "amazon_dsp_duplicate_entity",
      scenario: "duplicate disposable order",
      status: "SKIP",
      notes: "no disposableOrderId",
    });
  }

  // bulk_update_entities (on disposable)
  if (disposableOrderId) {
    const r = await call(client, "amazon_dsp_bulk_update_entities", {
      entityType: "order",
      profileId: scope,
      items: [
        {
          entityId: disposableOrderId,
          data: { name: `cesteral-live-test-bulk-${Date.now()}` },
        },
      ],
    });
    record({
      tool: "amazon_dsp_bulk_update_entities",
      scenario: "bulk rename disposable",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error?.slice(0, 300),
    });
  } else {
    record({
      tool: "amazon_dsp_bulk_update_entities",
      scenario: "bulk rename disposable",
      status: "SKIP",
      notes: "no disposableOrderId",
    });
  }

  // bulk_update_status (pause disposable)
  if (disposableOrderId) {
    const r = await call(client, "amazon_dsp_bulk_update_status", {
      entityType: "order",
      profileId: scope,
      entityIds: [disposableOrderId],
      status: "PAUSED",
    });
    record({
      tool: "amazon_dsp_bulk_update_status",
      scenario: "pause disposable",
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error?.slice(0, 300),
    });
  } else {
    record({
      tool: "amazon_dsp_bulk_update_status",
      scenario: "pause disposable",
      status: "SKIP",
      notes: "no disposableOrderId",
    });
  }

  // bulk_create_entities (one more disposable in the envelope; we'll delete after)
  let bulkCreatedOrderId: string | undefined;
  {
    const r = await call(client, "amazon_dsp_bulk_create_entities", {
      entityType: "order",
      profileId: scope,
      items: [
        {
          name: `cesteral-bulk-${Date.now()}`,
          advertiserId: scope,
          startDateTime: iso(start),
          endDateTime: iso(end),
          totalBudget: { amount: 100, currencyCode: "USD" },
        },
      ],
    });
    if (r.ok) {
      const arr = (
        r.parsed as { results?: Array<{ orderId?: string; entity?: { orderId?: string } }> }
      )?.results;
      bulkCreatedOrderId = arr?.[0]?.orderId ?? arr?.[0]?.entity?.orderId;
      record({
        tool: "amazon_dsp_bulk_create_entities",
        scenario: "bulk create 1 order",
        status: "PASS",
        notes: `bulkCreatedOrderId=${bulkCreatedOrderId}`,
      });
    } else {
      record({
        tool: "amazon_dsp_bulk_create_entities",
        scenario: "bulk create 1 order",
        status: "FAIL",
        errorMessage: r.error?.slice(0, 300),
      });
    }
  }

  // adjust_bids — requires a lineItem to target. Exercising it would either modify a
  // real production lineItem's bid (out of scope) or require provisioning a disposable
  // lineItem under the disposable order (and a creative for it to associate with).
  // Skip the live call and verify only the tool's input schema acceptance.
  record({
    tool: "amazon_dsp_adjust_bids",
    scenario: "live invocation",
    status: "SKIP",
    notes:
      "needs disposable lineItem to safely test; out of scope for the current run (would require provisioning lineItem + creative)",
  });

  // delete_entity — Amazon DSP has no hard delete; tool should archive via status.
  // Run against the disposable orders to clean up.
  for (const [tag, id] of [
    ["disposable", disposableOrderId],
    ["bulk-created", bulkCreatedOrderId],
  ] as const) {
    if (!id) {
      record({
        tool: "amazon_dsp_delete_entity",
        scenario: `cleanup ${tag}`,
        status: "SKIP",
        notes: "no id",
      });
      continue;
    }
    const r = await call(client, "amazon_dsp_delete_entity", {
      entityType: "order",
      profileId: scope,
      entityId: id,
    });
    record({
      tool: "amazon_dsp_delete_entity",
      scenario: `cleanup ${tag} order ${id}`,
      status: r.ok ? "PASS" : "FAIL",
      errorMessage: r.ok ? undefined : r.error?.slice(0, 300),
    });
  }

  await client.close();

  // Summary
  console.log("\n=== SUMMARY ===");
  const counts = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.log(counts);

  writeFileSync(
    resolve(pkgRoot, "tests/live/last-run.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2)
  );
  console.log(`\nResults written to tests/live/last-run.json`);
}

main().catch((err) => {
  console.error("Driver crashed:", err);
  process.exit(1);
});
