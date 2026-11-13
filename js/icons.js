// SF Symbols benzeri sade ikonlar (24x24)
const f = d => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${d}"/></svg>`;
const s = (d, w = 2.2) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" d="${d}"/></svg>`;

function gear() {
  const pts = [];
  const teeth = 8, ro = 10, ri = 7.6;
  for (let i = 0; i < teeth * 4; i++) {
    const a = (i / (teeth * 4)) * Math.PI * 2 - Math.PI / (teeth * 4);
    const r = (i % 4 === 0 || i % 4 === 1) ? ro : ri;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M${pts.join(' L')} Z M12 8.6 a3.4 3.4 0 1 0 0.001 0 Z"/></svg>`;
}

export const I = {
  search: s('M10.5 3.8a6.7 6.7 0 1 1 0 13.4 6.7 6.7 0 0 1 0-13.4zM15.4 15.4 20.3 20.3', 2.4),
  home: f('M12 3.2 2.8 11a1 1 0 0 0 1.3 1.5l.9-.8V19a2 2 0 0 0 2 2h3.2v-5.2h3.6V21H17a2 2 0 0 0 2-2v-7.3l.9.8A1 1 0 0 0 21.2 11z'),
  work: f('M9 3.5h6A2 2 0 0 1 17 5.5V7h2.5A2.5 2.5 0 0 1 22 9.5V12H2V9.5A2.5 2.5 0 0 1 4.5 7H7V5.5a2 2 0 0 1 2-2zm0 2V7h6V5.5zM2 13.5h8.5V15h3v-1.5H22v4a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5z'),
  star: f('M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z'),
  plus: s('M12 5v14M5 12h14', 2.6),
  loc: f('M20.3 3.1 3.6 10.2c-.8.3-.7 1.5.2 1.7l6.7 1.5 1.5 6.7c.2.9 1.4 1 1.7.2l7.1-16.7c.2-.5-.3-1-.5-.5z'),
  locLine: s('M20.3 3.7 3.9 10.6l7.2 1.6 1.6 7.2z', 2),
  x: s('M7 7l10 10M17 7 7 17', 2.6),
  car: f('M5.6 6.3A2.5 2.5 0 0 1 8 4.5h8a2.5 2.5 0 0 1 2.4 1.8L19.8 11H20a2 2 0 0 1 2 2v4.5a1 1 0 0 1-1 1h-1V20a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1.5h-9V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1.5H3a1 1 0 0 1-1-1V13a2 2 0 0 1 2-2h.2zM7.6 7 6.5 11h11l-1.1-4a.8.8 0 0 0-.8-.5H8.4a.8.8 0 0 0-.8.5zM6 13.2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm12 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'),
  gear: gear(),
  speaker: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.5 9h3.3L11.5 5v14l-4.7-4H3.5z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M15 9a4.2 4.2 0 0 1 0 6M17.8 6.3a8 8 0 0 1 0 11.4"/></svg>`,
  mute: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.5 9h3.3L11.5 5v14l-4.7-4H3.5z"/><path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>`,
  map: s('M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8zM9 4.5v12.7M15 6.8v12.7', 1.9),
  share: s('M12 3.5v11M8 7.3l4-3.8 4 3.8M7 10.5H5.8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12.4a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H17', 2),
  pin: f('M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 4.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z'),
  clock: s('M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3 2', 2),
  trash: s('M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10v6.5M14 10v6.5', 1.9),
  chevron: s('M9 5.5 15.5 12 9 18.5', 2.4),
  back: s('M15 5.5 8.5 12 15 18.5', 2.6),
  fuel: s('M5 20.5V5.5a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 13 5.5v15M3.5 20.5h11M5 10h8M13 9.5h1.8a1.7 1.7 0 0 1 1.7 1.7v4.8a1.5 1.5 0 0 0 3 0V8.5L17 6', 2),
  food: s('M7 3v18M4.5 3v5a2.5 2.5 0 0 0 5 0V3M17 21V3c-2.2 0-3.5 2.2-3.5 6v4.5H17', 2),
  health: f('M9.3 3h5.4v6.3H21v5.4h-6.3V21H9.3v-6.3H3V9.3h6.3z'),
  shop: s('M5 8h14l-1.1 12.5H6.1zM9 10V6.5a3 3 0 0 1 6 0V10', 2),
  school: f('M12 4 1.5 9.2 12 14.4l8.5-4.2v6.3h2V9.2zM6 12.8v3.4c0 1.6 2.7 3.2 6 3.2s6-1.6 6-3.2v-3.4l-6 3z'),
  road: s('M8.5 3 4.5 21M15.5 3l4 18M12 4v2.5M12 10.5v3M12 17.5V20', 2),
  parking: f('M6 3h7a6 6 0 0 1 0 12h-3v6H6zm4 4v4h3a2 2 0 0 0 0-4z'),
  warn: f('M12 3.2c.5 0 1 .3 1.2.7l8.4 15c.5.9-.2 2.1-1.2 2.1H3.6c-1 0-1.7-1.2-1.2-2.1l8.4-15c.2-.4.7-.7 1.2-.7zM11 9.5v5h2v-5zm0 6.5v2h2v-2z'),
  noentry: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor"/><rect x="6.5" y="10.4" width="11" height="3.2" rx="1" fill="#fff"/></svg>`,
  download: s('M12 3.5v11M8 10.7l4 3.8 4-3.8M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2', 2),
  upload: s('M12 14.5v-11M8 7.3l4-3.8 4 3.8M4.5 16.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2', 2),
  play: f('M7 4.5v15c0 .8.9 1.3 1.6.8l11-7.5c.6-.4.6-1.2 0-1.6l-11-7.5C7.9 3.2 7 3.7 7 4.5z'),
  walk: f('M13.5 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10.6 7.6c.4-.2.9-.3 1.4-.2l2 .4c.6.1 1 .5 1.3 1l1.3 2.6 2.2 1c.5.2.7.8.5 1.3s-.8.7-1.3.5l-2.5-1.1c-.2-.1-.4-.3-.5-.5l-.6-1.2-.9 3.8 2.3 2.2c.2.2.3.4.3.7l.5 4.4c.1.6-.4 1.1-1 1.1-.5 0-.9-.4-1-.9l-.4-4-2.1-2-1.1 4.4L8 21.4c-.3.5-.9.7-1.4.4-.5-.3-.7-.9-.4-1.4l1.6-2.8 1.6-6.6-1.5.8-.9 2.6c-.2.5-.7.8-1.3.6-.5-.2-.8-.7-.6-1.3l1-3.1c.1-.3.3-.5.6-.6z'),
  bike: s('M5.5 17.5a3.5 3.5 0 1 0 0-.01zM18.5 17.5a3.5 3.5 0 1 0 0-.01zM5.5 17.5 9 10h7l2.5 7.5M9 10l3.5 7.5 3.5-7.5M14 6.5h2.5L18.5 17.5M8 7h3', 1.9),
  layers: s('M12 3.5 2.8 8.2 12 13l9.2-4.8zM3.5 12.2 12 16.6l8.5-4.4M3.5 16.2 12 20.6l8.5-4.4', 1.9),
  copy: s('M8.5 8.5h10v12h-10zM5.5 15.5v-12h10', 2),
  check: s('M5 12.5l4.5 4.5L19 7.5', 2.6),
  camera: f('M9.2 4.5h5.6l1.5 2H19a2.5 2.5 0 0 1 2.5 2.5v8.5A2.5 2.5 0 0 1 19 20H5a2.5 2.5 0 0 1-2.5-2.5V9A2.5 2.5 0 0 1 5 6.5h2.7zM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z'),
  route: s('M6 19.5a2 2 0 1 0 0-.01zM18 6.5a2 2 0 1 0 0-.01zM6 17.5V14a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3V8.5', 2.2),
  cone: f('M10.2 3h3.6l1.3 4.5H8.9zM8.5 9h7l1.1 4H7.4zM7 14.5h10l1.2 4.5H5.8zM3 20h18v1.5H3z'),
  arrowR: s('M5 12h13M13 6.5 18.5 12 13 17.5', 2.2),
  cube: s('M12 3 20 7.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9', 1.8),
  compass:s('M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM15.5 8.5l-2 5-5 2 2-5z', 1.9)
};

export const KIND_ICON = {
  pin: ['pin', 'c-red'], food: ['food', 'c-orange'], fuel: ['fuel', 'c-blue'], health: ['health', 'c-pink'],
  shop: ['shop', 'c-yellow'], school: ['school', 'c-brown'], road: ['road', 'c-gray'], parking: ['parking', 'c-blue'],
  home: ['home', 'c-teal'], work: ['work', 'c-brown'], star: ['star', 'c-yellow'], recent: ['clock', 'c-gray']
};
