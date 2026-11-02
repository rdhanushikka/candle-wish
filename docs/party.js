import { api } from "./api.js";
import { CakeScene } from "./cake3d.js";

const $ = (id) => document.getElementById(id);
const stage = $("stage");
const partyId = new URLSearchParams(location.search).get("id") || "";
const tokenKey = `candle-wish-token-${partyId}`;
const watchKey = `candle-wish-watching-${partyId}`;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEBUG = new URLSearchParams(location.search).has("debug");

let config = null;
let role = "audience";
let candles = [];
let scene = null;
let taken = new Map();
let messages = [];
let readerIndex = 0;
let composeCandle = null;
let myCandle = null;
let serverStage = "waiting";
let birthdayLine = "";
let wishLine = "";

function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}

function setHeadline(text, sub) {
  const title = $("title");
  title.textContent = "";
  title.setAttribute("aria-label", text);
  text.split(" ").forEach((word, i, words) => {
    const mask = document.createElement("span");
    mask.className = "mask";
    mask.setAttribute("aria-hidden", "true");
    const inner = document.createElement("span");
    inner.className = "word";
    inner.style.setProperty("--i", i);
    inner.textContent = word;
    mask.append(inner);
    title.append(mask, i < words.length - 1 ? " " : "");
  });
  $("sub").textContent = sub;
}

function setState(state) {
  stage.dataset.state = state;
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("on", panel.dataset.for.split(" ").includes(state)));
}

/* ---------- Air: petals, smoke, confetti ---------- */

const air = $("air");
const airCtx = air.getContext("2d");
let petals = [];
let smoke = [];
let confetti = [];
let wind = 0;

function resizeAir() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  air.width = innerWidth * dpr;
  air.height = innerHeight * dpr;
  airCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const PETAL_COLORS = ["#f4a9c4", "#f9c6d6", "#fffaf6", "#f07fa8"];
const CONFETTI_COLORS = ["#f4a9c4", "#ffd84d", "#f4633c", "#fffaf6", "#b9f23f", "#141014"];

function makePetals() {
  const count = reduceMotion ? 0 : Math.round(Math.min(34, innerWidth / 34));
  petals = Array.from({ length: count }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    size: 6 + Math.random() * 10,
    fall: 16 + Math.random() * 26,
    drift: 8 + Math.random() * 18,
    phase: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 2,
    color: PETAL_COLORS[Math.floor(Math.random() * PETAL_COLORS.length)],
    push: 0,
  }));
}

function drawPetal(p, time) {
  airCtx.save();
  airCtx.translate(p.x, p.y);
  airCtx.rotate(p.phase + time * p.spin);
  airCtx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(time * 1.4 + p.phase)));
  airCtx.beginPath();
  airCtx.moveTo(0, -p.size);
  airCtx.bezierCurveTo(p.size, -p.size * 0.5, p.size * 0.8, p.size * 0.7, 0, p.size);
  airCtx.bezierCurveTo(-p.size * 0.8, p.size * 0.7, -p.size, -p.size * 0.5, 0, -p.size);
  airCtx.fillStyle = p.color;
  airCtx.fill();
  airCtx.lineWidth = 1.6;
  airCtx.strokeStyle = "#141014";
  airCtx.stroke();
  airCtx.restore();
}

function puffSmoke(c) {
  const { x, y } = scene.wickPoint(c);
  const count = reduceMotion ? 2 : Math.max(3, Math.round(12 * Math.min(1, 5 / candles.length)));
  for (let i = 0; i < count; i++) {
    smoke.push({
      x, y,
      vx: (Math.random() - 0.3) * 10,
      vy: -28 - Math.random() * 30,
      r: 3 + Math.random() * 3,
      age: -i * 0.09,
      life: 1.5 + Math.random() * 0.7,
      phase: Math.random() * 6,
    });
  }
}

function launchConfetti() {
  if (reduceMotion) return;
  const box = $("cake").getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height * 0.28;
  confetti = Array.from({ length: 150 }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const v = 260 + Math.random() * 620;
    return {
      x, y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      w: 7 + Math.random() * 8,
      h: 5 + Math.random() * 6,
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 12,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      age: 0,
    };
  });
}

function drawAir(dt, time) {
  airCtx.clearRect(0, 0, innerWidth, innerHeight);

  for (const p of petals) {
    p.push += (wind * 620 - p.push) * Math.min(1, dt * 3);
    p.x += (Math.sin(time * 0.8 + p.phase) * p.drift + 14 + p.push) * dt;
    p.y += (p.fall - wind * 50) * dt;
    if (p.y > innerHeight + 24) { p.y = -24; p.x = Math.random() * innerWidth; }
    if (p.y < -30) p.y = innerHeight + 20;
    if (p.x > innerWidth + 24) { p.x = -24; p.y = Math.random() * innerHeight; }
    if (p.x < -30) p.x = innerWidth + 20;
    drawPetal(p, time);
  }

  smoke = smoke.filter((s) => s.age < s.life);
  for (const s of smoke) {
    s.age += dt;
    if (s.age < 0) continue;
    s.x += (s.vx + Math.sin(s.age * 4 + s.phase) * 18 + wind * 180) * dt;
    s.y += s.vy * dt;
    s.r += dt * 8;
    airCtx.globalAlpha = Math.max(0, 0.34 * (1 - s.age / s.life));
    airCtx.beginPath();
    airCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    airCtx.fillStyle = "#6f666c";
    airCtx.fill();
  }
  airCtx.globalAlpha = 1;

  confetti = confetti.filter((c) => c.y < innerHeight + 30 && c.age < 7);
  for (const c of confetti) {
    c.age += dt;
    c.vx *= 1 - 1.3 * dt;
    c.vy = c.vy * (1 - 1.3 * dt) + 620 * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += c.spin * dt;
    airCtx.save();
    airCtx.translate(c.x, c.y);
    airCtx.rotate(c.rot);
    airCtx.scale(1, Math.cos(c.rot * 1.6));
    airCtx.fillStyle = c.color;
    airCtx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    airCtx.restore();
  }
}

/* ---------- Shared candle moments ---------- */

function syncLitCount() {
  stage.dataset.lit = candles.filter((c) => c.lit).length;
}

function blowOut(c) {
  c.lit = false;
  c.life = 0;
  c.emberLevel = 1;
  puffSmoke(c);
  syncLitCount();
}

function relightCandle(c, i) {
  c.life = 1;
  c.lit = true;
  c.relightAt = performance.now() + i * (600 / candles.length);
}

function celebrate(animated) {
  document.body.classList.add("celebrate");
  scene.setCelebrating(true, animated);
  if (animated) launchConfetti();
}

function endCelebration() {
  document.body.classList.remove("celebrate");
  scene.setCelebrating(false);
  confetti = [];
}

function showDone(animated) {
  setHeadline(birthdayLine, wishLine);
  setState(role === "star" ? "done" : "audience-done");
  celebrate(animated);
}

/* ---------- Audience ---------- */

let remoteGust = 0;

function showAudience() {
  if (serverStage === "done") return showDone(false);
  if (serverStage === "blowing") {
    setHeadline(`${config.name} is making a wish`, "You're watching live.");
  } else {
    setHeadline(`Waiting for ${config.name}`, "The candles will go out here when they blow.");
  }
  setState("audience");
}

function applyRemoteState(state) {
  if (role === "star") return;
  const previous = serverStage;
  serverStage = state.stage;
  remoteGust = state.gust;

  candles.forEach((c, i) => {
    if (c.lit && !state.lit[i]) blowOut(c);
    else if (!c.lit && state.lit[i]) relightCandle(c, i);
  });
  syncLitCount();

  if (state.stage === previous) return;
  if (state.stage === "done") {
    showDone(true);
  } else {
    endCelebration();
    showAudience();
  }
}

/* ---------- Birthday person ---------- */

let detector = null;
let tapGust = 0;
let finishAt = 0;
let micWarned = false;
let debugPeak = { rms: 0, until: 0 };
let starGust = 0;
let stateDirty = false;
let stateInFlight = false;
let lastSentAt = 0;
let lastSentGust = 0;

function markDirty(nextStage) {
  if (nextStage) serverStage = nextStage;
  stateDirty = true;
}

function syncStarState(now) {
  if (role !== "star" || stateInFlight) return;
  const gust = Math.round(starGust * 100) / 100;
  if (!stateDirty && (gust === lastSentGust || now - lastSentAt < 200)) return;
  stateDirty = false;
  stateInFlight = true;
  lastSentAt = now;
  lastSentGust = gust;
  api.setState(partyId, localStorage.getItem(tokenKey) || "", { stage: serverStage, lit: candles.map((c) => c.lit), gust })
    .catch(() => { stateDirty = true; })
    .finally(() => { stateInFlight = false; });
}

function showIntro() {
  const line = `Make a wish, ${config.name}`;
  setHeadline(line, "Close your eyes, then blow out the candles.");
  setState("intro");
}

function startTapping(reason) {
  stopMic();
  setHeadline("Now blow!", reason || "Tap the button until the candles go out.");
  setState("tapping");
  markDirty("blowing");
  $("puff").focus();
}

async function startMic() {
  $("useMic").disabled = true;
  $("sub").textContent = "Your browser will ask to use the microphone.";
  stopMic();
  const listener = detector = new BlowDetector();
  try {
    await listener.start();
    // Say "blow" only after the mic has measured the room, or the blow reads as room noise.
    $("sub").textContent = "Take a breath.";
    await new Promise((done) => setTimeout(done, (BlowDetector.CALIBRATE_SECONDS + 0.1) * 1000));
    if (detector !== listener) return;
    setHeadline("Now blow!", "Blow toward your microphone.");
    setState("listening");
    markDirty("blowing");
  } catch {
    detector = null;
    startTapping("Your microphone isn't available, so tap to blow.");
  } finally {
    $("useMic").disabled = false;
  }
}

function stopMic() {
  detector?.stop();
  detector = null;
  $("meterFill").style.transform = "scaleX(0)";
}

function finish() {
  stopMic();
  finishAt = 0;
  showDone(true);
  markDirty("done");
  $("title").focus({ preventScroll: true });
}

function relightAll() {
  endCelebration();
  candles.forEach(relightCandle);
  finishAt = 0;
  syncLitCount();
  markDirty("waiting");
  showIntro();
}

function becomeStar() {
  role = "star";
  loadMessages();
  if (serverStage === "done") showDone(false);
  else showIntro();
}

/* ---------- Candle messages ---------- */

function buildChips() {
  const chips = $("chips");
  chips.textContent = "";
  candles.forEach((c) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = c.index + 1;
    chip.addEventListener("click", () => pickCandle(c.index));
    chip.addEventListener("pointerenter", () => scene.setHighlight(c.index));
    chip.addEventListener("pointerleave", () => scene.setHighlight(composeCandle));
    chips.append(chip);
  });
}

function applyTaken(list) {
  taken = new Map(list.map((t) => [t.candle, t.from]));
  [...$("chips").children].forEach((chip, i) => {
    const from = taken.get(i);
    chip.classList.toggle("taken", from !== undefined);
    chip.setAttribute("aria-label", from !== undefined ? `Candle ${i + 1}, ${from} wrote here` : `Candle ${i + 1}, free`);
  });
  candles.forEach((c) => scene.setMarked(c.index, taken.has(c.index)));
  updateMessageNotes();
}

function updateMessageNotes() {
  const free = candles.length - taken.size;
  if (myCandle !== null) $("pickNote").textContent = `Your message is on candle ${myCandle + 1}.`;
  else $("pickNote").textContent = free ? `Pick a candle and leave ${config.name} a message.` : "Every candle has a message.";
  const count = taken.size;
  const noun = count === 1 ? "message" : "messages";
  $("introNote").textContent = count
    ? `${count} ${noun} waiting on your candles. Your audio stays on this device.`
    : "Your audio stays on this device.";
  $("readAll").hidden = !count;
  $("readAll").textContent = `Read your ${count === 1 ? "message" : `${count} messages`}`;
}

async function loadMessages() {
  messages = await api.readMessages(partyId, localStorage.getItem(tokenKey) || "").catch(() => messages);
}

function pickCandle(index) {
  scene.faceCandle(index);
  if (role === "star") return openReaderAt(index);
  if (taken.has(index)) {
    $("pickNote").textContent = `${taken.get(index)} wrote on candle ${index + 1}. Pick another one.`;
    return;
  }
  composeCandle = index;
  scene.setHighlight(index);
  $("composeTitle").textContent = `Candle ${index + 1}`;
  $("composeSub").textContent = `Only ${config.name} can read this.`;
  $("composeNote").textContent = "";
  $("compose").showModal();
  ($("fromName").value ? $("messageText") : $("fromName")).focus();
}

function closeCompose() {
  composeCandle = null;
  scene.setHighlight(null);
  $("compose").close();
}

function openReaderAt(candle) {
  const found = messages.findIndex((m) => m.candle === candle);
  if (found === -1) {
    $("sub").textContent = `Nobody has written on candle ${candle + 1} yet.`;
    return;
  }
  readerIndex = found;
  showMessage();
  $("reader").showModal();
}

function showMessage() {
  const message = messages[readerIndex];
  $("readerCount").textContent = `Candle ${message.candle + 1}, message ${readerIndex + 1} of ${messages.length}`;
  $("readerText").textContent = message.text;
  $("readerFrom").textContent = `From ${message.from}`;
  $("readerPrev").disabled = readerIndex === 0;
  $("readerNext").disabled = readerIndex === messages.length - 1;
  scene.setHighlight(message.candle);
  scene.faceCandle(message.candle);
}

function closeReader() {
  scene.setHighlight(null);
  $("reader").close();
}

$("composeCancel").addEventListener("click", closeCompose);
$("compose").addEventListener("cancel", () => { composeCandle = null; scene.setHighlight(null); });

$("composeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("composeSend").disabled = true;
  $("composeNote").textContent = "Sending...";
  try {
    await api.addMessage(partyId, composeCandle, $("fromName").value, $("messageText").value);
    myCandle = composeCandle;
    $("messageText").value = "";
    closeCompose();
    updateMessageNotes();
  } catch (err) {
    $("composeNote").textContent = err.message;
  } finally {
    $("composeSend").disabled = false;
  }
});

$("readAll").addEventListener("click", () => {
  readerIndex = 0;
  showMessage();
  $("reader").showModal();
});
$("readerPrev").addEventListener("click", () => { readerIndex--; showMessage(); });
$("readerNext").addEventListener("click", () => { readerIndex++; showMessage(); });
$("readerClose").addEventListener("click", closeReader);
$("reader").addEventListener("cancel", () => scene.setHighlight(null));

/* ---------- Animation ---------- */

let last = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;
  const reading = detector ? detector.update(dt) : null;
  const isStar = role === "star";
  const done = stage.dataset.state === "done" || stage.dataset.state === "audience-done";

  tapGust = Math.max(0, tapGust - dt * 2.2);
  starGust = Math.max(reading?.strength || 0, tapGust);
  const gust = isStar ? starGust : remoteGust;
  wind += (gust - wind) * Math.min(1, dt * (gust > wind ? 14 : 3));

  if (reading) {
    // Decibel scale, so a quiet mic still moves the bar.
    const loudness = (20 * Math.log10(Math.max(reading.rms, 1e-6)) + 60) / 50;
    const level = Math.min(1, Math.max(reading.strength, loudness, 0));
    $("meterFill").style.transform = `scaleX(${level.toFixed(3)})`;
    if (reading.silent) {
      $("sub").textContent = "No sound from your mic. Check your browser and Mac settings.";
      micWarned = true;
    } else if (micWarned) {
      $("sub").textContent = "Blow toward your microphone.";
      micWarned = false;
    }
    if (reading.noisyRoom && !stage.dataset.noisyShown) {
      stage.dataset.noisyShown = "true";
      $("sub").textContent = "It's noisy here. Blow close to the mic, or tap instead.";
    }
  }

  const calm = reduceMotion ? 0.25 : 1;
  for (const c of candles) {
    if (c.lit) {
      if (c.relightAt && now < c.relightAt) continue;
      c.relightAt = 0;
      c.grow = Math.min(1, c.grow + dt * 3.5);
      if (isStar) {
        const burn = BlowDetector.burn(gust, c.toughness);
        c.life = burn > 0 ? c.life - burn * dt : Math.min(1, c.life + dt * BlowDetector.RECOVER_RATE);
        if (c.life <= 0 && !done) {
          blowOut(c);
          markDirty();
        }
      } else {
        c.life = 1 - gust * 0.4;
      }
    } else {
      c.grow = Math.max(0, c.grow - dt * 9);
      c.emberLevel = Math.max(0, c.emberLevel - dt * 0.7);
    }
  }
  scene?.render(time, dt, wind, calm);

  if (isStar && !done && !finishAt && candles.every((c) => !c.lit)) finishAt = now + 750;
  if (isStar && finishAt && now >= finishAt && !done) finish();

  drawAir(dt, time);
  syncStarState(now);

  if (DEBUG && reading) {
    if (reading.rms > debugPeak.rms || now > debugPeak.until) debugPeak = { ...reading, until: now + 4000 };
    $("debug").hidden = false;
    $("debug").textContent =
      `rms ${reading.rms.toFixed(3)}  threshold ${reading.threshold.toFixed(3)}  floor ${reading.floor.toFixed(3)}\n` +
      `low ${reading.lowRatio.toFixed(2)} (> ${BlowDetector.MIN_LOW_RATIO})  noisy ${reading.noisiness.toFixed(2)} (> ${BlowDetector.MIN_NOISINESS})\n` +
      `candidate ${reading.candidate}  strength ${reading.strength.toFixed(2)}\n` +
      `loudest in last 4s: rms ${debugPeak.rms.toFixed(3)}  low ${debugPeak.lowRatio.toFixed(2)}  noisy ${debugPeak.noisiness.toFixed(2)}`;
  }

  requestAnimationFrame(tick);
}

/* ---------- Controls ---------- */

$("useMic").addEventListener("click", startMic);
$("switchMic").addEventListener("click", startMic);
$("useTap").addEventListener("click", () => startTapping());
$("switchTap").addEventListener("click", () => startTapping());
$("puff").addEventListener("click", () => { tapGust = 1; });
$("relight").addEventListener("click", relightAll);

function showWelcome(view) {
  $("welcomeChoose").hidden = view !== "choose";
  $("unlockForm").hidden = view !== "code";
  $("unlockNote").textContent = "";
  if (!$("welcome").open) $("welcome").showModal();
  (view === "code" ? $("code") : $("chooseBirthday")).focus();
}

$("showUnlock").addEventListener("click", () => showWelcome("code"));
$("chooseBirthday").addEventListener("click", () => showWelcome("code"));
$("cancelUnlock").addEventListener("click", () => showWelcome("choose"));
$("chooseWatch").addEventListener("click", () => {
  sessionStorage.setItem(watchKey, "true");
  $("welcome").close();
});
// The overlay is a required choice, so Escape doesn't dismiss it.
$("welcome").addEventListener("cancel", (event) => event.preventDefault());

$("unlockForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("unlockNote").textContent = "Checking...";
  try {
    const token = await api.unlock(partyId, $("code").value);
    if (!token) {
      $("unlockNote").textContent = "That code isn't right.";
      return;
    }
    localStorage.setItem(tokenKey, token);
    $("code").value = "";
    $("unlockNote").textContent = "";
    $("welcome").close();
    becomeStar();
  } catch (err) {
    $("unlockNote").textContent = err.message;
  }
});

/* ---------- Start ---------- */

async function init() {
  resizeAir();
  makePetals();
  addEventListener("resize", () => { resizeAir(); makePetals(); });

  let data = null;
  let problem = "Check your link, or plan a new one.";
  try {
    data = await api.readParty(partyId, localStorage.getItem(tokenKey) || "");
  } catch (err) {
    problem = err.message;
  }
  if (!data) {
    setHeadline("We couldn't find this cake", problem);
    setState("missing");
    requestAnimationFrame(tick);
    return;
  }

  config = data.config;
  role = data.role;
  serverStage = data.state.stage;
  document.title = `Make a wish, ${config.name}`;
  birthdayLine = `Happy ${config.age ? `${ordinal(config.age)} ` : ""}Birthday, ${config.name}`;
  wishLine = config.message || "Hope your wish comes true.";

  scene = new CakeScene($("cake"), config);
  scene.onPick = pickCandle;
  if (DEBUG) window.cakeScene = scene;
  candles = scene.candles;
  candles.forEach((c, i) => {
    c.lit = data.state.lit[i];
    c.life = c.lit ? 1 : 0;
    c.relightAt = performance.now() + 500;
  });
  syncLitCount();
  buildChips();
  applyTaken(data.taken);

  if (role === "star") {
    loadMessages();
    if (serverStage === "done") showDone(false);
    else showIntro();
  } else {
    showAudience();
    $("welcomeTitle").textContent = `${config.name}'s birthday`;
    if (!sessionStorage.getItem(watchKey)) showWelcome("choose");
  }

  const applyLive = (live) => {
    if (live.revision !== data.revision) return location.reload();
    applyRemoteState(live.state);
    const changed = JSON.stringify(live.taken) !== JSON.stringify([...taken].map(([candle, from]) => ({ candle, from })));
    applyTaken(live.taken);
    if (changed && role === "star") loadMessages();
  };
  api.watch(data.liveKey, applyLive, async () => {
    // Catches up on anything missed while connecting or offline.
    const latest = await api.readParty(partyId, localStorage.getItem(tokenKey) || "").catch(() => null);
    if (latest) applyLive(latest);
  });

  requestAnimationFrame(tick);
}

init();
