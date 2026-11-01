// Draws the cake as SVG. Flames are redrawn each frame in app.js.
const CANDLE_LAYOUT = [
  // Back row first so the front candles overlap them.
  { x: 408, y: 292, height: 150, width: 42, tilt: -1, toughness: 1.25 },
  { x: 610, y: 288, height: 150, width: 42, tilt: 4, toughness: 1.1 },
  { x: 312, y: 362, height: 180, width: 58, tilt: -9, toughness: 0.95 },
  { x: 704, y: 348, height: 170, width: 50, tilt: 8, toughness: 1.0 },
  { x: 508, y: 376, height: 175, width: 54, tilt: 0, toughness: 0.8 },
];

const BLOOMS = [
  { kind: "daisy", x: 118, y: 196, size: 92, fill: "#f4a9c4" },
  { kind: "citrus", x: 34, y: 372, size: 72 },
  { kind: "daisy", x: 196, y: 58, size: 62, fill: "#ffd84d" },
  { kind: "citrus", x: 836, y: 90, size: 82 },
  { kind: "daisy", x: 932, y: 268, size: 86, fill: "#fffaf6" },
  { kind: "daisy", x: 690, y: 18, size: 54, fill: "#f4a9c4" },
  { kind: "daisy", x: 42, y: 650, size: 78, fill: "#fffaf6" },
  { kind: "citrus", x: 948, y: 556, size: 64 },
  { kind: "daisy", x: 950, y: 800, size: 70, fill: "#ffd84d" },
  { kind: "daisy", x: 28, y: 880, size: 58, fill: "#f4a9c4" },
];

function daisyMarkup(size, fill) {
  const r = size * 0.5;
  const petals = Array.from({ length: 8 }, (_, i) =>
    `<ellipse class="ink" cx="0" cy="${-size * 0.62}" rx="${r * 0.56}" ry="${r * 0.82}" fill="${fill}" transform="rotate(${i * 45})" style="stroke-width:6"/>`
  ).join("");
  return `${petals}<circle class="ink" r="${size * 0.3}" fill="#f6b73c" style="stroke-width:6"/>
    <circle cx="${-size * 0.08}" cy="${-size * 0.09}" r="${size * 0.07}" fill="#fffaf6"/>`;
}

function citrusMarkup(size) {
  const segments = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `<line x1="0" y1="0" x2="${Math.cos(a) * size * 0.78}" y2="${Math.sin(a) * size * 0.78}" stroke="#fff3d6" stroke-width="6"/>`;
  }).join("");
  return `<circle class="ink" r="${size}" fill="#f28a2e" style="stroke-width:6"/>
    <circle r="${size * 0.8}" fill="#fff3d6"/><circle r="${size * 0.74}" fill="#f4633c"/>${segments}`;
}

function bloomsMarkup() {
  return BLOOMS.map((b, i) => `
    <g transform="translate(${b.x} ${b.y})">
      <g class="bloom" style="--d:${i}">${b.kind === "daisy" ? daisyMarkup(b.size, b.fill) : citrusMarkup(b.size)}</g>
    </g>`).join("");
}

function candleMarkup(c, i) {
  const half = c.width / 2;
  return `
    <g transform="translate(${c.x} ${c.y}) rotate(${c.tilt})">
      <path class="ink" fill="#fffaf6" d="M${-half - 34} 2 c-14 -24 12 -38 26 -30 c8 -14 ${c.width + 10} -14 ${c.width + 18} 2 c20 -6 34 16 18 32 c-4 16 -22 18 -30 12 c-10 8 -28 8 -36 0 c-10 6 -22 0 -24 -16 Z" style="stroke-width:7"/>
      <path class="line" d="M${-half - 14} 10 q14 8 26 2 M${half - 4} 4 q8 2 14 -2" style="stroke-width:4"/>
      <g id="wick-${i}">
        <line class="ink" x1="0" y1="${-c.height}" x2="0" y2="${-c.height - 24}" style="stroke-width:6"/>
        <circle class="ember" cx="0" cy="${-c.height - 24}" r="6" fill="#f0802c" opacity="0"/>
      </g>
      <g transform="translate(0 ${-c.height - 18})">
        <circle class="glow" r="88" fill="url(#glow)"/>
        <path class="flame-outer ink" fill="#c9281b"/>
        <path class="flame-inner" fill="#f58a2c"/>
      </g>
      <rect class="ink" x="${-half}" y="${-c.height}" width="${c.width}" height="${c.height}" rx="5" fill="url(#stripes)"/>
      <rect x="${half - c.width * 0.22}" y="${-c.height + 4}" width="${c.width * 0.22 - 4}" height="${c.height - 8}" fill="#141014" opacity=".16"/>
    </g>`;
}

function buildCake(svg) {
  svg.innerHTML = `
    <defs>
      <pattern id="stripes" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(-36)">
        <rect width="44" height="44" fill="#fbe45a"/>
        <rect width="44" height="20" fill="#ef7a35"/>
        <line x1="0" x2="44" y1="0" y2="0" stroke="#141014" stroke-width="5"/>
        <line x1="0" x2="44" y1="20" y2="20" stroke="#141014" stroke-width="5"/>
      </pattern>
      <radialGradient id="glow">
        <stop offset="0" stop-color="#ffb05c" stop-opacity=".75"/>
        <stop offset="1" stop-color="#ffb05c" stop-opacity="0"/>
      </radialGradient>
    </defs>

    ${bloomsMarkup()}

    <g class="body-group">
      <path class="ink" fill="#fffaf6" d="M488 648 C220 648 66 708 66 790 C66 880 250 958 488 958 C726 958 912 880 912 790 C912 708 756 648 488 648 Z"/>
      <path class="line" d="M92 842 C160 912 310 936 488 938 C650 938 760 918 846 866 M770 878 C816 866 858 842 880 806"/>

      <path class="ink" fill="#f8dacb" d="M140 430 L140 755 C140 846 300 892 495 892 C690 892 850 846 850 755 L850 430 Z"/>

      <path class="ink" fill="#f4a9c4" style="stroke-width:6" d="M142 572 C230 628 360 650 495 652 C630 652 760 630 848 578 L848 604 C760 656 630 678 495 678 C360 676 230 654 142 598 Z"/>
      <path class="ink" fill="#f4a9c4" style="stroke-width:6" d="M142 688 C230 744 360 768 495 770 C630 770 760 748 848 696 L848 722 C760 774 630 796 495 796 C360 794 230 770 142 714 Z"/>
      <path class="line" d="M160 640 q10 18 24 26 M358 600 q14 20 44 34 M790 548 q-12 16 -28 26 M162 756 q10 16 24 24 M790 664 q-18 14 -40 24 M722 830 q50 -10 90 -36 M360 838 q60 16 110 18"/>

      <path class="ink" fill="#f4a9c4" d="M124 414 C124 322 262 262 495 262 C730 262 872 322 872 414
        C874 452 866 486 852 492 C838 498 830 478 826 462
        C818 438 796 438 790 462 C784 494 772 518 744 520 C716 522 704 500 694 494
        C688 530 664 556 640 548 C614 540 612 512 588 494 C566 480 546 494 534 512
        C520 534 496 538 476 522 C462 512 448 506 432 516 C422 546 398 566 372 560
        C344 552 342 520 336 498 C328 484 312 488 306 506 C302 546 290 582 262 576
        C234 568 238 522 232 490 C226 460 206 456 198 474 C192 494 176 500 160 490
        C148 482 148 456 142 462 C126 456 122 436 124 414 Z"/>
      <path class="line" d="M172 400 C176 372 192 350 214 334 M226 424 C260 438 300 448 346 458 M250 412 C288 424 318 432 350 438 M400 442 h48 M526 444 h40 M650 434 C700 426 740 416 778 400 M788 372 C800 362 810 352 818 340 M196 480 q-2 30 8 40 M270 500 q-4 32 2 54 M406 496 q10 14 24 12 M566 480 q14 -10 30 -2 M672 496 q-4 18 -18 28 M772 470 q-4 18 -14 28"/>
    </g>

    <g id="candles">${CANDLE_LAYOUT.map(candleMarkup).join("")}</g>
  `;
}
