import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Auth disabled for now - pass through all requests
  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|processed/).*)"],
};
