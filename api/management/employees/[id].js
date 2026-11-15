import { del } from "@vercel/blob";
import { requireSiteTab } from "../../../lib/server/site-access.js";
import { requireDirector } from "../../../lib/server/director.js";
import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";
import { isValidDiscordId, isValidGarageRole, loadEmployee, saveEmployee } from "../../../lib/server/employees.js";
import { handleContractItem } from "../../../lib/server/contracts-api.js";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(request, response) {
  if (["contracts", "contract-file", "service-options"].includes(request.query?.resource)) return handleContractItem(request, response);
  if (!["GET", "PATCH", "DELETE"].includes(request.method)) return methodNotAllowed(response, ["GET", "PATCH", "DELETE"]);
  const actor = request.method === "GET"
    ? await requireSiteTab(request, response, "employees")
    : await requireDirector(request, response);
  if (!actor) return;
  const id = String(request.query?.id || "");
  if (["PATCH", "DELETE"].includes(request.method) && !isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  try {
    const employee = await loadEmployee(id);
    if (!employee) return json(response, 404, { error: "employee_not_found" });
    if (request.method === "GET") return json(response, 200, { employee });
    if (request.method === "PATCH") {
      const { firstName, lastName, employeeNumber, discordId, garageRole } = request.body || {};
      const clean = (value) => typeof value === "string" ? value.trim() : "";
      const first = clean(firstName), last = clean(lastName), number = clean(employeeNumber), discord = clean(discordId), role = clean(garageRole);
      if (first.length < 1 || first.length > 60 || last.length < 1 || last.length > 60 || !/^[\p{L}\p{N}_-]{2,24}$/u.test(number) || (discord && !isValidDiscordId(discord)) || !isValidGarageRole(role)) return json(response, 400, { error: "invalid_employee" });
      const { listEmployees } = await import("../../../lib/server/employees.js");
      const allEmployees = await listEmployees();
      if (allEmployees.some((item) => item.id !== id && item.employeeNumber.toLowerCase() === number.toLowerCase())) return json(response, 409, { error: "employee_number_exists" });
      if (discord && allEmployees.some((item) => item.id !== id && item.discordId === discord)) return json(response, 409, { error: "employee_discord_id_exists" });
      employee.firstName = first; employee.lastName = last; employee.employeeNumber = number; employee.discordId = discord; employee.garageRole = role;
      return json(response, 200, { employee: await saveEmployee(employee) });
    }
    if (request.method === "DELETE") {
      const documents = Object.values(employee.documents || {}).flatMap((value) => Array.isArray(value) ? value : [value]);
      for (const doc of documents) if (doc?.pathname) await del(doc.pathname, { access: "private" });
      await del(`harmony/employees/${id}.json`, { access: "private" });
      return json(response, 200, { deleted: true });
    }
    return methodNotAllowed(response, ["GET", "PATCH", "DELETE"]);
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}

