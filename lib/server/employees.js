import { get, list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

const PREFIX = "harmony/employees/";
export const DOC_TYPES = ["identity", "license", "diploma"];

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
    contentType: "application/json", cacheControlMaxAge: 0,
  });
  return employee;
}

export async function listEmployees() {
  const all = [];
  let cursor;
  do {
    const page = await list({ prefix: PREFIX, cursor, limit: 1000, access: "private" });
    for (const item of page.blobs) {
      if (!item.pathname.endsWith(".json")) continue;
      const record = await get(item.pathname, { access: "private" });
      if (record) all.push(JSON.parse(await new Response(record.stream).text()));
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return all.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"));
}

export function newEmployee(firstName, lastName, employeeNumber) {
  const now = new Date().toISOString();
  return { id: randomUUID(), firstName, lastName, employeeNumber, documents: {}, createdAt: now, updatedAt: now };
}
