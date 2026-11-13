import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";
import { listDirectors, saveDirectors } from "../../../lib/server/directors.js";
import { requireDirector } from "../../../lib/server/director.js";

const isSnowflake = (value) => /^\d{17,20}$/.test(value);

export default async function handler(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (actor.role !== "admin") return json(response, 403, { error: "admin_access_required" });
  if (request.method === "GET") {
    try {
      const stored = await listDirectors();
      const admins = (process.env.HARMONY_ADMIN_IDS || "").split(",").map((id) => id.trim()).filter(Boolean)
        .map((discordId) => ({ discordId, name: "Admin principal", role: "admin", addedAt: null }));
      return json(response, 200, { directors: [...admins, ...stored] });
    }
    catch { return json(response, 503, { error: "storage_unavailable" }); }
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const discordId = typeof request.body?.discordId === "string" ? request.body.discordId.trim() : "";
  const name = typeof request.body?.name === "string" ? request.body.name.trim().slice(0, 60) : "";
  if (!isSnowflake(discordId)) return json(response, 400, { error: "invalid_discord_id" });
  const admins = (process.env.HARMONY_ADMIN_IDS || "").split(",").map((id) => id.trim());
  if (admins.includes(discordId)) return json(response, 409, { error: "already_admin" });
  try {
    const directors = await listDirectors();
    if (directors.some((director) => director.discordId === discordId)) return json(response, 409, { error: "director_exists" });
    directors.push({ discordId, name: name || "Directeur", addedAt: new Date().toISOString(), addedBy: actor.id });
    return json(response, 201, { directors: await saveDirectors(directors) });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
