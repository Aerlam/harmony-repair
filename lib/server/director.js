import { Auth } from "@auth/core";
import { authConfig } from "./config.js";
import { isDirector } from "./directors.js";

export async function requireDirector(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  if (!process.env.AUTH_SECRET || !process.env.AUTH_DISCORD_ID || !process.env.AUTH_DISCORD_SECRET) {
    response.status(503).json({ error: "auth_not_configured" });
    return null;
  }

  const url = new URL("https://harmony-repair.invalid/api/auth/session");
  const sessionRequest = new Request(url, {
    headers: { cookie: request.headers.cookie || "" },
  });
  let session;
  try {
    const result = await Auth(sessionRequest, authConfig());
    if (!result.ok) throw new Error("session_unavailable");
    session = await result.json();
  } catch {
    response.status(401).json({ error: "authentication_required" });
    return null;
  }

  const userId = String(session?.user?.id || "");
  if (!userId) {
    response.status(401).json({ error: "authentication_required" });
    return null;
  }

  const admins = (process.env.HARMONY_ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
  if (admins.includes(userId)) return { id: userId, name: session.user.name || "Direction", role: "admin" };
  let authorized = false;
  try { authorized = await isDirector(userId); }
  catch {
    response.status(503).json({ error: "storage_unavailable" });
    return null;
  }
  if (!authorized) {
    response.status(403).json({ error: "director_access_required" });
    return null;
  }
  return { id: userId, name: session.user.name || "Direction", role: "director" };
}
