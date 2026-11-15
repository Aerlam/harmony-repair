import { isSameOrigin, json, methodNotAllowed } from "./http.js";
import { requireDirector } from "./director.js";
import { contractNameExists, isValidContract, listContracts, makeContract, saveContracts } from "./contracts.js";
import { del, get, put } from "@vercel/blob";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
const MAX_CONTRACT_BYTES = 3 * 1024 * 1024;

function cleanContractDraft(draft = {}) {
  const cleanName = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const authorizedPeople = Array.isArray(draft.authorizedPeople) ? draft.authorizedPeople.map((person) => ({
    firstName: cleanName(person?.firstName),
    lastName: cleanName(person?.lastName),
    employeeNumber: cleanName(person?.employeeNumber),
  })) : [];
  const members = Array.isArray(draft.members) ? draft.members.map((member) => ({
    firstName: cleanName(member?.firstName),
    lastName: cleanName(member?.lastName),
    employeeNumber: cleanName(member?.employeeNumber),
  })) : [];
  return {
    name: cleanName(draft.name),
    category: draft.category,
    services: Array.isArray(draft.services) ? [...new Set(draft.services)] : [],
    responsibleName: cleanName(draft.responsibleName),
    declaredMembers: draft.declaredMembers,
    contactName: cleanName(draft.contactName),
    pricingMode: draft.pricingMode,
    weeklyPrice: draft.weeklyPrice,
    startDate: typeof draft.startDate === "string" ? draft.startDate : "",
    restrictToPeople: draft.restrictToPeople,
    authorizedPeople,
    members,
  };
}

export async function handleContractCollection(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (request.method === "GET") {
    try {
      const contracts = await listContracts();
      const { getWeeklyContractUsage } = await import("./contract-usage.js");
      const usage = await getWeeklyContractUsage(contracts);
      return json(response, 200, { contracts: contracts.map((contract) => ({ ...contract, weeklyUsage: usage.summaries[contract.id] })), week: usage.week, role: actor.role });
    }
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
  const isFile = request.query?.resource === "contract-file";
  if (isFile ? !["GET", "PUT", "DELETE"].includes(request.method) : !["PATCH", "DELETE"].includes(request.method)) return methodNotAllowed(response, isFile ? ["GET", "PUT", "DELETE"] : ["PATCH", "DELETE"]);
  if (["PUT", "DELETE"].includes(request.method) && !isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const id = String(request.query?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error: "invalid_contract_id" });
  let operation = "load_contracts";
  let uploadedPathname = "";
  try {
    const contracts = await listContracts();
    const current = contracts.find((item) => item.id === id);
    if (!current) return json(response, 404, { error: "contract_not_found" });
    if (isFile && request.method === "GET") {
      if (!current.contractFile?.pathname) return json(response, 404, { error: "contract_file_not_found" });
      const file = await get(current.contractFile.pathname, { access: "private" });
      if (!file) return json(response, 404, { error: "contract_file_not_found" });
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      response.setHeader("Content-Type", "application/pdf");
      response.setHeader("Content-Disposition", "inline; filename=\"contrat-partenaire.pdf\"");
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.status(200);
      Readable.fromWeb(file.stream).pipe(response);
      return;
    }
    if (isFile && request.method === "PUT") {
      const body = request.body || {};
      const encoded = typeof body.data === "string" ? body.data : "";
      if (encoded.length > Math.ceil(MAX_CONTRACT_BYTES * 4 / 3) + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return json(response, 400, { error: "invalid_contract_file" });
      const bytes = Buffer.from(encoded, "base64");
      if (!bytes.length || bytes.length > MAX_CONTRACT_BYTES) return json(response, 413, { error: "contract_file_too_large" });
      if (bytes.subarray(0, 5).toString() !== "%PDF-") return json(response, 415, { error: "unsupported_contract_file" });
      const pathname = `harmony/contracts/${id}/${randomUUID()}.pdf`;
      operation = "upload_private_blob";
      await put(pathname, bytes, { access: "private", addRandomSuffix: false, contentType: "application/pdf" });
      uploadedPathname = pathname;
      const originalName = typeof body.fileName === "string" ? body.fileName.split(/[\\/]/).pop() : "contrat.pdf";
      const filename = originalName.replace(/[^\p{L}\p{N}._() -]/gu, "").slice(0, 100) || "contrat.pdf";
      const updated = { ...current, contractFile: { pathname, filename, contentType: "application/pdf", size: bytes.length, uploadedAt: new Date().toISOString() }, updatedAt: new Date().toISOString(), updatedBy: actor.id };
      operation = "save_contract_file_reference";
      await saveContracts(contracts.map((item) => item.id === id ? updated : item));
      uploadedPathname = "";
      if (current.contractFile?.pathname) {
        try { await del(current.contractFile.pathname, { access: "private" }); }
        catch (error) { console.warn("[contract-file] previous file cleanup failed", error?.name || "unknown"); }
      }
      console.info("[contract-file] saved", bytes.length);
      return json(response, 200, { contract: updated });
    }
    if (isFile && request.method === "DELETE") {
      if (!current.contractFile?.pathname) return json(response, 404, { error: "contract_file_not_found" });
      const updated = { ...current, contractFile: null, updatedAt: new Date().toISOString(), updatedBy: actor.id };
      await saveContracts(contracts.map((item) => item.id === id ? updated : item));
      await del(current.contractFile.pathname, { access: "private" });
      return json(response, 200, { contract: updated });
    }
    if (request.method === "DELETE") {
      await saveContracts(contracts.filter((item) => item.id !== id));
      if (current.contractFile?.pathname) await del(current.contractFile.pathname, { access: "private" });
      return json(response, 200, { deleted: true });
    }
    const updated = cleanContractDraft(request.body);
    if (!isValidContract(updated)) return json(response, 400, { error: "invalid_contract" });
    if (contractNameExists(contracts, updated.name, updated.category, id)) return json(response, 409, { error: "contract_exists" });
    const next = { ...current, ...updated, updatedAt: new Date().toISOString(), updatedBy: actor.id };
    await saveContracts(contracts.map((item) => item.id === id ? next : item));
    return json(response, 200, { contract: next });
  } catch (error) {
    if (uploadedPathname) {
      try { await del(uploadedPathname, { access: "private" }); }
      catch { console.warn("[contract-file] failed upload cleanup"); }
    }
    if (isFile && request.method === "PUT") {
      console.error("[contract-file] save failed", operation, error?.name || "unknown");
      return json(response, 503, { error: "contract_file_upload_failed" });
    }
    return json(response, 503, { error: "storage_unavailable" });
  }
}
