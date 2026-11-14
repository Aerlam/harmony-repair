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
      memberCount: Number.isInteger(contract.memberCount) && contract.memberCount > 0 ? contract.memberCount : null,
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

export function makeContract({ name, category, services, memberCount, weeklyPrice, restrictToPeople, authorizedPeople }, actorId) {
  const now = new Date().toISOString();
  return { id: randomUUID(), name, category, services, memberCount, weeklyPrice, restrictToPeople, authorizedPeople, createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId };
}

export function isValidContract(value) {
  return Boolean(
    value &&
    typeof value.name === "string" && value.name.trim().length >= 2 && value.name.trim().length <= 100 &&
    CONTRACT_CATEGORIES.includes(value.category) &&
    (value.memberCount === null || (Number.isSafeInteger(value.memberCount) && value.memberCount >= 1 && value.memberCount <= 10000)) &&
    Number.isSafeInteger(value.weeklyPrice) && value.weeklyPrice >= 0 && value.weeklyPrice <= 1000000000 &&
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
