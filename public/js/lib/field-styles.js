// Display styles and formats for Fields: progress bars, ratings, toggles, number
// formats, date/time formats and durations. The ids are also listed in
// worker/src/fields.js (scripts/check.mjs keeps the two in step).

// --- Progress bars --------------------------------------------------------------
// cells: number of symbols; parts: partial-fill symbols from emptiest to fullest.
export const PROGRESS_STYLES = {
  bar: { label: 'Simple bar', desc: 'Coloured bar' },
  smooth: { label: 'Smooth Bar', desc: 'Classic smooth-fill bar with partial blocks', full: '█', empty: ' ', parts: ['▏', '▎', '▍', '▌', '▋', '▊', '▉'], frame: true },
  blockLow: { label: 'Block / Low Bar', desc: 'Full blocks with low-line empty segments', full: '█', empty: '▁' },
  brailleSmooth: { label: 'Braille Smooth', desc: 'Braille dots with partial fill transitions', full: '⣿', empty: '⠀', parts: ['⡀', '⡄', '⡆', '⡇', '⣇', '⣧', '⣷'], frame: true },
  brailleBlock: { label: 'Braille Block', desc: 'Braille dots with sharp fill transitions', full: '⣿', empty: '⣀' },
  circles: { label: 'Circles', desc: 'Filled, half and empty circles', full: '●', empty: '○', parts: ['◐'] },
  squares: { label: 'Squares', desc: 'Filled, half and empty squares', full: '■', empty: '□', parts: ['◧'] },
  blockShade: { label: 'Block / Shade', desc: 'Full blocks with light-shade empty', full: '█', empty: '░' },
  emojiSquares: { label: 'Emoji Squares', desc: 'Bold black and white emoji squares', full: '⬛', empty: '⬜' },
  parallelogram: { label: 'Parallelogram', desc: 'Slanted fill and empty segments', full: '▰', empty: '▱' },
  roundedRect: { label: 'Rounded Rect', desc: 'Small filled and outlined rectangles', full: '▬', empty: '▭' },
  tallBar: { label: 'Tall Bar', desc: 'Tall filled and empty vertical bars', full: '▮', empty: '▯' },
  largeDots: { label: 'Large Dots', desc: 'Large filled and empty dot circles', full: '⬤', empty: '◯' },
  emojiDots: { label: 'Emoji Dots', desc: 'Emoji-style filled and empty dots', full: '⚫', empty: '⚪' },
  custom: { label: 'Your own symbols', desc: 'Pick the filled and empty symbols, e.g. emoji' }
};

/** Text bar for a 0–100 value in the given style. */
export function progressText(style, value, { cells = 10, filled, empty } = {}) {
  const s = PROGRESS_STYLES[style] && style !== 'bar' ? PROGRESS_STYLES[style] : PROGRESS_STYLES.parallelogram;
  const full = style === 'custom' ? (filled || '🔵') : s.full;
  const none = style === 'custom' ? (empty || '⚪') : s.empty;
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  const exact = (v / 100) * cells;
  let n = Math.floor(exact);
  let partial = '';
  if (s.parts && style !== 'custom' && n < cells) {
    const frac = exact - n;
    const idx = Math.round(frac * (s.parts.length + 1)) - 1;
    if (idx >= s.parts.length) n += 1;
    else if (idx >= 0) partial = s.parts[idx];
  }
  const rest = cells - n - (partial ? 1 : 0);
  return full.repeat(n) + partial + none.repeat(Math.max(0, rest));
}

// --- Ratings ----------------------------------------------------------------------
export const RATING_STYLES = {
  classicStars: { label: 'Classic Stars', desc: 'Traditional filled and outline star rating', on: '★', off: '☆', color: '#e2a400' },
  outlinedStars: { label: 'Outlined Stars', desc: 'Bold outlined star rating', on: '✮', off: '✩', color: '#e2a400' },
  pinwheelStars: { label: 'Pinwheel Stars', desc: 'Circled pinwheel-style stars', on: '✪', off: '⍟', color: '#e2a400' },
  fourPointStars: { label: '4-Point Stars', desc: 'Four-pointed decorative stars', on: '✦', off: '✧', color: '#e2a400' },
  circles: { label: 'Circles', desc: 'Standard filled and empty circles', on: '●', off: '○', color: '#0c66e4' },
  largeCircles: { label: 'Large Circles', desc: 'Extra-large filled and empty circles', on: '⬤', off: '◯', color: '#0c66e4' },
  bullseye: { label: 'Bullseye', desc: 'Bullseye target-style circles', on: '◉', off: '○', color: '#c9372c' },
  squares: { label: 'Squares', desc: 'Filled and empty square blocks', on: '■', off: '□', color: '#44546f' },
  diamonds: { label: 'Diamonds', desc: 'Filled and empty diamond shapes', on: '◆', off: '◇', color: '#6e5dc6' },
  hexagons: { label: 'Hexagons', desc: 'Filled and empty hexagon shapes', on: '⬢', off: '⬡', color: '#1f845a' },
  hearts: { label: 'Hearts', desc: 'Classic heart rating', on: '♥', off: '♡', color: '#c9372c' },
  goldStars: { label: 'Gold Stars', desc: 'Emoji gold star rating', on: '⭐', off: '☆', emoji: true },
  redHearts: { label: 'Red Hearts', desc: 'Emoji red heart rating', on: '❤️', off: '🤍', emoji: true },
  redCircles: { label: 'Red Circles', desc: 'Emoji red circle dots', on: '🔴', off: '⚪', emoji: true },
  greenCircles: { label: 'Green Circles', desc: 'Emoji green circle dots', on: '🟢', off: '⚪', emoji: true },
  blueSquares: { label: 'Blue Squares', desc: 'Emoji blue square blocks', on: '🟦', off: '⬜', emoji: true },
  moons: { label: 'Moons', desc: 'Moon phase emoji rating', on: '🌕', off: '🌑', emoji: true },
  batteries: { label: 'Batteries', desc: 'Battery charge level emoji', on: '🔋', off: '🪫', emoji: true },
  target: { label: 'Target', desc: 'Bullseye target emoji rating', on: '🎯', off: '⭕', emoji: true }
};

export function ratingText(style, value, max = 5) {
  const s = RATING_STYLES[style] || RATING_STYLES.classicStars;
  const n = Math.max(0, Math.min(max, Number(value) || 0));
  return s.on.repeat(n) + s.off.repeat(max - n);
}

// --- Toggles ----------------------------------------------------------------------
// on/off: symbols; box: 'square' | 'round' | null (no frame); off '' shows nothing when off.
export const TOGGLE_STYLES = {
  checkbox: { label: 'Checkbox', desc: 'Standard checkbox square toggle', on: '✓', off: '', box: 'square' },
  circleCheck: { label: 'Circle Check', desc: 'Circled checkmark toggle', on: '✓', off: '', box: 'round' },
  radioDot: { label: 'Radio Dot', desc: 'Radio button dot toggle', on: '●', off: '', box: 'round' },
  checkOnly: { label: 'Check Only', desc: 'Shows checkmark when on, nothing when off', on: '✓', off: '', box: null },
  circleCheckOnly: { label: 'Circle Check Only', desc: 'Shows circled check when on, nothing when off', on: '✓', off: '', box: 'round', hideOff: true },
  squareCheckOnly: { label: 'Square Check Only', desc: 'Shows square check when on, nothing when off', on: '✓', off: '', box: 'square', hideOff: true },
  toggleSwitch: { label: 'Toggle Switch', desc: 'On/off slide toggle switch', switch: true },
  star: { label: 'Star', desc: 'Filled and outline star toggle', on: '★', off: '☆', box: null },
  thumbs: { label: 'Thumbs Up / Down', desc: 'Thumbs up when on, thumbs down when off', on: '👍', off: '👎', box: null },
  lock: { label: 'Lock / Unlock', desc: 'Locked when on, unlocked when off', on: '🔒', off: '🔓', box: null },
  arrow: { label: 'Arrow Up / Down', desc: 'Arrow up when on, arrow down when off', on: '↑', off: '↓', box: null },
  circleArrow: { label: 'Circle Arrow', desc: 'Circled arrow up/down toggle', on: '↑', off: '↓', box: 'round' },
  squareCaret: { label: 'Square Caret', desc: 'Square caret up/down toggle', on: '▲', off: '▼', box: 'square' },
  checkX: { label: 'Check / X', desc: 'Checkmark when on, X when off', on: '✓', off: '✗', box: null },
  like: { label: 'Like (thumbs up)', desc: 'Thumbs-up approval toggle', on: '👍', off: '👍', box: null, fadeOff: true }
};

// --- Numbers ----------------------------------------------------------------------
export const NUMBER_FORMATS = {
  standard: { label: 'Standard', desc: 'Grouped digits with decimal separator', example: 1234.57 },
  nogroup: { label: 'No Grouping', desc: 'Plain number without thousands separator', example: 1234.57 },
  scientific: { label: 'Scientific', desc: 'Scientific notation with exponent', example: 1234.57 },
  engineering: { label: 'Engineering', desc: 'Engineering notation with exponent multiple of 3', example: 1234.57 },
  currency: { label: 'Currency', desc: 'Currency with symbol and grouping', example: 1234.56 },
  accounting: { label: 'Accounting', desc: 'Accounting format with parentheses for negatives', example: -1234.56 },
  percent01: { label: 'Percent (0-1)', desc: 'Percentage from decimal value', example: 0.72 },
  percent100: { label: 'Percent (0-100)', desc: 'Percentage from whole number', example: 72 }
};
// Formats used before these styles existed.
const LEGACY_NUMBER = { plain: ['standard'], gbp: ['currency', 'GBP'], eur: ['currency', 'EUR'], usd: ['currency', 'USD'], percent: ['percent100'] };

export function numberFormatOf(field) {
  const legacy = LEGACY_NUMBER[field.format];
  return { format: legacy ? legacy[0] : (NUMBER_FORMATS[field.format] ? field.format : 'standard'), currency: field.currency || (legacy && legacy[1]) || 'GBP' };
}

export function currencies() {
  try {
    if (Intl.supportedValuesOf) return Intl.supportedValuesOf('currency');
  } catch { /* older browsers */ }
  return ['GBP', 'EUR', 'USD', 'CHF', 'JPY', 'CAD', 'AUD', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'TRY', 'INR', 'CNY', 'HKD', 'SGD', 'ZAR', 'AED', 'SAR', 'BRL', 'MXN'];
}

export function formatNumberValue(field, value) {
  if (typeof value !== 'number') return String(value ?? '');
  const { format, currency } = numberFormatOf(field);
  const d = Number.isInteger(field.decimals) ? field.decimals : 2;
  const L = 'en-GB';
  try {
    switch (format) {
      case 'nogroup': return new Intl.NumberFormat(L, { useGrouping: false, maximumFractionDigits: d }).format(value);
      case 'scientific': return new Intl.NumberFormat(L, { notation: 'scientific', maximumFractionDigits: d }).format(value);
      case 'engineering': return new Intl.NumberFormat(L, { notation: 'engineering', maximumFractionDigits: d }).format(value);
      case 'currency': return new Intl.NumberFormat(L, { style: 'currency', currency, minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
      case 'accounting': return new Intl.NumberFormat(L, { style: 'currency', currency, currencySign: 'accounting', minimumFractionDigits: d, maximumFractionDigits: d }).format(value);
      case 'percent01': return new Intl.NumberFormat(L, { style: 'percent', maximumFractionDigits: Math.max(0, d - 2) }).format(value);
      case 'percent100': return `${new Intl.NumberFormat(L, { maximumFractionDigits: d }).format(value)}%`;
      default: return new Intl.NumberFormat(L, { maximumFractionDigits: d }).format(value);
    }
  } catch {
    return String(value);
  }
}

/** Colour for a value with "colour by value" on: red below low, yellow below high, green from high. */
export function scaleColor(field, value) {
  if (!field.scale || typeof value !== 'number') return null;
  const pct = field.type === 'number' && numberFormatOf(field).format === 'percent01' ? value * 100 : value;
  const low = Number.isFinite(field.low) ? field.low : 33;
  const high = Number.isFinite(field.high) ? field.high : 66;
  const color = pct < low ? 'red' : pct < high ? 'yellow' : 'green';
  return field.invert ? ({ red: 'green', green: 'red', yellow: 'yellow' })[color] : color;
}

// --- Dates and times ----------------------------------------------------------------
// kind: 'date' (YYYY-MM-DD), 'time' (HH:MM) or 'datetime' (ISO, UTC).
const D = { day: '2-digit', month: '2-digit', year: 'numeric' };
const T12 = { hour: '2-digit', minute: '2-digit', hour12: true };
const T24 = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
export const DATE_FORMATS = {
  dateShort: { label: 'Date Short', desc: 'Short date format', kind: 'date', opts: D },
  dateExtraShort: { label: 'Date Extra Short', desc: 'Compact date', kind: 'date', opts: { ...D, year: '2-digit' } },
  dateMedium: { label: 'Date Medium', desc: 'Medium date with abbreviated month', kind: 'date', opts: { day: 'numeric', month: 'short', year: 'numeric' } },
  dateMediumWeekday: { label: 'Date Medium Weekday', desc: 'Medium date with day of week', kind: 'date', opts: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } },
  dateFull: { label: 'Date Full', desc: 'Full date with long month name', kind: 'date', opts: { day: 'numeric', month: 'long', year: 'numeric' } },
  dateHuge: { label: 'Date Huge', desc: 'Verbose date with full day and month names', kind: 'date', opts: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } },
  yearOnly: { label: 'Year Only', desc: 'Year only', kind: 'date', opts: { year: 'numeric' } },
  monthYearShort: { label: 'Month / Year Short', desc: 'Month and year abbreviated', kind: 'date', opts: { month: 'short', year: 'numeric' } },
  timeSimple: { label: 'Time Simple', desc: 'Simple 12-hour time', kind: 'time', opts: T12 },
  time24: { label: 'Time 24-Hour', desc: '24-hour time', kind: 'time', opts: T24 },
  timeOffset: { label: 'Time with Offset', desc: 'Time with timezone offset', kind: 'time', opts: { ...T12, timeZoneName: 'short' } },
  timeLongOffset: { label: 'Time Long Offset', desc: 'Time with full timezone name', kind: 'time', opts: { ...T24, timeZoneName: 'long' } },
  time24Offset: { label: 'Time 24-Hour Offset', desc: '24-hour time with timezone', kind: 'time', opts: { ...T24, timeZoneName: 'short' } },
  datetimeShort: { label: 'DateTime Short', desc: 'Short date and time', kind: 'datetime', opts: { ...D, ...T12 } },
  datetimeExtraShort: { label: 'DateTime Extra Short', desc: 'Compact date and time', kind: 'datetime', opts: { ...D, year: '2-digit', ...T12 } },
  datetimeShortOffset: { label: 'DateTime Short + Offset', desc: 'Short date/time with timezone', kind: 'datetime', opts: { ...D, ...T12, timeZoneName: 'short' } },
  datetimeMedium: { label: 'DateTime Medium', desc: 'Medium date and time', kind: 'datetime', opts: { day: 'numeric', month: 'short', year: 'numeric', ...T12 } },
  datetimeMediumWeekday: { label: 'DateTime Medium Weekday', desc: 'Medium date/time with weekday', kind: 'datetime', opts: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...T12 } },
  datetimeFull: { label: 'DateTime Full', desc: 'Full date and time', kind: 'datetime', opts: { day: 'numeric', month: 'long', year: 'numeric', ...T12 } },
  datetimeHuge: { label: 'DateTime Huge', desc: 'Verbose date and time', kind: 'datetime', opts: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...T12 } },
  datetimeHugeOffset: { label: 'DateTime Huge + Offset', desc: 'Verbose date/time with timezone', kind: 'datetime', opts: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...T12, timeZoneName: 'short' } },
  datetime24Short: { label: 'DateTime 24h Short', desc: '24-hour short date/time', kind: 'datetime', opts: { ...D, ...T24 } },
  datetimeMediumOffset: { label: 'DateTime Medium + Offset', desc: 'Medium date/time with timezone', kind: 'datetime', opts: { day: 'numeric', month: 'short', year: 'numeric', ...T12, timeZoneName: 'short' } },
  datetimeMediumWeekdayOffset: { label: 'DateTime Medium Weekday + Offset', desc: 'Weekday date/time with timezone', kind: 'datetime', opts: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...T12, timeZoneName: 'short' } },
  datetimeFullOffset: { label: 'DateTime Full + Offset', desc: 'Full date/time with timezone', kind: 'datetime', opts: { day: 'numeric', month: 'long', year: 'numeric', ...T12, timeZoneName: 'short' } },
  datetime24Medium: { label: 'DateTime 24h Medium', desc: '24-hour medium date/time', kind: 'datetime', opts: { day: 'numeric', month: 'short', year: 'numeric', ...T24 } },
  datetime24MediumWeekday: { label: 'DateTime 24h Medium Weekday', desc: '24-hour medium with weekday', kind: 'datetime', opts: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', ...T24 } },
  datetime24Full: { label: 'DateTime 24h Full', desc: '24-hour full date/time', kind: 'datetime', opts: { day: 'numeric', month: 'long', year: 'numeric', ...T24 } },
  datetime24Huge: { label: 'DateTime 24h Huge', desc: '24-hour verbose date/time', kind: 'datetime', opts: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', ...T24 } }
};

export function dateKind(field) {
  return (DATE_FORMATS[field.format] || DATE_FORMATS.dateMedium).kind;
}

/** Date object for a stored value of the given kind (time values use today's date). */
export function toDate(kind, value) {
  if (!value) return null;
  if (kind === 'time') {
    const m = String(value).match(/^(\d{2}):(\d{2})$/);
    if (!m) return null;
    const d = new Date();
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    return d;
  }
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateValue(field, value) {
  const fmt = DATE_FORMATS[field.format] || DATE_FORMATS.dateMedium;
  const d = toDate(fmt.kind, value);
  if (!d) return String(value ?? '');
  try { return new Intl.DateTimeFormat('en-GB', fmt.opts).format(d); } catch { return d.toLocaleString(); }
}

/** 'YYYY-MM-DD' of a stored value (for deadline colours), or null for time-only fields. */
export function dayOf(field, value) {
  const kind = dateKind(field);
  if (kind === 'time' || !value) return null;
  const d = toDate(kind, value);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Deadline colour: with warning days, red when overdue or due today, orange within the warning days, else green. */
export function dateColor(field, day, defaultColor) {
  if (!day) return null;
  if (!Number.isInteger(field.warnDays)) return defaultColor(day);
  const today = new Date();
  const t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const [y, m, dd] = day.split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, dd) - t0) / 86400000);
  return days <= 0 ? 'red' : days <= field.warnDays ? 'orange' : 'green';
}

// --- Durations ------------------------------------------------------------------------
export const DURATION_FORMATS = { clock: { label: 'Clock (01:30)' }, words: { label: 'Words (1h 30m)' }, decimal: { label: 'Hours (1.5 h)' } };

/** Minutes from "1:30", "1h 30m", "90m", "1.5h", "90". Returns null if not understood. */
export function parseDuration(input) {
  const s = String(input ?? '').trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+):([0-5]?\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(?:(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?))?\s*(?:(\d+)\s*(?:m|min|mins|minutes?))?$/);
  if (m && (m[1] || m[2])) return Math.round(Number(m[1] || 0) * 60) + Number(m[2] || 0);
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}

export function formatDuration(field, minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n)) return '';
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (field.format === 'words') return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
  if (field.format === 'decimal') return `${Math.round((n / 60) * 100) / 100} h`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
