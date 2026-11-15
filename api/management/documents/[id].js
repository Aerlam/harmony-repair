import { del, get, put } from "@vercel/blob";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { DOC_TYPES, loadEmployee, saveEmployee } from "../../../lib/server/employees.js";
import { requireSiteTab } from "../../../lib/server/site-access.js";
import { requireDirector } from "../../../lib/server/director.js";
import { isSameOrigin, json, methodNotAllowed } from "../../../lib/server/http.js";

const MAX_BYTES = 4 * 1024 * 1024;
export const config = { api: { bodyParser: false } };
const EXTENSIONS = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
function diplomaList(employee) {
  if (Array.isArray(employee.documents?.diplomas)) return employee.documents.diplomas;
  return employee.documents?.diploma?.pathname ? [employee.documents.diploma] : [];
}
function findDocument(employee, type, documentId) {
  if (type !== "diploma") return employee.documents?.[type];
  if (documentId) return diplomaList(employee).find((doc) => doc.id === documentId);
  return employee.documents?.diploma || (diplomaList(employee).length === 1 ? diplomaList(employee)[0] : null);
}
function detectType(buf) {
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  return null;
}
async function readLimited(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += b.length;
    if (size > MAX_BYTES) return null;
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export default async function handler(request, response) {
  if (!["GET", "PUT", "DELETE"].includes(request.method)) return methodNotAllowed(response, ["GET", "PUT", "DELETE"]);
  const actor = request.method === "GET"
    ? await requireSiteTab(request, response, "employees")
    : await requireDirector(request, response);
  if (!actor) return;
  const id = String(request.query?.id || "");
  const type = String(request.query?.type || "");
  const documentId = String(request.query?.documentId || "");
  if (!DOC_TYPES.includes(type)) return json(response, 400, { error: "invalid_document_type" });
  if (documentId && !/^[0-9a-f-]{36}$/i.test(documentId)) return json(response, 400, { error: "invalid_document_id" });
  if (["PUT", "DELETE"].includes(request.method) && !isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  try {
    const employee = await loadEmployee(id);
    if (!employee) return json(response, 404, { error: "employee_not_found" });
    if (request.method === "PUT") {
      const bytes = await readLimited(request);
      if (!bytes) return json(response, 413, { error: "file_too_large" });
      const contentType = detectType(bytes);
      if (!contentType) return json(response, 415, { error: "unsupported_file_type" });
      const documentRecord = { pathname: `harmony/documents/${id}/${type}-${randomUUID()}.${EXTENSIONS[contentType]}`, contentType, size: bytes.length, uploadedAt: new Date().toISOString() };
      await put(documentRecord.pathname, bytes, { access: "private", addRandomSuffix: false, contentType });
      if (type === "diploma") {
        const diplomas = diplomaList(employee).map((doc) => ({ ...doc, id: doc.id || randomUUID() }));
        const newDocumentId = randomUUID();
        diplomas.push({ ...documentRecord, id: newDocumentId });
        employee.documents = { ...(employee.documents || {}), diplomas };
        delete employee.documents.diploma;
        await saveEmployee(employee);
        return json(response, 200, { employee, documentId: newDocumentId });
      }
      const previous = employee.documents?.[type];
      employee.documents = { ...(employee.documents || {}), [type]: documentRecord };
      await saveEmployee(employee);
      if (previous?.pathname) await del(previous.pathname, { access: "private" });
      return json(response, 200, { employee });
    }
    if (request.method === "GET") {
      const doc = findDocument(employee, type, documentId);
      if (!doc?.pathname) return json(response, 404, { error: "document_not_found" });
      const file = await get(doc.pathname, { access: "private" });
      if (!file) return json(response, 404, { error: "document_not_found" });
      response.setHeader("Cache-Control", "private, no-store, max-age=0");
      response.setHeader("Content-Type", doc.contentType);
      response.setHeader("Content-Disposition", "attachment; filename=\"document-" + type + "\"" );
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.status(200);
      Readable.fromWeb(file.stream).pipe(response);
      return;
    }
    if (request.method === "DELETE") {
      const doc = findDocument(employee, type, documentId);
      if (!doc?.pathname) return json(response, 404, { error: "document_not_found" });
      if (type === "diploma") {
        if (employee.documents?.diploma?.pathname && !documentId) {
          delete employee.documents.diploma;
        } else {
          const remaining = diplomaList(employee).filter((item) => item.id !== documentId);
          if (remaining.length) employee.documents.diplomas = remaining;
          else delete employee.documents.diplomas;
        }
      } else {
        delete employee.documents[type];
      }
      await saveEmployee(employee);
      await del(doc.pathname, { access: "private" });
      return json(response, 200, { employee });
    }
    return methodNotAllowed(response, ["GET", "PUT", "DELETE"]);
  } catch { return json(response, 503, { error: "storage_unavailable" }); }
}
