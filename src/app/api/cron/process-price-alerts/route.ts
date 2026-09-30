import { NextResponse } from "next/server";
import { processDuePriceAlerts } from "@/lib/alerts/process";
import { isAuthorizedCron } from "@/lib/security/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }

async function handle(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await processDuePriceAlerts(250));
}
