import { afterEach, describe, expect, it, vi } from "vitest";
import { redactTransferEvidence } from "./public-mcp-transfer-evidence.js";
import { assertSecretFree } from "./redaction.js";
import { runExpandedMcpScenario } from "./public-mcp-expanded-flow.js";
import { origin } from "./public-mcp-client.js";
import { isReadOnlyMcpCall } from "./public-mcp-grading.js";
import type { RunnerApi } from "./api.js";

const cases = ["task-edit", "documents", "files", "agent-config", "projects", "skills", "api", "permissions"];
afterEach(() => vi.unstubAllGlobals());

describe("expanded MCP independent evidence calibration", () => {
  it.each(cases)("accepts durable %s and rejects a plausible wrong outcome", async name => {
    for (const valid of [true, false]) {
      const checks: boolean[] = [];
      const nonce = "calibration";
      const bytes = Buffer.concat([Buffer.from([0, 255, 1, 128]), Buffer.from(`BINARY${nonce}`)]);
      const companyId = "company", taskId = "task";
      const api = {
        post: async () => ({ id: "agent", name: "Settings agent" }),
        get: async (path: string) => {
          if (path.endsWith("/activity?limit=100")) return valid ? [{ action: "issue.updated", details: { status: "blocked" } }] : [];
          if (path.endsWith("/documents/report/revisions")) return valid ? [{ id: "old" }, { id: "new" }] : [];
          if (path.endsWith("/documents/report")) return { body: valid ? `GARDEN DOCUMENT${nonce}` : "GARDEN" };
          if (path.endsWith("/attachments")) return valid ? [{ originalFilename: "demo.mp4", byteSize: bytes.length }] : [];
          if (path.includes("instructions-bundle/file")) return { content: valid ? `Original operating instructions. INSTRUCTIONS${nonce}` : "Original operating instructions." };
          if (path.endsWith("/agents/agent")) return { title: name === "permissions" ? (valid ? "Original" : `Forbidden ${nonce}`) : (valid ? `Editor ${nonce}` : "Original"), budgetMonthlyCents: valid ? 1200 : 0 };
          if (path.endsWith("/projects")) return valid ? [{ name: `Project ${nonce}`, description: `Updated project ${nonce}` }] : [];
          if (path.includes("/files?path=SKILL.md")) return { content: valid ? `SKILL${nonce}` : "unchanged" };
          if (path.endsWith("/skills")) return valid ? [{ id: "skill", name: `Eval skill ${nonce}`, tagline: `Citations ${nonce}`, sharingScope: "company" }] : [];
          return { description: valid ? (name === "api" ? `API${nonce}` : `Edited ${nonce}`) : "Old", priority: valid ? "high" : "low", status: "done" };
        },
      } as unknown as RunnerApi;
      vi.stubGlobal("fetch", vi.fn(async (_url, init) => init?.method === "PUT"
        ? Response.json({ attachment: { id: "attachment" } })
        : new Response(valid ? bytes : Buffer.from("corrupted"))));
      await runExpandedMcpScenario({ id: `expanded-${name}`, api, companyId, taskId, title: "Task", marker: "GARDEN", nonce, secrets: [],
        check: (_id, passed) => checks.push(Boolean(passed)),
        converse: async (prompt, host) => {
          if (host) {
            for (const direction of ["upload", "download"]) await host.call("host_transfer_file", { direction, url: `${origin}/mcp/files/${direction}?ticket=fixture` });
          }
          // A plausible assistant success claim alone cannot make the fixture pass.
          return { prompt, final: `Done GARDEN DOCUMENT${nonce}; configuration permission required`, calls: ["paperclip_search_api", "paperclip_call_api"].map(name => ({ name, arguments: {}, result: {} })) };
        },
      });
      expect(checks.length).toBeGreaterThan(0);
      expect(checks.every(Boolean)).toBe(valid);
    }
  });

  it("rejects all mutation categories in read-only grading, including generic calls", () => {
    for (const name of ["paperclip_update_task", "paperclip_finish_task", "paperclip_block_task", "paperclip_update_agent", "paperclip_write_document", "paperclip_get_upload_url", "paperclip_write_skill_file", "paperclip_future_tool"]) {
      expect(isReadOnlyMcpCall({ name, arguments: {} })).toBe(false);
      expect(isReadOnlyMcpCall({ name: "paperclip_call_api", arguments: { operationId: name } })).toBe(false);
    }
    expect(isReadOnlyMcpCall({ name: "paperclip_call_api", arguments: { operationId: "paperclip_read_task" } })).toBe(true);
  });
});

 it("removes authorized transfer credentials without masking unrelated credential leaks", () => {
   const ticket = "temporary-transfer-ticket";
   const url = `https://paperclip.example/mcp/files/upload?ticket=${ticket}`;
   const value = { result: { url, content: [{ text: JSON.stringify({ url }) }] }, arguments: { url } };
   const safe = JSON.stringify(redactTransferEvidence(value, [ticket, url]));
   expect(safe).not.toContain(ticket);
   expect(safe).not.toContain(url);
   expect(() => assertSecretFree(safe, [ticket, url], "transfer")).not.toThrow();
   expect(() => assertSecretFree(JSON.stringify(redactTransferEvidence({ token: "provider-secret" }, [ticket, url])), ["provider-secret"], "unexpected")).toThrow("Secret leak");
   expect(value.result.url).toBe(url);
 });
