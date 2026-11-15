import { Auth } from "@auth/core";
import { authConfig } from "./config.js";
import { isDirector } from "./directors.js";
import { listEmployees } from "./employees.js";
import { getRolePermissions, SITE_TABS } from "./permissions.js";

export async function resolveSiteActor(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  if (!process.env.AUTH_SECRET || !process.env.AUTH_DISCORD_ID || !process.env.AUTH_DISCORD_SECRET) {
    response.status(503).json({ error: "auth_not_configured" });
    return null;
  }

  let session;
  try {
    const sessionRequest = new Request(new URL("https://harmony-repair.invalid/api/auth/session"), {
      headers: { cookie: request.headers.cookie || "" },
    });
    const result = await Auth(sessionRequest, authConfig());
    if (!result.ok) throw new Error("session_unavailable");
    session = await result.json();
  } catch {
    response.status(401).json({ error: "authentication_required" });
    return null;
  }

  const discordId = String(session?.user?.discordId || session?.user?.id || "");
  if (!discordId) {
    response.status(401).json({ error: "authentication_required" });
    return null;
  }
  const actor = { id: discordId, discordId, name: session.user.name || "Compte Discord" };
  const adminIds = (process.env.HARMONY_ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean);
  if (adminIds.includes(discordId)) return { ...actor, role: "admin", kind: "admin", tabs: [...SITE_TABS, "directors"] };

  try {
    if (await isDirector(discordId)) return { ...actor, role: "director", kind: "director", tabs: SITE_TABS };
    const employee = (await listEmployees()).find((item) => item.discordId === discordId);
    if (employee) return {
      ...actor,
      role: employee.garageRole,
      kind: "employee",
      employeeId: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      tabs: null,
    };
  } catch {
    response.status(503).json({ error: "storage_unavailable" });
    return null;
  }

  response.status(403).json({ error: "site_access_required" });
  return null;
}

export async function getActorTabs(actor) {
  if (actor.kind !== "employee") return actor.tabs || [];
  const permissions = await getRolePermissions();
  return SITE_TABS.filter((tab) => permissions[actor.role]?.[tab]);
}

export async function requireSiteTab(request, response, tab) {
  const actor = await resolveSiteActor(request, response);
  if (!actor) return null;
  if (actor.kind !== "employee") return { ...actor, garageRole: null };

  try {
    const tabs = await getActorTabs(actor);
    if (!tabs.includes(tab)) {
      response.status(403).json({ error: "tab_access_required", tab });
      return null;
    }
    return { ...actor, garageRole: actor.role, tabs };
  } catch {
    response.status(503).json({ error: "storage_unavailable" });
    return null;
  }
}
