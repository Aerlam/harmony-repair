import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";
import { contractNameExists, isValidContract, listContracts, makeContract, saveContracts } from "../../../lib/server/contracts.js";
import { requireDirector } from "../../../lib/server/director.js";

export default async function handler(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (request.method === "GET") {
    try {
      const contracts = await listContracts();
      return json(response, 200, { contracts, role: actor.role });
    } catch { return json(response, 503, { error: "storage_unavailable" }); }
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const draft = request.body || {};
  const name = typeof draft.name === "string" ? draft.name.trim().replace(/\s+/g, " ") : "";
  const services = Array.isArray(draft.services) ? [...new Set(draft.services)] : [];
  const contract = { name, category: draft.category, services };
  if (!isValidContract(contract)) return json(response, 400, { error: "invalid_contract" });
  try {
    const contracts = await listContracts();
    if (contractNameExists(contracts, name, contract.category)) return json(response, 409, { error: "contract_exists" });
    const created = makeContract(contract, actor.id);
    await saveContracts([...contracts, created]);
    return json(response, 201, { contract: created });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
