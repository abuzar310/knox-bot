import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Render proxies to localhost:PORT. Auth.js needs the public host for OAuth URLs.
 * Prefer AUTH_URL / RENDER_EXTERNAL_HOSTNAME over the internal Host header.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  const fromAuthUrl = process.env.AUTH_URL
    ? safeHost(process.env.AUTH_URL)
    : null;
  const publicHost =
    fromAuthUrl ?? process.env.RENDER_EXTERNAL_HOSTNAME ?? null;

  if (publicHost) {
    headers.set("x-forwarded-host", publicHost);
    headers.set("x-forwarded-proto", "https");
  }

  return NextResponse.next({ request: { headers } });
}

function safeHost(value: string): string | null {
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
