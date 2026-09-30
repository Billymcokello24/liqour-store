import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

export type Role = "super_admin" | "manager" | "sales" | "inventory" | "delivery" | "support" | "customer";
export type Session = { userId: string; role: Role; email: string };

const secret = new TextEncoder().encode(process.env.AUTH_SECRET);

function authSecret() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET must be configured.");
  return secret;
}

export async function createSession(session: Session) {
  return new SignJWT({ role: session.role, email: session.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.userId)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(authSecret());
}

export async function requireSession(request: NextRequest, roles?: Role[]) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Response("Authentication required.", { status: 401 });

  try {
    const { payload } = await jwtVerify(token, authSecret());
    const session: Session = {
      userId: payload.sub ?? "",
      email: String(payload.email ?? ""),
      role: payload.role as Role,
    };
    if (!session.userId || !session.role || (roles && !roles.includes(session.role))) {
      throw new Response("You are not authorized to perform this action.", { status: 403 });
    }
    return session;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response("Invalid or expired session.", { status: 401 });
  }
}
