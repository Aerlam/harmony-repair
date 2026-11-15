import { isSameOrigin, json, methodNotAllowed } from "./http.js";
import { requireDirector } from "./director.js";

const MAX_CONTRACT_BYTES = 3 * 1024 * 1024;

export async function handleContractImport(request, response) {
  const actor = await requireDirector(request, response);
  if (!actor) return;
  if (request.method !== "POST") return methodNotAllowed(response, ["POST"]);
  if (!isSameOrigin(request)) return json(response, 403, { error: "invalid_origin" });
  const decoded = decodeContractPdf(request.body);
  if (decoded.error) return json(response, decoded.error === "contract_file_too_large" ? 413 : 415, { error: decoded.error });
  try { return json(response, 200, { extracted: await extractContractPdf(decoded.bytes) }); }
  catch { return json(response, 422, { error: "contract_pdf_unreadable" }); }
}

