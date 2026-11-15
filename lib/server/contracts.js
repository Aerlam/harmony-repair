import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const PATH = "harmony/settings/contracts.json";
export const CONTRACT_CATEGORIES = ["entreprise", "famille_groupe"];
export const CONTRACT_SERVICES = ["repair", "impound", "displacement"];

export async function listContracts() {
  const stored = await get(PATH, { access: "private" });
  if (!stored) return [];
  const contracts = JSON.parse(await new Response(stored.stream).text());
  return contracts.map((contract) => {
    const authorizedPeople = Array.isArray(contract.authorizedPeople) ? contract.authorizedPeople : [];
    return {
      ...contract,
      category: ["famille", "groupe"].includes(contract.category) ? "famille_groupe" : contract.category,
      declaredMembers: Number.isSafeInteger(contract.declaredMembers) && contract.declaredMembers > 0 ? contract.declaredMembers : null,
      pricingMode: contract.pricingMode === "per_member" ? "per_member" : "flat",
      responsibleName: typeof contract.responsibleName === "string" ? contract.responsibleName : "",
      contactName: typeof contract.contactName === "string" ? contract.contactName : "",
      startDate: typeof contract.startDate === "string" ? contract.startDate : "",
      weeklyPrice: Number.isSafeInteger(contract.weeklyPrice) && contract.weeklyPrice >= 0 ? contract.weeklyPrice : 0,
      restrictToPeople: typeof contract.restrictToPeople === "boolean" ? contract.restrictToPeople : authorizedPeople.length > 0,
      authorizedPeople,
    };
  });
}

export async function saveContracts(contracts) {
  await put(PATH, JSON.stringify(contracts), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json",
  });
  return contracts;
}

export function makeContract({ name, category, services, responsibleName, declaredMembers, contactName, pricingMode, weeklyPrice, startDate, restrictToPeople, authorizedPeople }, actorId) {
  const now = new Date().toISOString();
  return { id: randomUUID(), name, category, services, responsibleName, declaredMembers, contactName, pricingMode, weeklyPrice, startDate, restrictToPeople, authorizedPeople, contractFile: null, createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId };
}

export function isValidContract(value) {
  return Boolean(
    value &&
    typeof value.name === "string" && value.name.trim().length >= 2 && value.name.trim().length <= 100 &&
    CONTRACT_CATEGORIES.includes(value.category) &&
    typeof value.responsibleName === "string" && value.responsibleName.length <= 100 &&
    Number.isSafeInteger(value.declaredMembers) && value.declaredMembers >= 1 && value.declaredMembers <= 10000 &&
    typeof value.contactName === "string" && value.contactName.length <= 100 &&
    ["flat", "per_member"].includes(value.pricingMode) &&
    Number.isSafeInteger(value.weeklyPrice) && value.weeklyPrice >= 0 && value.weeklyPrice <= 1000000000 &&
    typeof value.startDate === "string" && (value.startDate === "" || /^\d{4}-\d{2}-\d{2}$/.test(value.startDate)) &&
    Array.isArray(value.services) && value.services.length >= 1 && value.services.length <= CONTRACT_SERVICES.length &&
    value.services.every((service) => CONTRACT_SERVICES.includes(service)) &&
    typeof value.restrictToPeople === "boolean" &&
    Array.isArray(value.authorizedPeople) && value.authorizedPeople.length <= 100 &&
    value.authorizedPeople.every((person) => person && typeof person.firstName === "string" && person.firstName.trim().length >= 1 && person.firstName.trim().length <= 60 && typeof person.lastName === "string" && person.lastName.trim().length >= 1 && person.lastName.trim().length <= 60) &&
    (value.restrictToPeople ? value.authorizedPeople.length >= 1 : value.authorizedPeople.length === 0)
  );
}

export function contractNameExists(contracts, name, category, exceptId = "") {
  const normalized = name.trim().toLocaleLowerCase("fr");
  return contracts.some((item) => item.id !== exceptId && item.category === category && item.name.trim().toLocaleLowerCase("fr") === normalized);
}
