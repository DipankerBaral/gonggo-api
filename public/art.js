// GongGo's drawings: one simple line icon per sport, and the Wollongong
// coastline for the welcome banner. All original, all inline SVG, so they're
// sharp on every screen and cost nothing to load.
window.GongGoArt = (function () {
  'use strict';

  const ICONS = {
    soccer: '<circle cx="12" cy="12" r="9"/><path d="M12 7.6l4 2.9-1.5 4.6h-5L8 10.5z"/><path d="M12 3v4.6M16 10.5l4.4-1.3M14.5 15.1l2.6 3.8M9.5 15.1l-2.6 3.8M8 10.5L3.6 9.2"/>',
    basketball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8"/>',
    running: '<circle cx="14.5" cy="4.5" r="2"/><path d="M7 20.5l3.6-5.2 3.1 2.4v3.8"/><path d="M5.5 11.2l3.4-3.4 4.4 1.2 2.4 3.4 3.3.8"/><path d="M10.6 15.3l2.7-6.3"/>',
    'table-tennis': '<circle cx="10" cy="10" r="6.5"/><path d="M14.6 14.6l5.6 5.6"/><circle cx="19" cy="5" r="1.7"/>',
    tennis: '<circle cx="12" cy="12" r="9"/><path d="M5.7 5.6c3 3.2 3 9.6 0 12.8M18.3 5.6c-3 3.2-3 9.6 0 12.8"/>',
    volleyball: '<circle cx="12" cy="12" r="9"/><path d="M12 3c-1.3 3.6-.9 6.6 0 9M12 12c3.3 1.9 6.3 2.4 8.7 1.4M12 12c-3.2 2.1-5 4.8-5.6 7.6"/>',
    'touch-football': '<ellipse cx="12" cy="12" rx="9.6" ry="5.6" transform="rotate(-35 12 12)"/><path d="M9.4 14.6l5.2-5.2M10.6 11.4l2 2M12.1 9.9l2 2"/>',
    cricket: '<path d="M14.8 3.6l5.6 5.6-8.6 8.6a1.9 1.9 0 0 1-2.7 0l-2.9-2.9a1.9 1.9 0 0 1 0-2.7z"/><path d="M6.2 17.8L3.5 20.5"/><circle cx="18.5" cy="18.5" r="2"/>',
    'community-event': '<circle cx="8.5" cy="8" r="3"/><circle cx="16.6" cy="9.2" r="2.4"/><path d="M3 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6M14.4 14.4c3.4-.7 6.6 1.5 6.6 5.6"/>',
    other: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  };

  function icon(sport, className = 'icon') {
    const paths = ICONS[sport] || ICONS.other;
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
  }

  // The coast at Wollongong: escarpment behind, the harbour lighthouse on its
  // headland, the sea, a strip of beach, and the red and yellow flags you
  // swim between. The sky is the banner's own background, so text sits above
  // the drawing and never on top of it. Cropped from the left on phones.
  const COAST = `<svg class="coast" viewBox="0 0 1440 300" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#127b89"/><stop offset="1" stop-color="#0a6a78"/>
      </linearGradient>
    </defs>
    <circle cx="1210" cy="78" r="34" fill="#f2c230" opacity="0.9"/>
    <!-- the escarpment: two ridges, the far one paler -->
    <path d="M0 150 C120 92 210 104 300 118 C400 70 470 62 560 96 C650 128 720 80 820 72 C930 64 1000 112 1090 120 C1180 128 1260 104 1440 118 L1440 230 L0 230 Z" fill="#7fa79c"/>
    <path d="M0 186 C110 150 190 160 280 170 C380 138 470 136 560 160 C660 186 760 150 860 150 C960 150 1040 178 1130 182 C1220 186 1320 170 1440 176 L1440 240 L0 240 Z" fill="#3f6f62"/>
    <!-- headland and the lighthouse -->
    <path d="M1150 222 C1190 196 1250 190 1300 206 C1330 214 1350 222 1360 230 L1150 230 Z" fill="#2c5a4f"/>
    <rect x="1262" y="146" width="16" height="56" rx="2" fill="#ffffff"/>
    <path d="M1258 146 h24 l-4 -14 h-16 z" fill="#cf3a2e"/>
    <rect x="1265" y="164" width="10" height="5" fill="#cf3a2e"/>
    <!-- the sea, with a few lines of swell -->
    <rect y="226" width="1440" height="44" fill="url(#sea)"/>
    <path d="M40 240 h70 M180 250 h110 M380 238 h60 M520 252 h120 M760 242 h80 M930 254 h100 M1100 244 h70 M1240 252 h90" stroke="#5fb3bd" stroke-width="3" stroke-linecap="round" opacity="0.7"/>
    <!-- beach and the flags -->
    <path d="M0 270 C300 262 600 266 900 262 C1100 260 1300 264 1440 262 L1440 300 L0 300 Z" fill="#efe2c2"/>
    <g transform="translate(1040 214)">
      <path d="M0 0 v52" stroke="#12313b" stroke-width="3"/>
      <path d="M2 2 h30 v20 h-30 z" fill="#f2c230"/><path d="M2 2 h30 l-30 20 z" fill="#cf3a2e"/>
    </g>
    <g transform="translate(1120 216)">
      <path d="M0 0 v50" stroke="#12313b" stroke-width="3"/>
      <path d="M2 2 h30 v20 h-30 z" fill="#f2c230"/><path d="M2 2 h30 l-30 20 z" fill="#cf3a2e"/>
    </g>
  </svg>`;

  return { icon, COAST };
})();
