import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export type IdentityVerificationRoute = "uae_resident" | "visitor";
export type LocalIdentityStatus =
  | "pending"
  | "in_review"
  | "approved"
  | "rejected"
  | "error"
  | "expired";

interface DiditSessionResponse {
  session_id?: string;
  url?: string;
  status?: string;
}

export interface DiditDecision {
  environment?: string;
  session_id?: string;
  status?: string;
  workflow_id?: string;
  vendor_data?: string;
}

export function diditIsConfigured(): boolean {
  return Boolean(
    diditConfigurationIsSafe()
    && env.diditApiKey()
    && env.diditResidentWorkflowId()
    && env.diditVisitorWorkflowId()
    && env.diditResidentWorkflowId() !== env.diditVisitorWorkflowId(),
  );
}

function isLoopbackUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "");
    return ["http:", "https:"].includes(url.protocol)
      && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function diditConfigurationIsSafe(): boolean {
  // Never send an API key to a configurable third-party URL or redirect.
  if (env.diditApiUrl() !== "https://verification.didit.me") return false;
  if (env.diditEnvironment() === "live") return true;
  // Sandbox is deliberately local-only until a separate hosted test database
  // is provisioned. A preview frontend connected to production is not isolated.
  return env.diditEnvironment() === "sandbox"
    && process.env.VERCEL_ENV !== "production"
    && process.env.VERCEL !== "1"
    && isLoopbackUrl(env.siteUrl())
    && isLoopbackUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function diditEnvironmentMatches(providerEnvironment: unknown): boolean {
  return diditConfigurationIsSafe()
    && providerEnvironment === env.diditEnvironment();
}

export function diditWorkflowForRoute(route: IdentityVerificationRoute): string {
  return route === "uae_resident"
    ? env.diditResidentWorkflowId()
    : env.diditVisitorWorkflowId();
}

export async function createDiditVerificationSession({
  verificationId,
  productId,
  route,
}: {
  verificationId: string;
  productId: string;
  route: IdentityVerificationRoute;
}): Promise<{ sessionId: string; verificationUrl: string }> {
  if (!diditIsConfigured()) throw new Error("Identity provider is not safely configured");
  const vendorData = `getgold-order-${verificationId}`;
  const response = await fetch(`${env.diditApiUrl()}/v3/session/`, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.diditApiKey(),
    },
    body: JSON.stringify({
      workflow_id: diditWorkflowForRoute(route),
      vendor_data: vendorData,
      callback: `${env.siteUrl()}/products/${productId}`,
      language: "en",
      metadata: { verification_route: route },
      expected_details: route === "uae_resident"
        ? { id_country: "ARE", expected_document_types: ["ID"] }
        : { expected_document_types: ["P"] },
    }),
  });
  const payload = await response.json().catch(() => null) as DiditSessionResponse | null;
  if (!response.ok || !payload?.session_id || !payload.url) {
    throw new Error(`Identity provider returned ${response.status}`);
  }

  const verificationUrl = new URL(payload.url);
  if (verificationUrl.origin !== "https://verify.didit.me" || verificationUrl.username || verificationUrl.password) {
    throw new Error("Identity provider returned an unexpected verification URL");
  }
  // The create response does not document an environment discriminator. Read
  // the authenticated decision before handing out a capture URL, so a wrongly
  // configured sandbox key cannot collect a real customer's documents.
  const decision = await retrieveDiditDecision(payload.session_id);
  if (decision.session_id !== payload.session_id || decision.vendor_data !== vendorData
    || decision.workflow_id !== diditWorkflowForRoute(route)) {
    throw new Error("Identity provider returned an unexpected session");
  }
  return { sessionId: payload.session_id, verificationUrl: verificationUrl.toString() };
}

export async function retrieveDiditDecision(sessionId: string): Promise<DiditDecision> {
  if (!diditIsConfigured()) throw new Error("Identity provider is not safely configured");
  const response = await fetch(`${env.diditApiUrl()}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: "application/json",
      "x-api-key": env.diditApiKey(),
    },
  });
  const payload = await response.json().catch(() => null) as DiditDecision | null;
  if (!response.ok || !payload) {
    throw new Error(`Identity provider returned ${response.status}`);
  }
  if (!diditEnvironmentMatches(payload.environment)) {
    throw new Error("Identity provider returned an unexpected environment");
  }
  return payload;
}

export function mapDiditStatus(status: string | undefined): {
  status: LocalIdentityStatus;
  resultCode: string;
} {
  const normalized = (status ?? "").trim().toLowerCase().replaceAll("_", " ");
  if (normalized === "approved") return { status: "approved", resultCode: "APPROVED" };
  if (normalized === "declined") return { status: "rejected", resultCode: "DECLINED" };
  if (normalized === "in review") return { status: "in_review", resultCode: "IN_REVIEW" };
  if (["expired", "kyc expired", "abandoned"].includes(normalized)) {
    return { status: "expired", resultCode: normalized.toUpperCase().replaceAll(" ", "_") };
  }
  if (["not started", "in progress", "resubmitted", "awaiting user", ""].includes(normalized)) {
    return { status: "pending", resultCode: normalized ? normalized.toUpperCase().replaceAll(" ", "_") : "PENDING" };
  }
  return { status: "error", resultCode: "UNEXPECTED_PROVIDER_STATUS" };
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
        return sorted;
      }, {});
  }
  return value;
}

function safeDigestEqual(expected: string, supplied: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expectedBytes = Buffer.from(expected, "hex");
  const suppliedBytes = Buffer.from(supplied, "hex");
  return expectedBytes.length === suppliedBytes.length
    && timingSafeEqual(expectedBytes, suppliedBytes);
}

export function verifyDiditWebhookSignature({
  rawBody,
  parsedBody,
  signatureV2,
  rawSignature,
  timestamp,
}: {
  rawBody: string;
  parsedBody: unknown;
  signatureV2: string;
  rawSignature: string;
  timestamp: string;
}): boolean {
  if (!env.diditWebhookSecret()) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isInteger(timestampSeconds)
    || Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) > 300) {
    return false;
  }

  if (signatureV2) {
    const canonical = JSON.stringify(sortKeys(parsedBody));
    const expectedV2 = createHmac("sha256", env.diditWebhookSecret())
      .update(canonical, "utf8")
      .digest("hex");
    if (safeDigestEqual(expectedV2, signatureV2)) return true;
  }

  // Next's Request.text() exposes the untouched request body, so Didit's
  // full-payload raw signature is a safe fallback when canonical V2 differs.
  if (rawSignature) {
    const expectedRaw = createHmac("sha256", env.diditWebhookSecret())
      .update(rawBody, "utf8")
      .digest("hex");
    if (safeDigestEqual(expectedRaw, rawSignature)) return true;
  }
  return false;
}
