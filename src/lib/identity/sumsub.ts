import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export type IdentityVerificationRoute = "uae_resident" | "visitor";

export function sumsubIsConfigured(): boolean {
  return Boolean(
    env.sumsubAppToken()
    && env.sumsubSecretKey()
    && env.sumsubWebhookSecret()
    && env.sumsubResidentLevelName()
    && env.sumsubVisitorLevelName(),
  );
}

export function sumsubLevelForRoute(route: IdentityVerificationRoute): string {
  return route === "uae_resident"
    ? env.sumsubResidentLevelName()
    : env.sumsubVisitorLevelName();
}

export async function createSumsubSdkToken({
  externalUserId,
  route,
}: {
  externalUserId: string;
  route: IdentityVerificationRoute;
}): Promise<string> {
  const path = "/resources/accessTokens/sdk";
  const body = JSON.stringify({
    ttlInSecs: 600,
    userId: externalUserId,
    levelName: sumsubLevelForRoute(route),
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", env.sumsubSecretKey())
    .update(`${timestamp}POST${path}${body}`)
    .digest("hex");

  const response = await fetch(`${env.sumsubApiUrl()}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-App-Token": env.sumsubAppToken(),
      "X-App-Access-Ts": timestamp,
      "X-App-Access-Sig": signature,
    },
    body,
  });
  const payload = await response.json().catch(() => null) as { token?: string; description?: string } | null;
  if (!response.ok || !payload?.token) {
    throw new Error(payload?.description || `Identity provider returned ${response.status}`);
  }
  return payload.token;
}

export function verifySumsubWebhookDigest({
  rawBody,
  digest,
  algorithm,
}: {
  rawBody: string;
  digest: string;
  algorithm: string;
}): boolean {
  const nodeAlgorithm = algorithm === "HMAC_SHA256_HEX"
    ? "sha256"
    : algorithm === "HMAC_SHA512_HEX"
    ? "sha512"
    : null;
  if (!nodeAlgorithm || !/^[a-f0-9]+$/i.test(digest)) return false;
  const calculated = createHmac(nodeAlgorithm, env.sumsubWebhookSecret())
    .update(rawBody)
    .digest("hex");
  const suppliedBytes = Buffer.from(digest, "hex");
  const calculatedBytes = Buffer.from(calculated, "hex");
  return suppliedBytes.length === calculatedBytes.length
    && timingSafeEqual(suppliedBytes, calculatedBytes);
}
