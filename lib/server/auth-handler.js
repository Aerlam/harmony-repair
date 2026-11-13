import { Auth } from "@auth/core";
import { authConfig } from "./config.js";

const BODY_LIMIT = 16 * 1024;

function makeHeaders(source) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(source || {})) {
    if (value === undefined) continue;
    if (["connection", "content-length", "host", "transfer-encoding"].includes(name.toLowerCase())) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }
  return headers;
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > BODY_LIMIT) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export function createAuthHandler(routePath) {
  return async function handler(request, response) {
  const configured = Boolean(process.env.AUTH_SECRET && process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET);
  if (!configured) {
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.status(503).json({ error: "discord_auth_not_configured" });
    return;
  }

  const method = request.method || "GET";
  if (method !== "GET" && method !== "POST") {
    response.setHeader("Allow", "GET, POST");
    response.status(405).end();
    return;
  }
  const body = method === "GET" ? undefined : await readBody(request);
  if (body === null) {
    response.status(413).json({ error: "request_too_large" });
    return;
  }

  const host = request.headers["x-forwarded-host"] || request.headers.host;
  const forwardedProtocol = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol || "https";
  if (!host || !["https", "http"].includes(protocol)) { response.status(400).end(); return; }
  let url;
  try {
    const incomingUrl = new URL(request.url || "/", `${protocol}://${host}`);
    url = new URL(`${protocol}://${host}${routePath}${incomingUrl.search}`);
  }
  catch { response.status(400).end(); return; }

  const authRequest = new Request(url, { method, headers: makeHeaders(request.headers), ...(body === undefined ? {} : { body }) });
  try {
    const authResponse = await Auth(authRequest, authConfig());
    response.status(authResponse.status);
    for (const [name, value] of authResponse.headers) if (name.toLowerCase() !== "set-cookie") response.setHeader(name, value);
    const cookies = authResponse.headers.getSetCookie?.() || [];
    if (cookies.length) response.setHeader("Set-Cookie", cookies);
    response.end(Buffer.from(await authResponse.arrayBuffer()));
  } catch (error) {
    console.error("[auth] Discord sign-in request failed", error?.type || "unknown");
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.status(500).json({ error: "authentication_failed" });
  }
  };
}
