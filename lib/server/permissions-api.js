import { requireDirector } from "./director.js";
import { isSameOrigin, json, methodNotAllowed } from "./http.js";
import { GARAGE_ROLES } from "./employees.js";
import { getRolePermissions, saveRolePermissions, SITE_TABS, SITE_TAB_LABELS } from "./permissions.js";

export async function handleRolePermissions(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (actor.role !== "admin") return json(response, 403, { error: "admin_access_required" });
  if (request.method === "GET") {
    try {
      return json(response, 200, {
        roles: GARAGE_ROLES,
        tabs: SITE_TABS.map((key) => ({ key, label: SITE_TAB_LABELS[key] })),
        lockedTabs: [{ key: "directors", label: "Accès", note: "Réservé à l’admin principal" }],
        permissions: await getRolePermissions(),
      });
    } catch { return json(response, 503, { error: "storage_unavailable" }); }
  }
  if (request.method !== "PUT") return methodNotAllowed(response, ["GET", "PUT"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  try {
    const permissions = await saveRolePermissions(request.body?.permissions);
    return json(response, 200, { permissions });
  } catch (error) {
    return json(response, error?.message === "invalid_role_permissions" ? 400 : 503, {
      error: error?.message === "invalid_role_permissions" ? "invalid_role_permissions" : "storage_unavailable",
    });
  }
}

export async function handleCurrentSiteAccess(request, response) {
  if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
  const { resolveSiteActor, getActorTabs } = await import("./site-access.js");
  const actor = await resolveSiteActor(request, response);
  if (!actor) return;
  try {
    return json(response, 200, {
      user: { id: actor.id, name: actor.name },
      role: actor.role,
      kind: actor.kind,
      tabs: await getActorTabs(actor),
    });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
