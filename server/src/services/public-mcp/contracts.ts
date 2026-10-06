import type { PublicMcpTransfers } from "./file-transfers.js";
import { z } from "zod";
import type { McpPrincipal } from "./oauth.js";

export class McpApiError extends Error {
  constructor(readonly status: number, readonly details: Record<string, unknown> = {}) {
    super(`Paperclip rejected the operation (HTTP ${status}). Check permissions, task state and agent availability in Paperclip.`);
  }
}

/** Messages intentionally safe to return across the public tool boundary. */
export class McpCapabilityError extends Error {}

export type ApiDispatch = (principal: McpPrincipal, method: "GET" | "POST" | "PATCH" | "PUT", path: string, body?: unknown) => Promise<unknown>;

export const company = { companyId: z.uuid().describe("The company explicitly authorized by this connection. Copy the exact companyId from paperclip_connection and wait for that result before dependent tool calls. Never guess an ID or use a placeholder.") };
export const task = { ...company, taskId: z.uuid().describe("The exact task UUID returned by paperclip_search_tasks or paperclip_create_task. Search by title or human-readable identifier first; never derive a UUID from a title or identifier.") };
export const requestId = z.uuid().describe("A new UUID for this intended action. Reuse this UUID and identical arguments on retries; never invent a second ID after an uncertain result.");
export const boundedLimit = z.number().int().min(1).max(100).default(30);
export const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export const pick = (v: unknown, keys: string[]) => Object.fromEntries(keys.filter((k) => k in object(v)).map((k) => [k, object(v)[k]]));
export const rows = (v: unknown) => Array.isArray(v) ? v : [];
export const taskFields = ["id", "companyId", "identifier", "title", "description", "status", "priority", "assigneeAgentId", "assigneeUserId", "projectId", "parentId", "blockedByIssueIds", "unblockDescriptor", "executionState", "createdAt", "updatedAt", "completedAt"];
export const commentFields = ["id", "issueId", "body", "authorUserId", "authorAgentId", "createdAt"];
export const documentFields = ["id", "issueId", "key", "title", "format", "body", "latestRevisionId", "latestRevisionNumber", "updatedAt"];
export const pathId = (id: unknown) => encodeURIComponent(String(id));
export const stable = (v: unknown): string => JSON.stringify(v, (_k, value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]]));
  }
  return value;
});

export type Capability = {
  name: string; description: string; schema: z.ZodObject; write?: boolean; configure?: boolean; destructive?: boolean; ephemeral?: boolean;
  run: (p: McpPrincipal, args: Record<string, unknown>, api: ApiDispatch, origin: string, transfers?: PublicMcpTransfers) => Promise<Record<string, unknown>>;
};

