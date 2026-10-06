import { ACPX_DRIVER_KIND, ACPX_DRIVER_PROTOCOL_VERSION, QUALIFIED_ACPX_VERSION, QUALIFIED_ACPX_PROFILE_DATA, ACPX_MODEL_ADMISSION } from "./generated-profiles.js";
export { ACPX_DRIVER_KIND, ACPX_DRIVER_PROTOCOL_VERSION, QUALIFIED_ACPX_VERSION } from "./generated-profiles.js";

import type { NativeAcpxAgent, NativeAcpxProfileSnapshot } from "../../contracts/native-execution.js";

export type QualifiedAcpxAgent = NativeAcpxAgent;

export interface QualifiedAcpxProfile {
  readonly driverKind: typeof ACPX_DRIVER_KIND;
  readonly protocolVersion: typeof ACPX_DRIVER_PROTOCOL_VERSION;
  readonly acpxVersion: typeof QUALIFIED_ACPX_VERSION;
  readonly agent: QualifiedAcpxAgent;
  readonly agentProfileVersion: NativeAcpxProfileSnapshot["agentProfileVersion"];
  readonly qualificationStatus?: "pending";
  /** Wire identity: an npm package name or a runner-owned builtin: identifier. */
  readonly agentServerPackage: string;
  readonly agentServerVersion: string;
  readonly agentRuntimePackage: string | null;
  readonly agentRuntimeVersion: string | null;
  readonly commandDigest: string;
  /** Legacy snapshot field: after resolution this is the caller's selected model.
   * Keep its serialized name for recovery identity compatibility. The unresolved
   * value is qualification metadata, never a product default or admission rule. */
  readonly qualificationModel: string;
  /** Exact model ID sent to ACP; catalogs are suggestions, not an allowlist. */
  readonly reportedModelId: string;
  readonly permissionPolicy: "interactive";
}

/**
 * Digests bind the closed profile declaration (package, version, runtime and
 * executable), not a caller-controlled executable. The environment probe separately
 * verifies the resolved package files before a billable prompt is admitted.
 */
export const QUALIFIED_ACPX_PROFILES: Readonly<
  Record<QualifiedAcpxAgent, QualifiedAcpxProfile>
> = deepFreeze(QUALIFIED_ACPX_PROFILE_DATA);

export function resolveQualifiedAcpxProfile(
  agent: QualifiedAcpxAgent,
  requestedModel: string,
): QualifiedAcpxProfile {
  const profile = QUALIFIED_ACPX_PROFILES[agent];
  if (!requestedModel.trim()) throw new Error("ACPX model must not be empty");
  const admission = ACPX_MODEL_ADMISSION[agent];
  if (admission.kind === "exact" && requestedModel !== admission.model) {
    throw new Error(
      `ACPX ${agent} profile requires exact model ${admission.model}; received ${requestedModel}`,
    );
  }
  return { ...structuredClone(profile), qualificationModel: requestedModel, reportedModelId: requestedModel };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
