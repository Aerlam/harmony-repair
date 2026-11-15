import { isSameOrigin, json, methodNotAllowed } from "./http.js";
import { requireDirector } from "./director.js";
import { contractNameExists, isValidContract, listContracts, makeContract, saveContracts } from "./contracts.js";
import { del, get, put } from "@vercel/blob";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";

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
    responsibleName: cleanName(draft.responsibleName),
    declaredMembers: draft.declaredMembers,
    contactName: cleanName(draft.contactName),
    pricingMode: draft.pricingMode,
    weeklyPrice: draft.weeklyPrice,
    startDate: typeof draft.startDate === "string" ? draft.startDate : "",
    restrictToPeople: draft.restrictToPeople,
    authorizedPeople,
  };
}

function decodeContractPdf(body = {}) {
  const encoded = typeof body.data === "string" ? body.data : "";
  if (encoded.length > Math.ceil(MAX_CONTRACT_BYTES * 4 / 3) + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return { error: "invalid_contract_file" };
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_CONTRACT_BYTES) return { error: "contract_file_too_large" };
  if (bytes.subarray(0, 5).toString() !== "%PDF-") return { error: "unsupported_contract_file" };
  return { bytes };
}

function normalizePdfText(value) {
  return value.normalize("NFKC")
    .replace(/\b(?:[\p{L}]\s+){2,}[\p{L}]\b/gu, (match) => match.replace(/\s+/g, ""))
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseContractFields(text) {
  const clean = (value) => value?.trim().replace(/\s+/g, " ") || "";
  const groupMatch = text.match(/Nom du groupe\s+(.+?)\s+Patron\s*\/\s*Responsable/i);
  const companyMatch = text.match(/Nom de l'entreprise\s+(.+?)\s+(?:Patron\s*\/\s*Responsable|Repr[eé]sentant)/i);
  const responsibleMatch = text.match(/Patron\s*\/\s*Responsable\s+(.+?)\s+Nombre d'employ[eé]s d[eé]clar[eé]s/i);
  const representativeMatch = text.match(/Repr[eé]sentant\s+(.+?)\s+(?:Contact de r[eé]f[eé]rence|Date|Signature|Page\s+\d)/i);
  const contactMatch = text.match(/Contact de r[eé]f[eé]rence\s+(.+?)(?:\s+Harmony Repair|\s+Page\s+\d|$)/i);
  const membersMatch = text.match(/Nombre d'employ[eé]s d[eé]clar[eé]s\s+(\d{1,5})/i);
  const dateMatch = text.match(/Date de prise d'effet\s*:\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/i);
  const chosenMatch = text.match(/Formule chois\w*\s*:\s*(.+?)(?=\s+Page\s+\d|$)/i);
  const chosen = chosenMatch?.[1] || "";
  const pricingMode = /formule au membre/i.test(chosen) ? "per_member" : /formule au forfait/i.test(chosen) ? "flat" : "";
  let weeklyPrice = null;
  if (pricingMode === "per_member") {
    const perMemberMatch = text.match(/Formule au membre\s+([\d\s]+?)\s*\$\s*par employ[eé]\s+et par semaine/i);
    if (perMemberMatch) weeklyPrice = Number(perMemberMatch[1].replace(/\s/g, ""));
  } else if (pricingMode === "flat") {
    const declaredMembers = Number(membersMatch?.[1] || 0);
    const rangeMatch = chosen.match(/(\d+)\s*(?:à|-)\s*(\d+)\s+employ[eé]s/i);
    const optionMatch = chosen.match(/(\d+)\s*(?:re|er|e|ère|ere|ème|eme)\s+option/i);
    const rates = [...text.matchAll(/(\d+)\s*(?:à|-)\s*(\d+)\s+employ[eé]s\s+([\d\s]+?)\s*\$\s*par semaine/gi)];
    const selectedRate = rangeMatch
      ? rates.find((rate) => Number(rate[1]) === Number(rangeMatch[1]) && Number(rate[2]) === Number(rangeMatch[2]))
      : rates.find((rate) => declaredMembers >= Number(rate[1]) && declaredMembers <= Number(rate[2]));
    const fallbackRate = optionMatch ? rates[Number(optionMatch[1]) - 1] : null;
    const rate = selectedRate || fallbackRate;
    if (rate) weeklyPrice = Number(rate[3].replace(/\s/g, ""));
  }
  const services = [];
  if (/r[eé]paration/i.test(text)) services.push("repair");
  if (/fourri[eè]re/i.test(text)) services.push("impound");
  if (/d[eé]placement/i.test(text)) services.push("displacement");
  const startDate = dateMatch ? `${dateMatch[3]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}` : "";
  return {
    name: clean(companyMatch?.[1] || groupMatch?.[1]),
    category: companyMatch ? "entreprise" : groupMatch ? "famille_groupe" : "",
    responsibleName: clean(responsibleMatch?.[1] || representativeMatch?.[1]),
    declaredMembers: membersMatch ? Number(membersMatch[1]) : null,
    contactName: clean(contactMatch?.[1] || representativeMatch?.[1]),
    pricingMode,
    weeklyPrice,
    startDate,
    services,
  };
}

async function extractContractPdf(bytes) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, verbosity: 0 });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error("too_many_pages");
    const pages = [];
    let length = 0;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items.map((item) => item.str || "").join(" ");
      length += pageText.length;
      if (length > 200000) throw new Error("text_too_large");
      pages.push(pageText);
      page.cleanup();
    }
    const text = normalizePdfText(pages.join(" "));
    if (text.length < 20) throw new Error("no_readable_text");
    return parseContractFields(text);
  } finally {
    await task.destroy();
  }
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
  const isFile = request.query?.resource === "contract-file";
  if (isFile ? !["GET", "PUT", "DELETE"].includes(request.method) : !["PATCH", "DELETE"].includes(request.method)) return methodNotAllowed(response, isFile ? ["GET", "PUT", "DELETE"] : ["PATCH", "DELETE"]);
  if (["PUT", "DELETE"].includes(request.method) && !isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const id = String(request.query?.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(response, 400, { error: "invalid_contract_id" });
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
      await put(pathname, bytes, { access: "private", addRandomSuffix: false, contentType: "application/pdf" });
      const originalName = typeof body.fileName === "string" ? body.fileName.split(/[\\/]/).pop() : "contrat.pdf";
      const filename = originalName.replace(/[^\p{L}\p{N}._() -]/gu, "").slice(0, 100) || "contrat.pdf";
      const updated = { ...current, contractFile: { pathname, filename, contentType: "application/pdf", size: bytes.length, uploadedAt: new Date().toISOString() }, updatedAt: new Date().toISOString(), updatedBy: actor.id };
      await saveContracts(contracts.map((item) => item.id === id ? updated : item));
      if (current.contractFile?.pathname) await del(current.contractFile.pathname, { access: "private" });
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
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
