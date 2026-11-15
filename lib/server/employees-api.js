import { del } from "@vercel/blob";
import { requireDirector } from "./director.js";
import { isSameOrigin, json, methodNotAllowed } from "./http.js";
import { isValidGarageRole, listEmployees, newEmployee, saveEmployee } from "./employees.js";

export async function handleEmployeeBulk(request, response) {
  if (!await requireDirector(request, response)) return;
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const rows = request.body?.rows;
  const role = typeof request.body?.garageRole === "string" ? request.body.garageRole.trim() : "";
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 100 || !isValidGarageRole(role)) return json(response, 400, { error: "invalid_employee_batch" });
  const clean = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const normalized = rows.map((row) => ({ firstName: clean(row?.firstName), lastName: clean(row?.lastName), employeeNumber: clean(row?.employeeNumber) }));
  if (normalized.some((row) => row.firstName.length < 1 || row.firstName.length > 60 || row.lastName.length < 1 || row.lastName.length > 60 || !/^[\p{L}\p{N}_-]{2,24}$/u.test(row.employeeNumber))) return json(response, 400, { error: "invalid_employee_batch" });
  const seen = new Set();
  for (const row of normalized) {
    const key = row.employeeNumber.toLocaleLowerCase("fr");
    if (seen.has(key)) return json(response, 409, { error: "employee_number_duplicate_in_batch" });
    seen.add(key);
  }
  try {
    const existing = await listEmployees();
    if (existing.some((employee) => seen.has(employee.employeeNumber.toLocaleLowerCase("fr")))) return json(response, 409, { error: "employee_number_exists" });
    const created = [];
    try {
      for (const row of normalized) created.push(await saveEmployee(newEmployee(row.firstName, row.lastName, row.employeeNumber, "", role)));
    } catch {
      await Promise.allSettled(created.map((employee) => del(`harmony/employees/${employee.id}.json`, { access: "private" })));
      return json(response, 503, { error: "bulk_creation_failed" });
    }
    return json(response, 201, { employees: created });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
