import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rename, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, extname, resolve, sep } from "node:path";
import { networkInterfaces } from "node:os";
import { randomBytes, randomUUID } from "node:crypto";
import { applyAction, createLobby, GameError, joinLobby, publicView } from "./engine.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(root, "web");
const dataRoot = resolve(process.env.MAHJONG_DATA_DIR || resolve(root, "data"));
const host = process.env.HOST || (process.argv.includes("--lan") ? "0.0.0.0" : "127.0.0.1");
const port = Number(process.env.PORT || 3000);
const locks = new Map();
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".zip": "application/zip", ".txt": "text/plain; charset=utf-8" };
await mkdir(dataRoot, { recursive: true });

async function serial(code, fn) {
  const previous = locks.get(code) || Promise.resolve();
  const task = previous.catch(() => {}).then(fn);
  locks.set(code, task);
  try { return await task; }
  finally { if (locks.get(code) === task) locks.delete(code); }
}

async function load(code) {
  try { return JSON.parse(await readFile(resolve(dataRoot, `${code}.json`), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function save(code, record, exclusive = false) {
  const target = resolve(dataRoot, `${code}.json`);
  if (exclusive) return writeFile(target, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  const temporary = `${target}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(record), { mode: 0o600 });
  await rename(temporary, target);
}

async function bodyOf(req) {
  if (!(req.headers["content-type"] || "").includes("application/json")) throw new GameError("需要 JSON 请求", 415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) throw new GameError("请求过大", 413);
    chunks.push(chunk);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new GameError("无效请求");
  return body;
}

function cleanName(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 16) : "";
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": mime[".txt"].replace("text/plain", "application/json"), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "POST" && req.headers.origin) {
      if (new URL(req.headers.origin).host !== req.headers.host) throw new GameError("请从本机牌桌页面操作", 403);
    }
    if (url.pathname === "/api/rooms" && req.method === "POST") {
      const body = await bodyOf(req);
      const name = cleanName(body.name);
      if (!name) throw new GameError("请输入昵称");
      for (let i = 0; i < 6; i++) {
        const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
        const code = [...randomBytes(6)].map((b) => alphabet[b % alphabet.length]).join("");
        const token = randomUUID();
        const state = createLobby(code, name, token);
        try { await save(code, { state, revision: 0 }, true); }
        catch (error) { if (error.code === "EEXIST") continue; throw error; }
        return json(res, 201, { token, room: publicView(state, token), revision: 0 });
      }
      throw new GameError("暂时无法建立房间", 503);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})$/i);
    if (match) {
      const code = match[1].toUpperCase();
      if (req.method === "GET") {
        const record = await load(code);
        if (!record) throw new GameError("找不到这个房间", 404);
        return json(res, 200, { room: publicView(record.state, url.searchParams.get("token") || undefined), revision: record.revision });
      }
      if (req.method === "POST") {
        const body = await bodyOf(req);
        const result = await serial(code, async () => {
          const record = await load(code);
          if (!record) throw new GameError("找不到这个房间", 404);
          let token;
          if (body.op === "join") {
            const name = cleanName(body.name);
            if (!name) throw new GameError("请输入昵称");
            token = randomUUID();
            record.state = joinLobby(record.state, name, token);
          } else if (body.op === "action") {
            if (typeof body.token !== "string" || !body.token || !body.action || typeof body.action !== "object") throw new GameError("缺少牌局操作资料");
            token = body.token;
            record.state = applyAction(record.state, token, body.action);
          } else throw new GameError("不支持这个操作");
          record.revision++;
          await save(code, record);
          return { ...(body.op === "join" ? { token } : {}), room: publicView(record.state, token), revision: record.revision };
        });
        return json(res, body.op === "join" ? 201 : 200, result);
      }
      res.setHeader("Allow", "GET, POST");
      throw new GameError("不支持这个请求方法", 405);
    }
    if (url.pathname.startsWith("/api/")) throw new GameError("找不到这个接口", 404);
    if (!["GET", "HEAD"].includes(req.method)) throw new GameError("不支持这个请求方法", 405);
    const pathname = decodeURIComponent(url.pathname);
    const file = resolve(webRoot, pathname === "/" ? "index.html" : `.${pathname}`);
    if (!file.startsWith(webRoot + sep)) throw new GameError("禁止访问", 403);
    let info;
    try { info = await stat(file); } catch { throw new GameError("找不到这个文件", 404); }
    if (!info.isFile()) throw new GameError("找不到这个文件", 404);
    const headers = { "Content-Type": mime[extname(file)] || "application/octet-stream", "Content-Length": info.size, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : await readFile(file));
  } catch (error) {
    const status = error instanceof GameError ? error.status : error instanceof SyntaxError || error instanceof URIError ? 400 : 500;
    if (status === 500) console.error("Request failed:", error.message);
    if (!res.headersSent) json(res, status, { error: status === 500 ? "服务器暂时无法完成请求" : error.message });
    else res.end();
  }
});

server.on("error", (error) => { console.error(error.code === "EADDRINUSE" ? `端口 ${port} 已被占用。关闭旧窗口，或使用 PORT 环境变量更换端口。` : error.message); process.exitCode = 1; });
server.listen(port, host, () => {
  const address = server.address();
  const actualPort = address.port;
  console.log(`谐不压怔！一日麻！\n本机打开：http://localhost:${actualPort}`);
  if (host === "0.0.0.0") {
    for (const list of Object.values(networkInterfaces())) for (const item of list || []) {
      if (item.family === "IPv4" && !item.internal) console.log(`局域网地址：http://${item.address}:${actualPort}`);
    }
    console.log("四位玩家请使用同一个局域网地址；房主从该地址建房后分享房间链接。");
  }
  console.log("保持这个窗口开启。按 Ctrl+C 停止；牌局保存在 data 文件夹。禁止同时运行两个服务共用同一 data 目录。");
});
