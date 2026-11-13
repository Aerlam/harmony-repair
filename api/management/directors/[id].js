import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";
import { listDirectors, saveDirectors } from "../../../lib/server/directors.js";
import { requireDirector } from "../../../lib/server/director.js";

export default async function handler(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (actor.role !== "admin") return json(response, 403, { error: "admin_access_required" });
  if (request.method !== "DELETE") return methodNotAllowed(response, ["DELETE"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const id = String(request.query?.id || "");
  if (!/^\d{17,20}$/.test(id)) return json(response, 400, { error: "invalid_discord_id" });
  try {
    const directors = await listDirectors();
    const next = directors.filter((director) => director.discordId !== id);
    if (directors.length === next.length) return json(response, 404, { error: "director_not_found" });
    return json(response, 200, { directors: await saveDirectors(next) });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
