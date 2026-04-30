import { NextRequest, NextResponse } from "next/server";

function unauthorizedResponse() {
  return new NextResponse("Mozek vyžaduje přihlášení.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Mozek", charset="UTF-8"'
    }
  });
}

function parseBasicAuth(authorization: string) {
  if (!authorization.startsWith("Basic ")) {
    return null;
  }

  const encoded = authorization.slice(6).trim();
  if (!encoded) {
    return null;
  }

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex < 0) {
      return null;
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    return { username, password };
  } catch {
    return null;
  }
}

function isInternalNextAdminRequest(request: NextRequest) {
  const accept = request.headers.get("accept") ?? "";

  return (
    request.headers.has("next-action") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    accept.includes("text/x-component")
  );
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminPath = pathname.startsWith("/admin");
  const isMozekPath = pathname.startsWith("/mozek");

  if (isAdminPath && !isInternalNextAdminRequest(request)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (!isMozekPath && !isAdminPath) {
    return NextResponse.next();
  }

  const expectedUser = process.env.ADMIN_BASIC_USER?.trim();
  const expectedPass = process.env.ADMIN_BASIC_PASS?.trim();

  if (!expectedUser || !expectedPass) {
    return new NextResponse("Mozek není nakonfigurovaný (chybí ADMIN_BASIC_USER/ADMIN_BASIC_PASS).", {
      status: 503
    });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const credentials = parseBasicAuth(authorization);
  if (!credentials) {
    return unauthorizedResponse();
  }

  if (credentials.username !== expectedUser || credentials.password !== expectedPass) {
    return unauthorizedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/mozek", "/mozek/:path*"]
};
