import { Auth } from "@auth/core";
import { authConfig } from "./config.js";
import { listEmployees } from "./employees.js";

export async function requireGarageEmployee(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  if (!process.env.AUTH_SECRET || !process.env.AUTH_DISCORD_ID || !process.env.AUTH_DISCORD_SECRET) {
    response.status(503).json({ error: "auth_not_configured" });
    return null;
  }
  const sessionRequest = new Request(new URL("https://harmony-repair.invalid/api/auth/session"), {
    headers: { cookie: request.headers.cookie || "" },
  });
  let session;
  try {
    const result = await Auth(sessionRequest, authConfig());
    if (!result.ok) throw new Error("session_unavailable");
    session = await result.json();
  } catch {
    response.status(401).json({ error: "authentication_required" });
    return null;
  }
  const discordId = String(session?.user?.discordId || session?.user?.id || "");
  if (!discordId) {
    response.status(401).json({ error: "authentication_required" });
    return null;
  }
  try {
    const employees = await listEmployees();
    const employee = employees.find((item) => item.discordId === discordId);
    if (!employee) {
      response.status(403).json({ error: "employee_access_required" });
      return null;
    }
    return { id: employee.id, discordId, firstName: employee.firstName, lastName: employee.lastName, garageRole: employee.garageRole };
  } catch {
    response.status(503).json({ error: "storage_unavailable" });
    return null;
  }
}
