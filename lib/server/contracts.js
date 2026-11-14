import { get, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const PATH = "harmony/settings/contracts.json";
export const CONTRACT_CATEGORIES = ["entreprise", "famille", "groupe"];
export const CONTRACT_SERVICES = ["repair", "impound", "displacement"];

export async function listContracts() {
  const stored = await get(PATH, { access: "private" });
  if (!stored) return [];
  return JSON.parse(await new Response(stored.stream).text());
}

export async function saveContracts(contracts) {
  await put(PATH, JSON.stringify(contracts), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json",
  });
  return contracts;
}

export function makeContract({ name, category, services }, actorId) {
  const now = new Date().toISOString();
  return { id: randomUUID(), name, category, services, createdAt: now, updatedAt: now, createdBy: actorId, updatedBy: actorId };
}

export function isValidContract(value) {
  return Boolean(
    value &&
    typeof value.name === "string" && value.name.trim().length >= 2 && value.name.trim().length <= 100 &&
    CONTRACT_CATEGORIES.includes(value.category) &&
    Array.isArray(value.services) && value.services.length >= 1 && value.services.length <= CONTRACT_SERVICES.length &&
    value.services.every((service) => CONTRACT_SERVICES.includes(service))
  );
}

export function contractNameExists(contracts, name, category, exceptId = "") {
  const normalized = name.trim().toLocaleLowerCase("fr");
  return contracts.some((item) => item.id !== exceptId && item.category === category && item.name.trim().toLocaleLowerCase("fr") === normalized);
}
