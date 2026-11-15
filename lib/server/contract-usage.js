import { list, put, get } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { requireGarageEmployee } from "./employee-session.js";
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
  return { counts, recent: events.slice(0, 12).map((event) => ({ memberName: event.memberName, service: event.service, actorName: event.actorName, createdAt: event.createdAt })) };
}

function getMatchingPeople(contract, query) {
  return (contract.authorizedPeople || []).filter((person) => normalized(`${person.firstName} ${person.lastName}`).includes(query) || normalized(`${person.lastName} ${person.firstName}`).includes(query));
}

export async function handleContractUsage(request, response) {
  const actor = await requireGarageEmployee(request, response);
  if (!actor) return;
  if (request.method === "GET") {
    const query = normalized(request.query?.q);
    if (query.length < 2) return json(response, 200, { employee: { firstName: actor.firstName, lastName: actor.lastName }, week: currentWeekKey(), results: [] });
    try {
      const week = currentWeekKey();
      const contracts = await listContracts();
      const results = [];
      for (const contract of contracts) {
        const nameMatch = normalized(contract.name).includes(query);
        const isRestricted = Boolean(contract.restrictToPeople);
        if (!isRestricted && nameMatch) {
          const events = await loadUsageEvents(contract.id, week);
          const summary = usageSummary(events);
          results.push({ id: contract.id, name: contract.name, category: contract.category, services: contract.services, declaredMembers: contract.declaredMembers, restricted: false, counts: summary.counts, recent: summary.recent });
          continue;
        }
        if (!isRestricted) continue;
        const people = getMatchingPeople(contract, query);
        if (people.length) {
          const events = await loadUsageEvents(contract.id, week);
          for (const person of people) {
            const memberName = `${person.firstName} ${person.lastName}`;
            const personEvents = events.filter((event) => normalized(event.memberName) === normalized(memberName));
            const summary = usageSummary(personEvents);
            results.push({ id: contract.id, name: contract.name, category: contract.category, services: contract.services, declaredMembers: contract.declaredMembers, restricted: true, memberName, memberFirstName: person.firstName, memberLastName: person.lastName, counts: summary.counts, recent: summary.recent });
          }
        } else if (nameMatch) {
          const events = await loadUsageEvents(contract.id, week);
          const summary = usageSummary(events);
          results.push({ id: contract.id, name: contract.name, category: contract.category, services: contract.services, declaredMembers: contract.declaredMembers, restricted: true, requiresPersonSearch: true, counts: summary.counts, recent: [] });
        }
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
  const memberFirstName = typeof body.memberFirstName === "string" ? body.memberFirstName.trim().replace(/\s+/g, " ") : "";
  const memberLastName = typeof body.memberLastName === "string" ? body.memberLastName.trim().replace(/\s+/g, " ") : "";
  if (memberFirstName.length > 60 || memberLastName.length > 60) return json(response, 400, { error: "invalid_usage" });
  try {
    const contracts = await listContracts();
    const contract = contracts.find((item) => item.id === contractId);
    if (!contract) return json(response, 404, { error: "contract_not_found" });
    if (!contract.services.includes(service)) return json(response, 403, { error: "service_not_allowed" });
    let memberName = "";
    if (contract.restrictToPeople) {
      if (!memberFirstName || !memberLastName) return json(response, 400, { error: "member_required" });
      const person = (contract.authorizedPeople || []).find((item) => normalized(item.firstName) === normalized(memberFirstName) && normalized(item.lastName) === normalized(memberLastName));
      if (!person) return json(response, 403, { error: "member_not_authorized" });
      memberName = `${person.firstName} ${person.lastName}`;
    } else {
      if (!memberFirstName || !memberLastName) return json(response, 400, { error: "member_required" });
      memberName = `${memberFirstName} ${memberLastName}`;
    }
    const week = currentWeekKey();
    const event = { contractId, week, service, memberName, actorEmployeeId: actor.id, actorName: `${actor.firstName} ${actor.lastName}`, createdAt: new Date().toISOString() };
    await put(`harmony/contract-usage/${week}/${contractId}/${randomUUID()}.json`, JSON.stringify(event), { access: "private", addRandomSuffix: false, contentType: "application/json" });
    return json(response, 201, { event: { ...event, serviceLabel: SERVICE_LABELS[service] } });
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
