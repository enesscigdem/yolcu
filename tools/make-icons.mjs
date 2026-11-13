import { Resvg } from '@resvg/resvg-js';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });

const ICONS = {
  // 1) Mavi: cam efektli yön oku
  mavi: `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5BC0FF"/><stop offset=".55" stop-color="#1C7CF5"/><stop offset="1" stop-color="#0B3FC4"/></linearGradient>
    <radialGradient id="glow" cx=".3" cy=".18" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="arrow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE9FF"/></linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#06215F" flood-opacity=".45"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <circle cx="512" cy="540" r="330" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="10"/>
  <circle cx="512" cy="540" r="420" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="8"/>
  <g transform="rotate(40 512 540)" filter="url(#sh)">
    <path d="M512 232 C522 232 530 238 535 249 L716 726 C724 748 700 768 680 755 L524 655 C516 650 508 650 500 655 L344 755 C324 768 300 748 308 726 L489 249 C494 238 502 232 512 232 Z" fill="url(#arrow)"/>
    <path d="M512 232 L512 652 C508 652 504 653 500 655 L344 755 C324 768 300 748 308 726 L489 249 C494 238 502 232 512 232 Z" fill="#B9D3FF" fill-opacity=".55"/>
  </g>`,

  // 2) Yol: gün batımında ufka giden yol
  yol: `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5B3CC4"/><stop offset=".45" stop-color="#FF6B6B"/><stop offset=".62" stop-color="#FFB547"/></linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E2A4F"/><stop offset="1" stop-color="#17142B"/></linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4A4560"/><stop offset="1" stop-color="#2A2638"/></linearGradient>
    <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4C2"/><stop offset=".6" stop-color="#FFD36B"/><stop offset="1" stop-color="#FFB547" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#sky)"/>
  <circle cx="512" cy="600" r="210" fill="url(#sun)"/>
  <path d="M0 610 C160 560 300 590 420 600 C560 612 700 560 1024 590 L1024 1024 L0 1024 Z" fill="url(#ground)"/>
  <path d="M488 612 L536 612 L860 1024 L164 1024 Z" fill="url(#road)"/>
  <path d="M488 612 L164 1024" stroke="#FFFFFF" stroke-opacity=".85" stroke-width="12"/>
  <path d="M536 612 L860 1024" stroke="#FFFFFF" stroke-opacity=".85" stroke-width="12"/>
  <path d="M512 640 L512 690 M512 735 L512 805 M512 860 L512 960" stroke="#FFD36B" stroke-width="18" stroke-linecap="round"/>`,

  // 3) Harita: mini harita üzerinde mavi rota ve hedef iğnesi
  harita: `
  <defs>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity=".28"/></filter>
    <linearGradient id="pin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF6A5F"/><stop offset="1" stop-color="#E5281D"/></linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="#F4F1EA"/>
  <path d="M0 0 H380 C330 120 220 160 0 170 Z" fill="#A8D5F7"/>
  <path d="M640 640 C760 600 900 640 1024 610 V1024 H600 C640 900 560 760 640 640 Z" fill="#C6E5B6"/>
  <rect x="120" y="610" width="230" height="170" rx="30" fill="#E7E2D8"/>
  <rect x="640" y="190" width="220" height="210" rx="30" fill="#E7E2D8"/>
  <path d="M-20 420 C300 470 600 340 1044 430" stroke="#D9D2C5" stroke-width="64" fill="none"/>
  <path d="M-20 420 C300 470 600 340 1044 430" stroke="#FFFFFF" stroke-width="48" fill="none"/>
  <path d="M470 -20 C440 300 560 640 500 1044" stroke="#E8A23A" stroke-width="74" fill="none"/>
  <path d="M470 -20 C440 300 560 640 500 1044" stroke="#FFCB5C" stroke-width="56" fill="none"/>
  <path d="M190 880 C260 700 420 690 470 560 C520 430 640 420 760 330" stroke="#FFFFFF" stroke-width="86" stroke-linecap="round" fill="none"/>
  <path d="M190 880 C260 700 420 690 470 560 C520 430 640 420 760 330" stroke="#0A84FF" stroke-width="58" stroke-linecap="round" fill="none"/>
  <circle cx="190" cy="880" r="46" fill="#FFFFFF"/><circle cx="190" cy="880" r="30" fill="#0A84FF"/>
  <g filter="url(#sh)"><path d="M770 340 C770 340 640 210 640 130 A130 130 0 0 1 900 130 C900 210 770 340 770 340 Z" fill="url(#pin)" stroke="#fff" stroke-width="14"/><circle cx="770" cy="132" r="46" fill="#fff"/></g>`,

  // 4) Gece: parlayan rota
  gece: `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1A2A5C"/><stop offset="1" stop-color="#070C1F"/></linearGradient>
    <linearGradient id="r" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3D7BFF"/><stop offset="1" stop-color="#5CF0FF"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
    <filter id="sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#5CF0FF" flood-opacity=".6"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g fill="#fff"><circle cx="160" cy="170" r="6" opacity=".8"/><circle cx="330" cy="110" r="4" opacity=".6"/><circle cx="880" cy="190" r="5" opacity=".7"/><circle cx="760" cy="90" r="3" opacity=".5"/><circle cx="120" cy="420" r="4" opacity=".5"/><circle cx="930" cy="470" r="4" opacity=".6"/></g>
  <path d="M170 900 C300 860 280 700 420 640 C560 580 610 700 720 600 C800 528 760 420 800 330" stroke="url(#r)" stroke-width="80" stroke-linecap="round" fill="none" filter="url(#glow)" opacity=".85"/>
  <path d="M170 900 C300 860 280 700 420 640 C560 580 610 700 720 600 C800 528 760 420 800 330" stroke="url(#r)" stroke-width="46" stroke-linecap="round" fill="none"/>
  <g transform="translate(800 250) rotate(18)" filter="url(#sh)"><path d="M0 -120 L95 115 L0 62 L-95 115 Z" fill="#fff" stroke="#fff" stroke-width="16" stroke-linejoin="round"/></g>`,

  // 5) Y: yolun ikiye ayrılışı (Yolcu'nun Y'si)
  y: `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3EE0B0"/><stop offset="1" stop-color="#0A7F86"/></linearGradient>
    <radialGradient id="glow" cx=".25" cy=".15" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="22" stdDeviation="24" flood-color="#04424A" flood-opacity=".45"/></filter>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <rect width="1024" height="1024" fill="url(#glow)"/>
  <g filter="url(#sh)" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M512 880 L512 560 L300 230 M512 560 L724 230" stroke="#FFFFFF" stroke-width="170"/>
    <path d="M512 840 L512 760 M512 690 L512 610 M478 520 L430 445 M390 383 L345 312 M546 520 L594 445 M634 383 L679 312" stroke="#0E8F86" stroke-width="22"/>
  </g>`
};

for (const [name, body] of Object.entries(ICONS)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;
  for (const size of [180, 512]) {
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
    writeFileSync(`${OUT}/${name}-${size}.png`, png);
  }
}
console.log('done');
