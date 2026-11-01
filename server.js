// Stores parties, checks the birthday code, and relays the candles to the audience.
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.PORT) || 8770;
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, "data", "parties.json");
const MAX_BODY_BYTES = 10_000;
const MAX_WRONG_CODES = 10;
const MAX_MESSAGES_PER_VISITOR = 12;
const MESSAGE_LENGTH = 280;
const LOCKOUT_MS = 10 * 60 * 1000;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LIMITS = { tiers: [1, 3], candles: [1, 30] };

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const staticFiles = new Set(fs.readdirSync(PUBLIC_DIR, { recursive: true }).map((file) => file.split(path.sep).join("/")));

const parties = loadParties();
const listeners = new Map();
const wrongCodes = new Map();
const messageCounts = new Map();

function loadParties() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(DATA_FILE, "utf8"))));
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
    return new Map();
  }
}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(parties)));
    fs.renameSync(tmp, DATA_FILE);
  }, 300);
}

function makeCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");
}

function sameSecret(a, b) {
  const left = crypto.createHash("sha256").update(String(a)).digest();
  const right = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

const isColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function cleanText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanConfig(body) {
  const name = cleanText(body.name, 40);
  if (!name) throw new HttpError(400, "Add the birthday person's name.");
  const tiers = Number(body.tiers);
  const candles = Number(body.candles);
  const inRange = (n, [lo, hi]) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!inRange(tiers, LIMITS.tiers)) throw new HttpError(400, "Tiers must be 1 to 3.");
  if (!inRange(candles, LIMITS.candles)) throw new HttpError(400, "Candles must be 1 to 30.");
  const stripes = body.candleColors;
  if (!isColor(body.frosting) || !isColor(body.sponge) || !Array.isArray(stripes) || stripes.length !== 2 || !stripes.every(isColor)) {
    throw new HttpError(400, "Pick a color for each part of the cake.");
  }
  const age = Number(body.age);
  return {
    name,
    age: Number.isInteger(age) && age > 0 && age < 150 ? age : null,
    message: cleanText(body.message, 120),
    tiers,
    candles,
    frosting: body.frosting,
    sponge: body.sponge,
    candleColors: stripes,
  };
}

function takenCandles(party) {
  return Object.entries(party.messages || {}).map(([candle, message]) => ({ candle: Number(candle), from: message.from }));
}

function freshState(candles) {
  return { stage: "waiting", lit: Array(candles).fill(true), gust: 0 };
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Too much data."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new HttpError(400, "Invalid request."));
      }
    });
    req.on("error", reject);
  });
}

function broadcast(id, event, data) {
  for (const res of listeners.get(id) || []) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

function getParty(id) {
  const party = parties.get(id);
  if (!party) throw new HttpError(404, "This cake doesn't exist.");
  return party;
}

function requirePlanner(req, party) {
  if (!sameSecret(req.headers["x-plan-key"] || "", party.planKey)) throw new HttpError(403, "This planner link isn't valid.");
}

function isStar(req, party) {
  return party.tokens.some((t) => sameSecret(req.headers["x-star-token"] || "", t));
}

const api = {
  async create(req, res) {
    const config = cleanConfig(await readJson(req));
    const id = crypto.randomBytes(6).toString("base64url");
    const party = {
      config,
      code: makeCode(),
      planKey: crypto.randomBytes(16).toString("hex"),
      tokens: [],
      messages: {},
      state: freshState(config.candles),
    };
    parties.set(id, party);
    saveSoon();
    sendJson(res, 201, { id, code: party.code, planKey: party.planKey });
  },

  readPlan(req, res, id) {
    const party = getParty(id);
    requirePlanner(req, party);
    sendJson(res, 200, { config: party.config, code: party.code, messageCount: takenCandles(party).length });
  },

  async update(req, res, id) {
    const party = getParty(id);
    requirePlanner(req, party);
    const config = cleanConfig(await readJson(req));
    const lastUsed = Math.max(-1, ...takenCandles(party).map((t) => t.candle));
    if (config.candles <= lastUsed) throw new HttpError(409, `Candle ${lastUsed + 1} has a message, so keep at least ${lastUsed + 1} candles.`);
    party.config = config;
    party.state = freshState(party.config.candles);
    saveSoon();
    broadcast(id, "config", {});
    sendJson(res, 200, { ok: true });
  },

  read(req, res, id) {
    const party = getParty(id);
    sendJson(res, 200, { config: party.config, state: party.state, taken: takenCandles(party), role: isStar(req, party) ? "star" : "audience" });
  },

  async unlock(req, res, id) {
    const party = getParty(id);
    const record = wrongCodes.get(id);
    if (record && record.count >= MAX_WRONG_CODES && Date.now() < record.until) {
      throw new HttpError(429, "Too many tries. Wait a few minutes.");
    }
    const { code } = await readJson(req);
    const entered = cleanText(code, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sameSecret(entered, party.code)) {
      const count = record && Date.now() < record.until ? record.count + 1 : 1;
      wrongCodes.set(id, { count, until: Date.now() + LOCKOUT_MS });
      throw new HttpError(403, "That code isn't right.");
    }
    wrongCodes.delete(id);
    const token = crypto.randomBytes(16).toString("hex");
    party.tokens.push(token);
    saveSoon();
    sendJson(res, 200, { token });
  },

  async setState(req, res, id) {
    const party = getParty(id);
    if (!isStar(req, party)) throw new HttpError(403, "Only the birthday person can do that.");
    const { stage, lit, gust } = await readJson(req);
    const validLit = Array.isArray(lit) && lit.length === party.config.candles && lit.every((v) => typeof v === "boolean");
    if (!["waiting", "blowing", "done"].includes(stage) || !validLit || typeof gust !== "number") {
      throw new HttpError(400, "Invalid state.");
    }
    const changed = stage !== party.state.stage || lit.some((v, i) => v !== party.state.lit[i]);
    party.state = { stage, lit, gust: Math.min(1, Math.max(0, gust)) };
    if (changed) saveSoon();
    broadcast(id, "state", party.state);
    sendJson(res, 200, { ok: true });
  },

  async addMessage(req, res, id) {
    const party = getParty(id);
    const visitor = `${id}:${req.socket.remoteAddress}`;
    const record = messageCounts.get(visitor);
    const count = record && Date.now() < record.until ? record.count : 0;
    if (count >= MAX_MESSAGES_PER_VISITOR) throw new HttpError(429, "That's a lot of messages. Try again in a few minutes.");
    const body = await readJson(req);
    const candle = Number(body.candle);
    const from = cleanText(body.from, 40);
    const text = cleanText(body.text, MESSAGE_LENGTH);
    if (!Number.isInteger(candle) || candle < 0 || candle >= party.config.candles) throw new HttpError(400, "That candle doesn't exist.");
    if (!from || !text) throw new HttpError(400, "Add your name and a message.");
    party.messages ||= {};
    if (party.messages[candle]) throw new HttpError(409, `${party.messages[candle].from} just wrote on that candle. Pick another one.`);
    party.messages[candle] = { from, text, at: Date.now() };
    messageCounts.set(visitor, { count: count + 1, until: Date.now() + LOCKOUT_MS });
    saveSoon();
    broadcast(id, "taken", { taken: takenCandles(party) });
    sendJson(res, 201, { ok: true });
  },

  readMessages(req, res, id) {
    const party = getParty(id);
    if (!isStar(req, party)) throw new HttpError(403, "Only the birthday person can read these.");
    const messages = Object.entries(party.messages || {})
      .map(([candle, message]) => ({ candle: Number(candle), from: message.from, text: message.text }))
      .sort((a, b) => a.candle - b.candle);
    sendJson(res, 200, { messages });
  },

  events(req, res, id) {
    const party = getParty(id);
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write(`event: state\ndata: ${JSON.stringify(party.state)}\n\n`);
    if (!listeners.has(id)) listeners.set(id, new Set());
    listeners.get(id).add(res);
    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      listeners.get(id).delete(res);
    });
  },
};

function serveFile(res, file) {
  res.writeHead(200, {
    "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(path.join(PUBLIC_DIR, file)).pipe(res);
}

async function route(req, res) {
  const { pathname } = new URL(req.url, "http://localhost");
  const { method } = req;

  if (pathname === "/api/parties") {
    if (method === "POST") return api.create(req, res);
    throw new HttpError(405, "Method not allowed.");
  }

  const match = pathname.match(/^\/api\/parties\/([\w-]+)(?:\/(plan|unlock|state|events|messages))?$/);
  if (match) {
    const [, id, action] = match;
    if (method === "GET" && !action) return api.read(req, res, id);
    if (method === "PUT" && !action) return api.update(req, res, id);
    if (method === "GET" && action === "plan") return api.readPlan(req, res, id);
    if (method === "POST" && action === "unlock") return api.unlock(req, res, id);
    if (method === "POST" && action === "state") return api.setState(req, res, id);
    if (method === "GET" && action === "events") return api.events(req, res, id);
    if (method === "POST" && action === "messages") return api.addMessage(req, res, id);
    if (method === "GET" && action === "messages") return api.readMessages(req, res, id);
    throw new HttpError(405, "Method not allowed.");
  }

  if (method !== "GET") throw new HttpError(405, "Method not allowed.");
  if (pathname === "/" || /^\/plan\/[\w-]+$/.test(pathname)) return serveFile(res, "plan.html");
  if (/^\/p\/[\w-]+$/.test(pathname)) return serveFile(res, "party.html");
  const file = pathname.slice(1);
  if (staticFiles.has(file) && file !== "party.html" && file !== "plan.html") return serveFile(res, file);
  throw new HttpError(404, "Not found.");
}

http.createServer((req, res) => {
  route(req, res).catch((err) => {
    if (res.headersSent) return res.end();
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error(err);
    sendJson(res, 500, { error: "Something went wrong." });
  });
}).listen(PORT, HOST, () => console.log(`Candle Wish running at http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`));
