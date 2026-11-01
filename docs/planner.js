import { api } from "./api.js";
import { CakeScene } from "./cake3d.js";

const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const FROSTINGS = [["Pink", "#f4a9c4"], ["Sky", "#a9d8f4"], ["Mint", "#b6e8c8"], ["Lavender", "#cdb8f0"], ["Lemon", "#fbe88a"], ["Chocolate", "#8a5a3c"], ["White", "#fffaf6"]];
const SPONGES = [["Peach", "#f8dacb"], ["Vanilla", "#fcefc7"], ["Chocolate", "#b07a54"], ["Red velvet", "#c85a54"]];
const STRIPES = [["Sunset", "#fbe45a,#ef7a35"], ["Candy", "#fffaf6,#e8588c"], ["Ocean", "#bfe6fa,#2f7fd1"], ["Garden", "#e6f7a8,#3f9e5a"], ["Grape", "#e3d4fb,#7a4fc9"]];

let scene = null;
let party = null;
let previewKey = "";
let lastFrame = performance.now();

function addRadios(container, name, options, swatch) {
  options.forEach(([label, value], i) => {
    const wrap = document.createElement("label");
    wrap.className = swatch ? "swatch" : "segment";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = value;
    input.checked = i === 0;
    input.setAttribute("aria-label", label);
    const face = document.createElement("span");
    if (swatch) {
      const [a, b] = value.split(",");
      face.style.background = b ? `linear-gradient(135deg, ${a} 50%, ${b} 50%)` : a;
      face.title = label;
    } else {
      face.textContent = label;
    }
    wrap.append(input, face);
    container.append(wrap);
  });
}

function chosen(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function setChosen(name, value) {
  const input = [...document.getElementsByName(name)].find((el) => el.value.toLowerCase() === value.toLowerCase());
  if (input) input.checked = true;
}

function readForm() {
  return {
    name: $("name").value,
    age: $("age").value ? Number($("age").value) : null,
    message: $("message").value,
    tiers: Number(chosen("tiers")),
    candles: Number($("candles").value),
    frosting: chosen("frosting"),
    sponge: chosen("sponge"),
    candleColors: chosen("candleColors").split(","),
  };
}

function fillForm(config) {
  $("name").value = config.name;
  $("age").value = config.age || "";
  $("message").value = config.message;
  $("candles").value = config.candles;
  setChosen("tiers", String(config.tiers));
  setChosen("frosting", config.frosting);
  setChosen("sponge", config.sponge);
  setChosen("candleColors", config.candleColors.join(","));
}

function updateHero() {
  const name = $("name").value.trim();
  $("heroLead").textContent = name ? "Plan" : "Plan a";
  $("heroName").textContent = name ? `${name}'s` : "birthday";
  $("heroTail").textContent = name ? "birthday cake." : "cake.";
}

function renderPreview() {
  const config = readForm();
  $("candleCount").textContent = config.candles;
  updateHero();
  const key = JSON.stringify([config.tiers, config.candles, config.frosting, config.sponge, config.candleColors]);
  if (key === previewKey) return;
  previewKey = key;
  if (scene) scene.build(config);
  else scene = new CakeScene($("cake"), config);
  scene.candles.forEach((c) => { c.grow = 1; });
}

function animate(now) {
  const dt = Math.min(0.05, (now - lastFrame) / 1000);
  lastFrame = now;
  scene.render(now / 1000, dt, 0, reduceMotion ? 0.25 : 1);
  requestAnimationFrame(animate);
}

function showShare(code) {
  const base = new URL("./", location.href).href;
  const plannerPath = `index.html?plan=${party.id}&key=${party.planKey}`;
  $("partyLink").value = `${base}party.html?id=${party.id}`;
  $("birthdayCode").value = code;
  $("plannerLink").value = base + plannerPath;
  $("openParty").href = `party.html?id=${party.id}`;
  $("planForm").hidden = true;
  $("shareCard").hidden = false;
  const name = $("name").value.trim();
  $("codeName").textContent = name;
  $("heroLead").textContent = "";
  $("heroName").textContent = `${name}'s`;
  $("heroTail").textContent = "cake is ready.";
  $("heroQuiet").textContent = "Now share it.";
  history.replaceState(null, "", plannerPath);
}

function showMessageCount(count) {
  $("messageCount").textContent = count ? `${count} ${count === 1 ? "candle has a message" : "candles have messages"} so far.` : "";
}

function showForm() {
  $("shareCard").hidden = true;
  $("planForm").hidden = false;
  $("save").textContent = party ? "Save changes" : "Create the cake";
  $("heroQuiet").textContent = "Every candle can hold a message.";
  updateHero();
}

$("planForm").addEventListener("input", renderPreview);

$("planForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("planNote").textContent = "Saving...";
  $("save").disabled = true;
  try {
    if (party) await api.updateParty(party.id, party.planKey, readForm());
    else party = await api.createParty(readForm());
    $("planNote").textContent = "";
    showShare(party.code);
  } catch (err) {
    $("planNote").textContent = err.message;
  } finally {
    $("save").disabled = false;
  }
});

$("editCake").addEventListener("click", showForm);

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const input = $(button.dataset.copy);
    input.select();
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy"; }, 1500);
    } catch {
      button.textContent = "Press Cmd+C";
    }
  });
});

async function loadExisting() {
  const params = new URLSearchParams(location.search);
  const id = params.get("plan");
  if (!id) return;
  const planKey = params.get("key") || "";
  const data = await api.readPlan(id, planKey).catch(() => null);
  if (!data) {
    $("planNote").textContent = "That planner link isn't valid, so this will make a new cake.";
    history.replaceState(null, "", "index.html");
    return;
  }
  party = { id, planKey, code: data.code };
  showMessageCount(data.messageCount);
  fillForm(data.config);
  renderPreview();
  showShare(data.code);
}

addRadios($("tiers"), "tiers", [["1 tier", "1"], ["2 tiers", "2"], ["3 tiers", "3"]], false);
addRadios($("frosting"), "frosting", FROSTINGS, true);
addRadios($("sponge"), "sponge", SPONGES, true);
addRadios($("candleColors"), "candleColors", STRIPES, true);
renderPreview();
loadExisting();
requestAnimationFrame(animate);
