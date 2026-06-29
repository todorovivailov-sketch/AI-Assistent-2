import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const token = process.env.DASHBOARD_ACCESS_TOKEN;

  if (!token && process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  if (!token) {
    return new NextResponse("Dashboard access is not configured.", { status: 503 });
  }

  if (isAuthorized(request.headers.get("authorization"), token)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="AI Receptionist Dashboard", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: [
    "/",
    "/appointments/:path*",
    "/assistant/:path*",
    "/calls/:path*",
    "/conversations/:path*",
    "/customers/:path*",
    "/inbox/:path*",
    "/leads/:path*",
    "/orders/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};

function isAuthorized(authorization: string | null, expectedToken: string) {
  if (!authorization) return false;

  if (authorization.startsWith("Bearer ")) {
    return safeEqual(authorization.slice("Bearer ".length), expectedToken);
  }

  if (!authorization.startsWith("Basic ")) return false;

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separatorIndex = decoded.indexOf(":");
    const password = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : decoded;
    return safeEqual(password, expectedToken);
  } catch {
    return false;
  }
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}
