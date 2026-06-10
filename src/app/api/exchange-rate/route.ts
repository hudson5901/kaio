import { NextResponse } from "next/server";
import { getExchangeRateInfo } from "@/lib/exchange-rate";

export async function GET() {
  const info = await getExchangeRateInfo();
  return NextResponse.json(info);
}
