const $ = (id) => document.getElementById(id);
const stage = $("stage");
const params = new URLSearchParams(location.search);
const friendName = (params.get("name") || "").trim().slice(0, 40);
const age = Number.parseInt(params.get("age"), 10);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DEBUG = params.has("debug");

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
}

/* ---------- Candles ---------- */

buildCake($("cake"));

const candles = CANDLE_LAYOUT.map((layout, i) => {
  const group = $("candles").children[i];
  return {
    ...layout,
    seed: i * 7.3 + 1,
    life: 1,
    grow: 0,
    lit: true,
    ember: 0,
    outer: group.querySelector(".flame-outer"),
    inner: group.querySelector(".flame-inner"),
    glow: group.querySelector(".glow"),
    emberDot: group.querySelector(".ember"),
  };
});

function flamePath(height, halfWidth, lean) {
  const h = height, w = halfWidth;
  return `M0 6 C${-w * 1.25} ${-h * 0.12} ${-w * 0.75 + lean * 0.45} ${-h * 0.62} ${lean} ${-h} ` +
         `C${w * 0.75 + lean * 0.45} ${-h * 0.62} ${w * 1.25} ${-h * 0.12} 0 6 Z`;
}

function drawFlame(c, time, gust) {
  if (c.grow <= 0.001) {
    c.outer.setAttribute("d", "");
    c.inner.setAttribute("d", "");
    c.glow.setAttribute("opacity", 0);
    return;
  }
  const t = time + c.seed;
  const calm = reduceMotion ? 0.25 : 1;
  const flicker = (Math.sin(t * 9.1) * 0.5 + Math.sin(t * 15.7 + 1.2) * 0.3 + Math.sin(t * 23.3) * 0.2) * calm;
  const sway = (Math.sin(t * 3.1) * 5 + Math.sin(t * 7.7) * 3) * calm;
  const shake = gust > 0 ? Math.sin(t * 41) * gust * 16 : 0;
  const lean = sway + shake + gust * 62;

  const size = c.width / 54;
  const scale = c.grow * (0.42 + 0.58 * c.life) * (1 - gust * 0.22);
  const height = (104 + flicker * 9) * size * scale * (0.9 + 0.1 * size);
  const halfWidth = (25 - flicker * 2) * size * scale;

  c.outer.setAttribute("d", flamePath(height, halfWidth, lean * scale));
  c.inner.setAttribute("d", flamePath(height * 0.58, halfWidth * 0.52, lean * scale * 0.55));
  c.glow.setAttribute("opacity", ((0.75 + flicker * 0.18) * c.grow * (0.4 + 0.6 * c.life)).toFixed(3));
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
  const box = c.emberDot.getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  const count = reduceMotion ? 3 : 12;
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
    airCtx.globalAlpha = Math.max(0, 0.5 * (1 - s.age / s.life));
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

/* ---------- Experience ---------- */

const introLine = friendName ? `Make a wish, ${friendName}` : "Make a wish";
const birthdayLine = `Happy ${age > 0 && age < 150 ? `${ordinal(age)} ` : ""}Birthday${friendName ? `, ${friendName}` : ""}`;

let detector = null;
let tapGust = 0;
let finishAt = 0;
let micWarned = false;
let debugPeak = { rms: 0, until: 0 };
let last = performance.now();

function showIntro() {
  setHeadline(introLine, "Close your eyes, then blow out the candles.");
  setState("intro");
}

function startTapping(reason) {
  stopMic();
  setHeadline("Now blow!", reason || "Tap the button until the candles go out.");
  setState("tapping");
  $("puff").focus();
}

async function startMic() {
  $("useMic").disabled = true;
  $("sub").textContent = "Your browser will ask to use the microphone.";
  detector = new BlowDetector();
  try {
    await detector.start();
    setHeadline("Now blow!", "Blow toward your microphone.");
    setState("listening");
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
  setHeadline(birthdayLine, "Hope your wish comes true.");
  setState("done");
  document.body.classList.add("celebrate");
  $("title").focus({ preventScroll: true });
  launchConfetti();
}

function relight() {
  document.body.classList.remove("celebrate");
  confetti = [];
  candles.forEach((c, i) => {
    c.life = 1;
    c.lit = true;
    c.relightAt = performance.now() + i * 120;
  });
  finishAt = 0;
  syncLitCount();
  showIntro();
}

function syncLitCount() {
  stage.dataset.lit = candles.filter((c) => c.lit).length;
}

function blowOut(c) {
  c.lit = false;
  c.life = 0;
  c.ember = 1;
  puffSmoke(c);
  syncLitCount();
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const time = now / 1000;

  const reading = detector ? detector.update(dt) : null;
  tapGust = Math.max(0, tapGust - dt * 2.2);
  const gust = Math.max(reading?.strength || 0, tapGust);
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

  for (const c of candles) {
    if (c.lit) {
      if (c.relightAt && now < c.relightAt) continue;
      c.relightAt = 0;
      c.grow = Math.min(1, c.grow + dt * 3.5);
      const burn = Math.max(0, gust - 0.12) * 3.5 * (1 / c.toughness);
      c.life = burn > 0 ? c.life - burn * dt : Math.min(1, c.life + dt * 0.25);
      if (c.life <= 0 && stage.dataset.state !== "done") blowOut(c);
    } else {
      c.grow = Math.max(0, c.grow - dt * 9);
      c.ember = Math.max(0, c.ember - dt * 0.7);
    }
    c.emberDot.setAttribute("opacity", c.ember.toFixed(3));
    drawFlame(c, time, c.lit ? wind : 0);
  }

  if (!finishAt && candles.every((c) => !c.lit) && stage.dataset.state !== "done") {
    finishAt = now + 750;
  }
  if (finishAt && now >= finishAt && stage.dataset.state !== "done") finish();

  drawAir(dt, time);

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
$("relight").addEventListener("click", relight);

$("shareForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("friend").value.trim();
  if (!name) {
    $("shareNote").textContent = "Add their name first.";
    $("friend").focus();
    return;
  }
  const link = `${location.origin}${location.pathname}?${new URLSearchParams({ name })}`;
  try {
    await navigator.clipboard.writeText(link);
    $("shareNote").textContent = "Link copied. Send it to them.";
  } catch {
    $("shareNote").textContent = link;
  }
});

addEventListener("resize", () => { resizeAir(); makePetals(); });

resizeAir();
makePetals();
candles.forEach((c) => { c.grow = 0; c.relightAt = performance.now() + 500; });
syncLitCount();
showIntro();
requestAnimationFrame(tick);
