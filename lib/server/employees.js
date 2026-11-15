import { get, list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const PREFIX = "harmony/employees/";
export const DOC_TYPES = ["identity", "license", "diploma", "contract"];
export const GARAGE_ROLES = ["Patron", "Co-patron", "DRH", "RH", "Chef d’atelier", "Mécano confirmé", "Mécano apprenti", "Stagiaire"];

export function isValidDiscordId(value) { return /^\d{17,20}$/.test(value); }
export function isValidGarageRole(value) { return GARAGE_ROLES.includes(value); }

export async function loadEmployee(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const result = await get(`${PREFIX}${id}.json`, { access: "private" });
  if (!result) return null;
  return JSON.parse(await new Response(result.stream).text());
}

export async function saveEmployee(employee) {
  employee.updatedAt = new Date().toISOString();
  await put(`${PREFIX}${employee.id}.json`, JSON.stringify(employee), {
    access: "private", addRandomSuffix: false, allowOverwrite: true,
    contentType: "application/json",
  });
  return employee;
}

export async function listEmployees() {
  const all = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000, access: "private" });
    const paths = page.blobs.filter((item) => item.pathname.endsWith(".json")).map((item) => item.pathname);
    // Fetch a small batch concurrently: avoids one network round-trip per
    // employee while keeping pressure on private Blob storage predictable.
    for (let index = 0; index < paths.length; index += 20) {
      const records = await Promise.all(paths.slice(index, index + 20).map((pathname) => get(pathname, { access: "private" })));
      for (const record of records) {
        if (record) all.push(JSON.parse(await new Response(record.stream).text()));
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return all.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"));
}

export function newEmployee(firstName, lastName, employeeNumber, discordId, garageRole) {
  const now = new Date().toISOString();
  return { id: randomUUID(), firstName, lastName, employeeNumber, discordId, garageRole, documents: {}, createdAt: now, updatedAt: now };
}

