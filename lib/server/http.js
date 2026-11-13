export function json(response, status, value) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.status(status).json(value);
}

export function methodNotAllowed(response, methods) {
  response.setHeader("Allow", methods.join(", "));
  response.status(405).end();
}

export function readRequestUrl(request) {
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  const proto = request.headers["x-forwarded-proto"] || "https";
  if (!host || !["http", "https"].includes(Array.isArray(proto) ? proto[0] : proto)) return null;
  return new URL(request.url || "/", `${Array.isArray(proto) ? proto[0] : proto}://${host}`);
}

export function isSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === String(host).toLowerCase(); }
  catch { return false; }
}
