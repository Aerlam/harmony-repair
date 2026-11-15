import { get, put } from "@vercel/blob";
import { GARAGE_ROLES } from "./employees.js";

const PATH = "harmony/settings/role-permissions.json";
export const SITE_TABS = ["dashboard", "employees", "contracts", "services"];
export const SITE_TAB_LABELS = {
  dashboard: "Vue d’ensemble",
  employees: "Employés",
  contracts: "Contrats",
  services: "Partenaires",
};

const MANAGER_ROLES = new Set(["Patron", "Co-patron", "DRH", "RH", "Chef d’atelier"]);
export const DEFAULT_ROLE_PERMISSIONS = Object.fromEntries(GARAGE_ROLES.map((role) => [
  role,
  Object.fromEntries(SITE_TABS.map((tab) => [
    tab,
    tab === "services" || (MANAGER_ROLES.has(role) && ["dashboard", "employees", "contracts"].includes(tab)),
  ])),
]));

function normalizePermissions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const normalized = {};
  for (const role of GARAGE_ROLES) {
    const row = value[role];
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    normalized[role] = {};
    for (const tab of SITE_TABS) {
      if (typeof row[tab] !== "boolean") return null;
      normalized[role][tab] = row[tab];
    }
    if (!SITE_TABS.some((tab) => normalized[role][tab])) return null;
  }
  return normalized;
}

export async function getRolePermissions() {
  const stored = await get(PATH, { access: "private" });
  if (!stored) return structuredClone(DEFAULT_ROLE_PERMISSIONS);
  const parsed = JSON.parse(await new Response(stored.stream).text());
  const normalized = normalizePermissions(parsed);
  if (!normalized) throw new Error("invalid_role_permissions");
  return normalized;
}

export async function saveRolePermissions(value) {
  const normalized = normalizePermissions(value);
  if (!normalized) throw new Error("invalid_role_permissions");
  await put(PATH, JSON.stringify(normalized), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return normalized;
}
