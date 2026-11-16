// 셀렉트마켓 채팅 · 내 컴퓨터용 AI 서버
// - 키는 ../.env 의 ANTHROPIC_API_KEY 에서만 읽고, 브라우저로는 절대 보내지 않는다.
// - 이 컴퓨터(127.0.0.1)에서만 열린다.
// 실행: selectmarket-chat 폴더에서  npm start
import http from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const MAX_PROMPT = 120_000; // 글자 수 상한 (스토어 데이터 + 대화)
const KEY = (process.env.ANTHROPIC_API_KEY || "").trim();

// 운영자 피드백 지침 파일 (관리자 화면에서 저장, 매 AI 호출 때 프롬프트에 붙임)
const DATA_DIR = path.join(HERE, "data");
const GL_FILE = path.join(DATA_DIR, "guidelines.json");
const TABS_OK = ["all", "t2", "t3", "t4"];
const oneLine = (s, n) => String(s || "").replace(/[\u0000-\u001f"]/g, " ").trim().slice(0, n);
const cleanGL = items => (Array.isArray(items) ? items : []).slice(0, 50).map(x => ({
  id: oneLine(x.id, 40), from: oneLine(x.from, 40), tab: TABS_OK.includes(x.tab) ? x.tab : "all", tag: oneLine(x.tag, 20),
  rule: oneLine(x.rule, 300), ex: oneLine(x.ex, 80), on: x.on !== false, at: Number(x.at) || Date.now()
})).filter(x => x.rule);
async function readGL() {
  try { return cleanGL(JSON.parse(await readFile(GL_FILE, "utf8")).items); } catch { return []; }
}
async function writeGL(items) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = GL_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify({ updatedAt: new Date().toISOString(), items }, null, 2));
  await rename(tmp, GL_FILE);
}
function glText(items, tab) {
  const a = items.filter(x => x.on && (x.tab === "all" || x.tab === tab)).slice(0, 30);
  if (!a.length) return { n: 0, text: "" };
  return { n: a.length, text: "[운영자 피드백 지침]\n아래는 운영자가 실제 대화를 검토하고 남긴 지침이야. 위 답변 규칙과 함께 반드시 지키고, 충돌하면 이 지침을 우선해.\n" + a.map((x, i) => `${i + 1}. ${x.rule}${x.ex ? ` (참고 질문: "${x.ex}")` : ""}`).join("\n") };
}
function withGL(prompt, text) {
  const mark = "\n\n[지금까지의 대화]\n", i = prompt.indexOf(mark);
  return i < 0 ? text + "\n\n" + prompt : prompt.slice(0, i) + "\n\n" + text + prompt.slice(i);
}

const client = KEY ? new Anthropic({ apiKey: KEY }) : null;

const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

// 다른 웹사이트가 이 서버로 몰래 요청하지 못하게, 같은 주소에서 온 요청만 받는다.
const sameOrigin = req => {
  const host = req.headers.host || "";
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return false;
  const origin = req.headers.origin;
  return !origin || origin === "http://" + host;
};

async function page() {
  const html = await readFile(path.join(HERE, "index.html"), "utf8");
  // 파일로 만든 페이지는 글자 인코딩·모바일 폭 선언이 빠져 있어서 여기서 붙인다.
  return html.includes("<head>")
    ? html.replace("<head>", '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">')
    : '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' + html;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on("data", c => { n += c.length; if (n > MAX_PROMPT * 4) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function chat(req, res) {
  if (!client) return send(res, 503, { code: "no_key", message: "프로젝트 폴더의 .env 파일에 ANTHROPIC_API_KEY 를 넣고 서버를 다시 켜 주세요." });
  let prompt, tab;
  try { const b = JSON.parse(await readBody(req)); prompt = b.prompt; tab = typeof b.tab === "string" ? b.tab : ""; } catch { return send(res, 400, { code: "bad_request", message: "요청 형식이 올바르지 않아요." }); }
  if (typeof prompt !== "string" || !prompt.trim()) return send(res, 400, { code: "bad_request", message: "질문이 비어 있어요." });
  if (prompt.length > MAX_PROMPT) return send(res, 413, { code: "too_large", message: "대화가 너무 길어요. 새로 시작해 주세요." });

  const gl = glText(await readGL(), tab);
  const params = { model: MODEL, max_tokens: 1024, messages: [{ role: "user", content: gl.n ? withGL(prompt, gl.text) : prompt }] };
  const head = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Guidelines": String(gl.n) };
  // 채팅은 빨라야 해서 생각을 짧게 한다 (Opus 계열만 지원)
  if (/opus/.test(MODEL)) params.output_config = { effort: "low" };

  let started = false;
  const ac = new AbortController();
  res.on("close", () => ac.abort()); // 사용자가 화면을 닫으면 호출 중단
  try {
    const stream = client.messages.stream(params, { signal: ac.signal });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
        if (!started) { res.writeHead(200, head); started = true; }
        res.write(ev.delta.text);
      }
    }
    if (!started) res.writeHead(200, head);
    res.end();
  } catch (e) {
    if (ac.signal.aborted) return;
    const status = e && e.status;
    // 키는 로그에 남기지 않고, 상태 번호와 종류만 남긴다.
    console.error("[AI 호출 실패]", status || "", e && e.name);
    const info = status === 401 ? { code: "bad_key", message: "API 키가 올바르지 않아요. .env 의 키를 확인해 주세요." }
      : status === 404 ? { code: "bad_model", message: "모델 이름을 찾을 수 없어요. .env 의 ANTHROPIC_MODEL 을 확인해 주세요." }
      : status === 429 ? { code: "rate_limited", message: "요청이 많아요. 잠시 뒤에 다시 보내 주세요." }
      : { code: "failed", message: "AI 호출에 실패했어요. 잠시 뒤에 다시 시도해 주세요." };
    if (started) res.end(); else send(res, status && status < 600 ? status : 502, info);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!sameOrigin(req)) return send(res, 403, { code: "forbidden", message: "허용되지 않은 접근이에요." });
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return send(res, 200, await page(), "text/html; charset=utf-8");
    if (req.method === "GET" && url.pathname === "/api/status") return send(res, 200, { ok: !!client, model: MODEL });
    if (req.method === "POST" && url.pathname === "/api/chat") return await chat(req, res);
    if (req.method === "GET" && url.pathname === "/api/guidelines") return send(res, 200, { items: await readGL() });
    if (req.method === "PUT" && url.pathname === "/api/guidelines") {
      let items; try { items = cleanGL(JSON.parse(await readBody(req)).items); } catch { return send(res, 400, { code: "bad_request", message: "요청 형식이 올바르지 않아요." }); }
      await writeGL(items); return send(res, 200, { ok: true, n: items.length });
    }
    send(res, 404, { code: "not_found", message: "없는 주소예요." });
  } catch (e) {
    console.error("[서버 오류]", e && e.name);
    if (!res.headersSent) send(res, 500, { code: "failed", message: "서버에서 문제가 생겼어요." });
    else res.end();
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n셀렉트마켓 채팅 서버가 켜졌어요 → http://localhost:${PORT}`);
  console.log(client ? `AI 모델: ${MODEL}` : "⚠ API 키가 비어 있어요. 프로젝트 폴더의 .env 에 ANTHROPIC_API_KEY 를 넣고 다시 켜 주세요.");
});
