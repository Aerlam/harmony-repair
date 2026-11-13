import { del } from "@vercel/blob";
import { requireDirector } from "../../../lib/server/director.js";
import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";
import { loadEmployee, saveEmployee } from "../../../lib/server/employees.js";

export default async function handler(request, response) {
  if (!await requireDirector(request, response)) return;
  const id = String(request.query?.id || "");
  if (["PATCH", "DELETE"].includes(request.method) && !isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  try {
    const employee = await loadEmployee(id);
    if (!employee) return json(response, 404, { error: "employee_not_found" });
    if (request.method === "GET") return json(response, 200, { employee });
    if (request.method === "PATCH") {
      const { firstName, lastName, employeeNumber } = request.body || {};
      const clean = (value) => typeof value === "string" ? value.trim() : "";
      const first = clean(firstName), last = clean(lastName), number = clean(employeeNumber);
      if (first.length < 1 || first.length > 60 || last.length < 1 || last.length > 60 || !/^[\p{L}\p{N}_-]{2,24}$/u.test(number)) return json(response, 400, { error: "invalid_employee" });
      const { listEmployees } = await import("../../../lib/server/employees.js");
      const duplicate = (await listEmployees()).some((item) => item.id !== id && item.employeeNumber.toLowerCase() === number.toLowerCase());
      if (duplicate) return json(response, 409, { error: "employee_number_exists" });
      employee.firstName = first; employee.lastName = last; employee.employeeNumber = number;
      return json(response, 200, { employee: await saveEmployee(employee) });
    }
    if (request.method === "DELETE") {
      for (const doc of Object.values(employee.documents || {})) if (doc?.pathname) await del(doc.pathname, { access: "private" });
      await del(`harmony/employees/${id}.json`, { access: "private" });
      return json(response, 200, { deleted: true });
    }
    return methodNotAllowed(response, ["GET", "PATCH", "DELETE"]);
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
