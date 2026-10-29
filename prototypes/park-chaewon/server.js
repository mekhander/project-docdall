import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startTurn, answerTurn, bookmark, keepRefining, resume, reopen } from "./logic.js";
import { gemini, AiError } from "./gemini.js";

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

function send(res, code, body, type = "application/json; charset=utf-8") {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 100_000) throw new Error("too_large");
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleTurn(body, ai = gemini) {
  const { action, text } = body;
  if (action === "start") return startTurn();
  const state = structuredClone(body.state);
  if (!state) return { error: "not_interview" };
  if (action === "resume") {
    const messages = resume(state, String(body.dim || ""));
    return messages ? { state, messages } : { error: "nothing_to_resume" };
  }
  // 끝난 대화라도 책갈피가 남아 있으면, 바로 쓴 글은 책갈피 칸의 답이 된다.
  if (action === "answer" && state.phase === "done" && !reopen(state)) return { error: "not_interview" };
  if (state.phase !== "interview") return { error: "not_interview" };
  if (action === "answer") {
    const t = String(text || "").trim().slice(0, 2000);
    if (!t) return { error: "empty" };
    const messages = await answerTurn(state, t, ai);
    return { state, messages };
  }
  if (action === "park" || action === "bookmark") return { state, messages: bookmark(state) };
  if (action === "continue") return { state, messages: keepRefining(state) };
  return { error: "bad_action" };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/turn") {
      const t0 = Date.now();
      let body;
      try {
        body = await readBody(req);
      } catch {
        return send(res, 400, { error: "bad_request" });
      }
      try {
        const out = await handleTurn(body);
        console.log(`turn ${body.action} ok ${Date.now() - t0}ms`);
        return send(res, out.error ? 400 : 200, out);
      } catch (e) {
        const code = e instanceof AiError ? e.code : "server";
        console.log(`turn ${body.action} failed ${code} ${Date.now() - t0}ms`);
        return send(res, 502, { error: "ai_failed", code });
      }
    }
    if (req.method === "GET") {
      const file = req.url === "/" ? "/index.html" : req.url.split("?")[0];
      if (file !== "/index.html") return send(res, 404, { error: "not_found" });
      const html = await readFile(path.join(ROOT, "public", "index.html"));
      return send(res, 200, html, TYPES[".html"]);
    }
    send(res, 404, { error: "not_found" });
  } catch {
    send(res, 500, { error: "server" });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, "127.0.0.1", () => console.log(`Docdall 편집실: http://localhost:${PORT}`));
}

export { handleTurn };
