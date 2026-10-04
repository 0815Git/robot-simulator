// File: src/wheelInput.ts
// ===== מיפוי הגה+דוושות Logitech G920 (steerMode 'C') =====
// מקור-אמת יחיד לכיול ההגה: הרובוט (Robot.tsx) והרחפן (Drone.tsx) קוראים את אותם
// ערכים דרך readWheelDrive, כדי שהגז/ברקס/הגה יתנהגו זהה לחלוטין בשני הכלים.

export const WHEEL_AXIS   = 0;   // ציר סיבוב ההגה
export const GAS_AXIS     = 1;   // דוושת גז (קדימה)
export const REVERSE_AXIS = 2;   // דוושת רוורס (אחורה)
export const GAS_BTN      = 1;   // כפתור B בהגה — גז קדימה
export const REVERSE_BTN  = 0;   // כפתור A בהגה — רוורס

export const WHEEL_RANGE     = 0.7;    // הטווח האמיתי של ההגה (±1 מלא)
export const WHEEL_DEADZONE  = 0.05;   // אזור מת קטן סביב המרכז
export const GAS_PRESSED     = -1.0;   // ערך דוושת הגז בלחיצה מלאה
export const REVERSE_PRESSED =  0.60;  // ערך דוושת הרוורס בלחיצה מלאה
export const STEER_STRENGTH  = 1.0;    // עוצמת הפנייה של ההגה
export const WHEEL_INVERT    = false;  // אם ההגה מפנה הפוך — true

// זיהוי ההגה לפי ה-id של ההתקן (כדי לבודד אותו מהג'ויסטיקים ומשלט ה-PS)
export const isWheelPad = (p: Gamepad | null) =>
  !!p && /g920|logitech|racing wheel/i.test(p.id);

// ההגה: ±WHEEL_RANGE -> ±1, עם deadzone סביב 0
export const normWheel = (raw: number) => {
  if (Math.abs(raw) < WHEEL_DEADZONE) return 0;
  return Math.max(-1, Math.min(1, raw / WHEEL_RANGE));
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
  opts: { ignoreButtons?: boolean } = {},
): WheelDrive {
  if (!pad) return ZERO;
  const ax = pad.axes, bt = pad.buttons;

  let wheel = normWheel(ax?.[WHEEL_AXIS] ?? 0);
  if (WHEEL_INVERT) wheel = -wheel;

  // גז מהדוושה (0..1) או מכפתור B בהגה (בינארי מלא) — הגדול מביניהם
  const gasPedal = normPedal(ax?.[GAS_AXIS] ?? 1, GAS_PRESSED);
  const gasBtn   = (!opts.ignoreButtons && bt?.[GAS_BTN]?.pressed) ? 1 : 0;
  const gas      = Math.max(gasPedal, gasBtn);

  // רוורס מהדוושה (0..1) או מכפתור A בהגה (בינארי מלא) — הגדול מביניהם
  const revPedal = normPedal(ax?.[REVERSE_AXIS] ?? 1, REVERSE_PRESSED);
  const revBtn   = (!opts.ignoreButtons && bt?.[REVERSE_BTN]?.pressed) ? 1 : 0;
  const reverse  = Math.max(revPedal, revBtn);

  // גז ורוורס מתקזזים; ההגה יוצר הפרש בין הצדדים
  const drive = gas - reverse;              // -1..1
  const steer = wheel * STEER_STRENGTH;

  const L = drive + steer;
  const R = drive - steer;
  const norm = Math.max(1, Math.abs(L), Math.abs(R));

  return { wheel, gas, reverse, drive, steer, left: L / norm, right: R / norm };
}
