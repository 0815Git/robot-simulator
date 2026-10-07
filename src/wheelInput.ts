// File: src/wheelInput.ts
// ===== מיפוי הגה+דוושות Logitech G920 (steerMode 'C') =====
// מקור-אמת יחיד לכיול ההגה: הרובוט (Robot.tsx) והרחפן (Drone.tsx) קוראים את אותם
// ערכים דרך readWheelDrive, כדי שהגז/ברקס/הגה יתנהגו זהה לחלוטין בשני הכלים.

import { useTelemetryStore } from './store';

export const WHEEL_AXIS   = 0;   // ציר סיבוב ההגה
export const GAS_AXIS     = 1;   // דוושת גז (קדימה)
export const REVERSE_AXIS = 2;   // דוושת רוורס (אחורה)
export const GAS_BTN      = 1;   // כפתור B בהגה — גז קדימה
export const REVERSE_BTN  = 0;   // כפתור A בהגה — רוורס

export const GAS_PRESSED     = -1.0;   // ערך דוושת הגז בלחיצה מלאה
export const REVERSE_PRESSED =  0.60;  // ערך דוושת הרוורס בלחיצה מלאה

// ברירות המחדל של כיול ההגה. אלו הערכים שהיו קבועים כאן עד שתפריט ההגדרות
// (SettingsMenu, פרופיל "Wheel") קיבל שליטה עליהם — הם נשמרים כאן כמקור-אמת
// יחיד גם לכפתור ה-Reset בתפריט וגם כגיבוי אם ה-store לא זמין.
export const WHEEL_DEFAULTS = {
  deadzone: 0.05,       // אזור מת קטן סביב המרכז
  range: 0.7,           // הטווח האמיתי של ההגה (±1 מלא)
  pedalSensitivity: 1.0,// הגבר על הדוושות
} as const;

// שמות לשעבר (תאימות לאחור) — לשימוש רק כברירת מחדל, לא לקריאה בזמן-ריצה.
export const WHEEL_RANGE    = WHEEL_DEFAULTS.range;
export const WHEEL_DEADZONE = WHEEL_DEFAULTS.deadzone;

export type WheelCal = {
  deadzone: number;
  range: number;
  pedalSensitivity: number;
};

// הכיול הפעיל נקרא מה-store בכל פריים, כדי שהזזת מחוון בתפריט ההגדרות
// תשפיע מיד — בלי לרנדר מחדש ובלי להעביר props דרך הקומפוננטות.
export function wheelCal(): WheelCal {
  const s = useTelemetryStore.getState();
  return {
    deadzone: s.wheelDeadzone,
    range: s.wheelRange,
    pedalSensitivity: s.pedalSensitivity,
  };
}

// זיהוי ההגה לפי ה-id של ההתקן (כדי לבודד אותו מהג'ויסטיקים ומשלט ה-PS)
export const isWheelPad = (p: Gamepad | null) =>
  !!p && /g920|logitech|racing wheel/i.test(p.id);

// ההגה: ±range -> ±1, עם deadzone סביב 0. אחרי אזור-המת מתחילים מ-0 ולא מקפיצה,
// בדיוק כמו shapeStick של הסטיקים, כך ששתי משפחות הפקדים מתנהגות באותה שפה.
export const normWheel = (raw: number, cal: WheelCal = wheelCal()) => {
  const a = Math.abs(raw);
  if (a < cal.deadzone) return 0;
  const span = Math.max(1e-6, cal.range - cal.deadzone);
  return Math.sign(raw) * Math.min(1, (a - cal.deadzone) / span);
};

// דוושה: מ-1 (נח) עד pressedVal (לחוץ מלא) -> 0..1
export const normPedal = (raw: number, pressedVal: number) =>
  Math.max(0, Math.min(1, (1 - raw) / (1 - pressedVal)));

// מפענח את האט (AXIS 9) לכיווני x/y.
export function decodeHatAxis(v: number | undefined): { x: number; y: number } {
  if (v === undefined || v > 1.05 || v < -1.05) return { x: 0, y: 0 };
  const step = 2 / 7;
  const idx = Math.round((v + 1) / step);
  if (idx < 0 || idx > 7) return { x: 0, y: 0 };
  // חשוב: מקבלים רק ערך שקרוב *באמת* לאחת מ-8 עמדות ה-POV. חלק מהמכשירים מדווחים
  // ערך-מנוחה חריג (למשל ~0.14) שמתעגל בטעות ל"מטה" וגורם לרחפן לנזול בגובה מיד
  // אחרי ההמראה. סף צמוד מסנן רעש/מנוחה כזה ומחזיר "אין קלט".
  const canonical = idx * step - 1;
  if (Math.abs(v - canonical) > 0.12) return { x: 0, y: 0 };
  const map: Record<number, { x: number; y: number }> = {
    0: { x: 0, y: -1 }, 1: { x: 1, y: -1 }, 2: { x: 1, y: 0 }, 3: { x: 1, y: 1 },
    4: { x: 0, y: 1 }, 5: { x: -1, y: 1 }, 6: { x: -1, y: 0 }, 7: { x: -1, y: -1 },
  };
  return map[idx] || { x: 0, y: 0 };
}

export type WheelDrive = {
  wheel: number;    // -1..1 — סיבוב ההגה אחרי deadzone וקנה-מידה
  gas: number;      // 0..1
  reverse: number;  // 0..1
  drive: number;    // -1..1 — גז פחות רוורס
  steer: number;    // -1..1 — ההגה כפול עוצמת הפנייה
  left: number;     // -1..1 — "זחל" שמאל אחרי נרמול
  right: number;    // -1..1 — "זחל" ימין אחרי נרמול
};

const ZERO: WheelDrive = { wheel: 0, gas: 0, reverse: 0, drive: 0, steer: 0, left: 0, right: 0 };

/**
 * קורא את ההגה והדוושות ומחזיר את אותו מיקס דיפרנציאלי שמניע את הרובוט.
 * ignoreButtons — כשתפריט הלייאאוט פתוח, B0/B1 משמשים לדפדוף ולכן אינם גז/רוורס.
 */
export function readWheelDrive(
  pad: Gamepad | null | undefined,
  opts: { ignoreButtons?: boolean; cal?: WheelCal } = {},
): WheelDrive {
  if (!pad) return ZERO;
  const ax = pad.axes, bt = pad.buttons;
  const cal = opts.cal ?? wheelCal();

  const wheel = normWheel(ax?.[WHEEL_AXIS] ?? 0, cal);

  // גז מהדוושה (0..1) או מכפתור B בהגה (בינארי מלא) — הגדול מביניהם
  const gasPedal = normPedal(ax?.[GAS_AXIS] ?? 1, GAS_PRESSED);
  const gasBtn   = (!opts.ignoreButtons && bt?.[GAS_BTN]?.pressed) ? 1 : 0;
  const gas      = Math.min(1, Math.max(gasPedal, gasBtn) * cal.pedalSensitivity);

  // רוורס מהדוושה (0..1) או מכפתור A בהגה (בינארי מלא) — הגדול מביניהם
  const revPedal = normPedal(ax?.[REVERSE_AXIS] ?? 1, REVERSE_PRESSED);
  const revBtn   = (!opts.ignoreButtons && bt?.[REVERSE_BTN]?.pressed) ? 1 : 0;
  const reverse  = Math.min(1, Math.max(revPedal, revBtn) * cal.pedalSensitivity);

  // גז ורוורס מתקזזים; ההגה יוצר הפרש בין הצדדים
  const drive = gas - reverse;              // -1..1
  const steer = wheel;

  const L = drive + steer;
  const R = drive - steer;
  const norm = Math.max(1, Math.abs(L), Math.abs(R));

  return { wheel, gas, reverse, drive, steer, left: L / norm, right: R / norm };
}
