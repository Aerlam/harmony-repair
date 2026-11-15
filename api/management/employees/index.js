import { requireSiteTab } from "../../../lib/server/site-access.js";
import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";
import { isValidDiscordId, isValidGarageRole, listEmployees, newEmployee, saveEmployee } from "../../../lib/server/employees.js";
import { handleContractCollection } from "../../../lib/server/contracts-api.js";

export const config = { api: { bodyParser: { sizeLimit: "5mb" } } };

export default async function handler(request, response) {
  if (request.query?.resource === "access") return (await import("../../../lib/server/permissions-api.js")).handleCurrentSiteAccess(request, response);
  if (request.query?.resource === "permissions") return (await import("../../../lib/server/permissions-api.js")).handleRolePermissions(request, response);
  if (request.query?.resource === "contract-import") return (await import("../../../lib/server/contract-import.js")).handleContractImport(request, response);
  if (request.query?.resource === "contracts") return handleContractCollection(request, response);
  if (request.query?.resource === "bulk") return (await import("../../../lib/server/employees-api.js")).handleEmployeeBulk(request, response);
  if (request.query?.resource === "usage") return (await import("../../../lib/server/contract-usage.js")).handleContractUsage(request, response);
  if (request.query?.resource === "dashboard") {
    const actor = await requireSiteTab(request, response, "dashboard");
    if (!actor) return;
    if (request.method !== "GET") return methodNotAllowed(response, ["GET"]);
    try {
      const employees = await listEmployees();
      return json(response, 200, {
        employees: employees.map((employee) => ({
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          employeeNumber: employee.employeeNumber,
          garageRole: employee.garageRole,
          documents: Object.fromEntries(["identity", "license", "diploma", "contract"].map((type) => [
            type,
            type === "diploma"
              ? Boolean(employee.documents?.diploma || employee.documents?.diplomas?.length)
              : Boolean(employee.documents?.[type]),
          ])),
        })),
        role: actor.kind === "employee" ? actor.garageRole : actor.role,
        name: actor.name,
      });
    } catch { return json(response, 503, { error: "storage_unavailable" }); }
  }
  const actor = await requireSiteTab(request, response, "employees");
  if (!actor) return;
  if (request.method === "GET") {
    try { return json(response, 200, { employees: await listEmployees(), role: actor.role, name: actor.name }); }
    catch { return json(response, 503, { error: "storage_unavailable" }); }
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const { firstName, lastName, employeeNumber, discordId, garageRole } = request.body || {};
  const clean = (value) => typeof value === "string" ? value.trim() : "";
  const first = clean(firstName), last = clean(lastName), number = clean(employeeNumber), discord = clean(discordId), role = clean(garageRole);
  if (first.length < 1 || first.length > 60 || last.length < 1 || last.length > 60 || !/^[\p{L}\p{N}_-]{2,24}$/u.test(number) || (discord && !isValidDiscordId(discord)) || !isValidGarageRole(role)) {
    return json(response, 400, { error: "invalid_employee" });
  }
  try {
    const employees = await listEmployees();
    if (employees.some((employee) => employee.employeeNumber.toLowerCase() === number.toLowerCase())) {
      return json(response, 409, { error: "employee_number_exists" });
    }
    if (discord && employees.some((employee) => employee.discordId === discord)) {
      return json(response, 409, { error: "employee_discord_id_exists" });
    }
    const employee = await saveEmployee(newEmployee(first, last, number, discord, role));
    return json(response, 201, { employee });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}

