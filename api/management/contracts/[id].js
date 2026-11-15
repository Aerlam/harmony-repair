import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";
import { CONTRACT_SERVICES, listContracts, saveContracts } from "../../../lib/server/contracts.js";
import { requireDirector } from "../../../lib/server/director.js";

export default async function handler(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (!["PATCH", "DELETE"].includes(request.method)) return methodNotAllowed(response, ["PATCH", "DELETE"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const id = String(request.query?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error: "invalid_contract_id" });
  try {
    const contracts = await listContracts();
    const current = contracts.find((item) => item.id === id);
    if (!current) return json(response, 404, { error: "contract_not_found" });
    if (request.method === "DELETE") {
      await saveContracts(contracts.filter((item) => item.id !== id));
      return json(response, 200, { deleted: true });
    }
    const draft = request.body || {};
    const services = Array.isArray(draft.services) ? [...new Set(draft.services)] : [];
    if (services.length < 1 || services.length > CONTRACT_SERVICES.length || services.some((service) => !CONTRACT_SERVICES.includes(service))) return json(response, 400, { error: "invalid_services" });
    const next = { ...current, services, updatedAt: new Date().toISOString(), updatedBy: actor.id };
    await saveContracts(contracts.map((item) => item.id === id ? next : item));
    return json(response, 200, { contract: next });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
