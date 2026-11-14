import { isSameOrigin, json, methodNotAllowed } from "./http.js";
import { requireDirector } from "./director.js";
import { contractNameExists, isValidContract, listContracts, makeContract, saveContracts } from "./contracts.js";

function cleanContractDraft(draft = {}) {
  const cleanName = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const authorizedPeople = Array.isArray(draft.authorizedPeople) ? draft.authorizedPeople.map((person) => ({
    firstName: cleanName(person?.firstName),
    lastName: cleanName(person?.lastName),
  })) : [];
  return {
    name: cleanName(draft.name),
    category: draft.category,
    services: Array.isArray(draft.services) ? [...new Set(draft.services)] : [],
    memberCount: draft.memberCount,
    weeklyPrice: draft.weeklyPrice,
    restrictToPeople: draft.restrictToPeople,
    authorizedPeople,
  };
}

export async function handleContractCollection(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (request.method === "GET") {
    try { return json(response, 200, { contracts: await listContracts(), role: actor.role }); }
    catch { return json(response, 503, { error: "storage_unavailable" }); }
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const contract = cleanContractDraft(request.body);
  if (!isValidContract(contract)) return json(response, 400, { error: "invalid_contract" });
  try {
    const contracts = await listContracts();
    if (contractNameExists(contracts, contract.name, contract.category)) return json(response, 409, { error: "contract_exists" });
    const created = makeContract(contract, actor.id);
    await saveContracts([...contracts, created]);
    return json(response, 201, { contract: created });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}

export async function handleContractItem(request, response) {
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
    const updated = cleanContractDraft(request.body);
    if (!isValidContract(updated)) return json(response, 400, { error: "invalid_contract" });
    if (contractNameExists(contracts, updated.name, updated.category, id)) return json(response, 409, { error: "contract_exists" });
    const next = { ...current, ...updated, updatedAt: new Date().toISOString(), updatedBy: actor.id };
    await saveContracts(contracts.map((item) => item.id === id ? next : item));
    return json(response, 200, { contract: next });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
