import { list, put, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { requireSiteTab } from "./site-access.js";
import { listContracts } from "./contracts.js";
import { isSameOrigin, json, methodNotAllowed } from "./http.js";

const SERVICE_LABELS = { repair: "Réparation", impound: "Dépannage / fourrière", displacement: "Déplacement" };

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr").replace(/\s+/g, " ").trim();
}

function currentWeekKey() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type) => Number(parts.find((value) => value.type === type)?.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const weekYear = date.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(weekYear, 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}

async function loadUsageEvents(contractId, weekKey) {
  const prefix = `harmony/contract-usage/${weekKey}/${contractId}/`;
  const events = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000, access: "private" });
    for (const item of page.blobs) {
      const blob = await get(item.pathname, { access: "private" });
      if (blob) events.push(JSON.parse(await new Response(blob.stream).text()));
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return events.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function usageSummary(events) {
  const counts = { repair: 0, impound: 0, displacement: 0 };
  for (const event of events) if (Object.hasOwn(counts, event.service)) counts[event.service] += 1;
  const members = new Map();
  for (const event of events) {
    if (!Object.hasOwn(counts, event.service)) continue;
    const key = event.memberNumber ? normalized(event.memberNumber) : normalized(event.memberName);
    if (!key) continue;
    if (!members.has(key)) members.set(key, { firstName: event.memberFirstName || "", lastName: event.memberLastName || "", employeeNumber: event.memberNumber || "", counts: { repair: 0, impound: 0, displacement: 0 } });
    members.get(key).counts[event.service] += 1;
  }
  return { counts, members: [...members.values()], recent: events.slice(0, 12).map((event) => ({ memberName: event.memberName, employeeNumber: event.memberNumber || "", service: event.service, actorName: event.actorName, createdAt: event.createdAt })) };
}

function isMemberAuthorized(contract, member) {
  if (!contract.restrictToPeople) return true;
  return (contract.authorizedPeople || []).some((person) => person.employeeNumber
    ? normalized(person.employeeNumber) === normalized(member.employeeNumber)
    : normalized(`${person.firstName} ${person.lastName}`) === normalized(`${member.firstName} ${member.lastName}`));
}

export async function getWeeklyContractUsage(contracts) {
  const week = currentWeekKey();
  const summaries = {};
  for (const contract of contracts) {
    const events = await loadUsageEvents(contract.id, week);
    const summary = usageSummary(events);
    summaries[contract.id] = { counts: summary.counts, members: summary.members };
  }
  return { week, summaries };
}

export async function handleContractUsage(request, response) {
  const actor = await requireSiteTab(request, response, "services");
  if (!actor) return;
  if (actor.kind !== "employee") return json(response, 403, { error: "employee_access_required" });
  if (request.method === "GET") {
    const query = normalized(request.query?.q);
    if (query.length < 2) return json(response, 200, { employee: { firstName: actor.firstName, lastName: actor.lastName }, week: currentWeekKey(), results: [] });
    try {
      const week = currentWeekKey();
      const contracts = await listContracts();
      const results = [];
      for (const contract of contracts) {
        const nameMatch = normalized(contract.name).includes(query);
        const registeredMembers = Array.isArray(contract.members) ? contract.members : [];
        const eligibleMembers = registeredMembers.filter((member) => isMemberAuthorized(contract, member));
        const matchingMembers = eligibleMembers.filter((member) => normalized(`${member.firstName} ${member.lastName} ${member.employeeNumber}`).includes(query) || normalized(`${member.lastName} ${member.firstName} ${member.employeeNumber}`).includes(query));
        if (!nameMatch && !matchingMembers.length) continue;
        const events = await loadUsageEvents(contract.id, week);
        const summary = usageSummary(events);
        results.push({
          id: contract.id,
          name: contract.name,
          category: contract.category,
          services: contract.services,
          declaredMembers: contract.declaredMembers,
          restricted: Boolean(contract.restrictToPeople),
          members: eligibleMembers,
          memberListAvailable: eligibleMembers.length > 0,
          preselectedMemberNumber: !nameMatch && matchingMembers.length === 1 ? matchingMembers[0].employeeNumber : "",
          counts: summary.counts,
          memberCounts: summary.members,
          recent: summary.recent,
        });
      }
      return json(response, 200, { employee: { firstName: actor.firstName, lastName: actor.lastName }, week, results });
    } catch { return json(response, 503, { error: "storage_unavailable" }); }
  }
  if (request.method !== "POST") return methodNotAllowed(response, ["GET", "POST"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const body = request.body || {};
  const contractId = typeof body.contractId === "string" ? body.contractId : "";
  const service = typeof body.service === "string" ? body.service : "";
  if (!/^[0-9a-f-]{36}$/i.test(contractId) || !Object.hasOwn(SERVICE_LABELS, service)) return json(response, 400, { error: "invalid_usage" });
  const memberNumber = typeof body.memberNumber === "string" ? body.memberNumber.trim() : "";
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(memberNumber)) return json(response, 400, { error: "invalid_usage" });
  try {
    const contracts = await listContracts();
    const contract = contracts.find((item) => item.id === contractId);
    if (!contract) return json(response, 404, { error: "contract_not_found" });
    if (!contract.services.includes(service)) return json(response, 403, { error: "service_not_allowed" });
    if (!Array.isArray(contract.members) || !contract.members.length) return json(response, 409, { error: "member_list_empty" });
    const member = (contract.members || []).find((item) => normalized(item.employeeNumber) === normalized(memberNumber));
    if (!member) return json(response, 404, { error: "member_not_found" });
    if (!isMemberAuthorized(contract, member)) return json(response, 403, { error: "member_not_authorized" });
    const week = currentWeekKey();
    const memberName = `${member.firstName} ${member.lastName}`;
    const event = { contractId, week, service, memberName, memberFirstName: member.firstName, memberLastName: member.lastName, memberNumber: member.employeeNumber, actorEmployeeId: actor.id, actorName: `${actor.firstName} ${actor.lastName}`, createdAt: new Date().toISOString() };
    await put(`harmony/contract-usage/${week}/${contractId}/${randomUUID()}.json`, JSON.stringify(event), { access: "private", addRandomSuffix: false, contentType: "application/json" });
    return json(response, 201, { event: { ...event, serviceLabel: SERVICE_LABELS[service] } });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
