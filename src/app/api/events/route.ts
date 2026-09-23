import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { marketplaceEventSchema } from "@/lib/validation/schemas";
import { ipFromRequest, rateLimit } from "@/lib/security/rate-limit";
import { trackServerEvent } from "@/lib/analytics/server";

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const parsed = marketplaceEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ip = ipFromRequest(request);
  if (!rateLimit(`event:${ip}`, 120, 60_000).ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const userClient = await getServerSupabase();
  const { data: auth } = await userClient.auth.getUser();
  await trackServerEvent({
    eventName: parsed.data.eventName,
    userId: auth.user?.id,
    anonymousSessionId: parsed.data.anonymousSessionId,
    productId: parsed.data.productId,
    vendorId: parsed.data.vendorId,
    metadata: parsed.data.metadata,
  });
  return new NextResponse(null, { status: 204 });
}
