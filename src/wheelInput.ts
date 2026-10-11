// File: src/wheelInput.ts
// ===== שכבת-תאימות להגות: Logitech G920 ⇄ Turtle Beach VelocityOne Flight (steerMode 'C') =====
// מקור-אמת יחיד לכיול ולמיפוי ההגות: הרובוט (Robot.tsx), הרחפן (Drone.tsx) ושכבת
// הכפתורים הגלובלית (App.tsx) קוראים את אותם ערכים דרך הפונקציות שכאן, כדי שהגז/
// ברקס/הגה יתנהגו זהה לחלוטין בשני הכלים — ובשני סוגי ההגות.
//
// אותו עקרון של controllerConfig.ts (A10C ⇄ Solaris): מזהים את משפחת ההתקן לפי ה-id,
// ומתרגמים לפעולות *לוגיות*. כך אותו קוד מנהג את שתי ההגות בלי הסתעפויות בקומפוננטות.
//
// ההבדל המרכזי בין ההגות: ב-G920 הגז והרוורס הם *שתי דוושות* (שני צירים חד-כיווניים),
// וב-VelocityOne הנהיגה היא *ציר אחד דו-כיווני* — דחיפה ומשיכה של ההגה.

import { useTelemetryStore } from './store';

// ---- זיהוי משפחת ההגה ----
// G920: ה-id מכיל g920 / logitech / racing wheel.
export const isG920 = (p: Gamepad | null): boolean =>
  !!p && /g920|logitech|racing wheel/i.test(p.id);

// VelocityOne Flight: אומת ב-gamepad tester — Vendor 10f5 / Product 7004.
// מזהים גם לפי השם וגם לפי צמד ה-vendor/product, כי דפדפנים שונים מרכיבים את ה-id
// אחרת (לעתים רק "10f5-7004-..." בלי שם קריא).
export const isVelocityOne = (p: Gamepad | null): boolean =>
  !!p && (/velocity\s*one/i.test(p.id) || (/10f5/i.test(p.id) && /7004/i.test(p.id)));

// זיהוי ההגה (כל סוג) — כדי לבודד אותה מהג'ויסטיקים ומשלט ה-PS
export const isWheelPad = (p: Gamepad | null) => isG920(p) || isVelocityOne(p);

// ---- כיוון הצירים של VelocityOne ----
// הנחה: דחיפת ההגה קדימה נותנת ערך *שלילי* (כמו ציר Y של סטיק). אם יתברר הפוך
// במכשיר — להפוך את הסימן כאן בלבד: גם נהיגת הרובוט וגם הטיית אף הרחפן מתהפכות
// איתו יחד, כי שתיהן נגזרות מאותו ציר (AXIS 1) ומאותו קבוע.
export const VELOCITY_ONE_DRIVE_SIGN = -1;

// גז הרחפן (AXIS 2) — פקד נפרד מההגה, ולכן סימן נפרד שאפשר להפוך לבד.
// הנחה: דחיפת המצעד קדימה = ערך שלילי = טיסה קדימה לכיוון האף.
export const VELOCITY_ONE_THRUST_SIGN = -1;

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

// ---- מפת פקדים לוגית לכל משפחת הגה ----
// null = הפעולה אינה קיימת בהגה הזו. כל צרכן מתעלם ממנה בשקט.
export interface WheelMap {
  // --- צירים ---
  steerAxis: number;            // סיבוב ההגה שמאלה/ימינה
  driveAxis: number | null;     // ציר נהיגה דו-כיווני (דחיפה/משיכה) — VelocityOne
  gasAxis: number | null;       // דוושת גז — G920
  reverseAxis: number | null;   // דוושת רוורס — G920
  hatAxis: number;              // ה-HAT: גובה הרחפן (y) + הליכה סרטנית (x)
  launchAxis: number | null;    // ציר המראת הרחפן — VelocityOne
  droneLinkAxis: number | null; // ציר צימוד רובוט⇄רחפן — G920
  noseAxis: number | null;      // ציר הטיית אף הרחפן — VelocityOne (דחיפה=מטה, משיכה=מעלה)
  thrustAxis: number | null;    // ציר הסעת הרחפן קדימה/אחורה — VelocityOne

  // --- כפתורים ---
  gasBtn: number | null;        // גז בינארי (חלופה לדוושה)
  reverseBtn: number | null;    // רוורס בינארי
  layoutMenu: number;           // פתיחת תפריט הפריסה / בחירה+סגירה
  menuUp: number;               // ניווט בתפריט הפריסה
  menuDown: number;
  menuLeft: number;
  menuRight: number;
  paneSwitch: number;           // מעבר שליטה בין החלוניות
  droneLinkBtn: number | null;  // כפתור צימוד רובוט⇄רחפן — VelocityOne
  noseUp: number | null;        // הרמת אף הרחפן
  noseDown: number | null;      // הורדת אף הרחפן
}

export const G920_WHEEL: WheelMap = {
  steerAxis: WHEEL_AXIS,
  driveAxis: null,              // ב-G920 הנהיגה מגיעה משתי הדוושות
  gasAxis: GAS_AXIS,
  reverseAxis: REVERSE_AXIS,
  hatAxis: 9,
  launchAxis: null,             // ההמראה היא ה-HAT מעלה
  droneLinkAxis: 5,
  noseAxis: null,               // האף ב-G920 הוא כפתורים (B4/B5), לא ציר
  thrustAxis: null,             // ההסעה ב-G920 היא הדוושות, כמו ברובוט
  gasBtn: GAS_BTN,
  reverseBtn: REVERSE_BTN,
  layoutMenu: 6,
  menuUp: 3,
  menuDown: 0,
  menuLeft: 2,
  menuRight: 1,
  paneSwitch: 7,
  droneLinkBtn: null,           // ב-G920 הצימוד הוא ציר (AXIS 5)
  noseUp: 4,
  noseDown: 5,
};

// הערה: האף ב-VelocityOne הוא *ציר* (AXIS 1) ולא כפתורים, ולכן noseUp/noseDown
// נשארים null וההטיה מגיעה דרך noseAxis ב-readWheelFlight.
export const VELOCITY_ONE_WHEEL: WheelMap = {
  steerAxis: 0,                 // ימינה/שמאלה של ההגה
  driveAxis: 1,                 // דחיפה/משיכה של ההגה = קדימה/אחורה
  gasAxis: null,
  reverseAxis: null,
  hatAxis: 9,                   // גובה הרחפן + הליכה סרטנית — בדיוק כמו ב-G920
  launchAxis: 2,                // העלאת הרחפן לאוויר (אותו מצעד שהוא גם גז הרחפן)
  droneLinkAxis: null,
  noseAxis: 1,                  // *אותו* ציר של נהיגת הרובוט — ראה readWheelFlight
  thrustAxis: 2,                // גז הרחפן — *אותו* מצעד של ההמראה, ראה readWheelFlight
  gasBtn: null,
  reverseBtn: null,
  layoutMenu: 9,
  menuUp: 16,
  menuDown: 18,
  menuLeft: 19,
  menuRight: 17,
  paneSwitch: 8,
  droneLinkBtn: 2,              // צימוד רובוט⇄רחפן
  noseUp: null,
  noseDown: null,
};

export const wheelMapOf = (p: Gamepad | null): WheelMap =>
  isVelocityOne(p) ? VELOCITY_ONE_WHEEL : G920_WHEEL;

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

// ציר דו-כיווני שנח במרכז (ציר הנהיגה של VelocityOne): אזור-מת סביב 0 והתחלה רכה
// מ-0, אבל *בלי* קיצור הטווח של ההגה — הטווח הפיזי המלא הוא ±1, כי זה פקד אחר.
export const normBipolar = (raw: number, deadzone: number) => {
  const a = Math.abs(raw);
  if (a < deadzone) return 0;
  const span = Math.max(1e-6, 1 - deadzone);
  return Math.sign(raw) * Math.min(1, (a - deadzone) / span);
};

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

/** ה-HAT של ההגה (גובה הרחפן ב-y, הליכה סרטנית ב-x) — לפי הציר של אותה משפחה. */
export const wheelHat = (p: Gamepad | null): { x: number; y: number } =>
  p ? decodeHatAxis(p.axes?.[wheelMapOf(p).hatAxis]) : { x: 0, y: 0 };

/** כפתור של ההגה לפי תפקיד לוגי. תפקיד שאינו קיים בהגה הזו מחזיר false. */
export const wheelBtn = (p: Gamepad | null, role: keyof WheelMap): boolean => {
  if (!p) return false;
  const idx = wheelMapOf(p)[role];
  return typeof idx === 'number' && (p.buttons?.[idx]?.pressed || false);
};

// ---- צירים רציפים עם ערך-מנוחה לא ידוע ----
// צירים כמו AXIS 5 (צימוד ב-G920) ו-AXIS 2 (המצעד ב-VelocityOne) מדווחים ערך רציף,
// וערך-המנוחה שלהם משתנה בין מכשירים ובין דפדפנים: 0 לציר שנח במרכז, ±1 למצעד
// שנח בקצה, או משהו באמצע. לכן מודדים את ערך-המנוחה בקריאה הראשונה וכל הקריאות
// הן *יחסית אליו*. הקאש ממופתח לפי התקן+ציר, כך ששני צרכנים של אותו ציר (ההמראה
// והגז — שניהם AXIS 2) חולקים כיול אחד, ושתי הגות מחוברות יחד אינן מתנגשות.
const AXIS_PRESS_THRESHOLD = 0.5;
const axisRest: Record<string, number> = {};

// מחזיר את ערך-המנוחה המכויל, או null בפריים שבו הכיול עצמו נעשה.
const restOf = (p: Gamepad, axis: number, v: number): number | null => {
  const key = `${p.id}:${axis}`;
  if (axisRest[key] === undefined) { axisRest[key] = v; return null; }
  return axisRest[key];
};

/**
 * האם הציר "לחוץ" — סטייה משמעותית מערך-המנוחה.
 * לפי *גודל* הסטייה בלבד, ולכן אינו תלוי בכיוון הציר בכלל.
 */
export function axisDeflected(p: Gamepad | null, axis: number | null): boolean {
  if (!p || axis === null) return false;
  const v = p.axes?.[axis];
  if (typeof v !== 'number') return false;
  const rest = restOf(p, axis, v);
  return rest !== null && Math.abs(v - rest) > AXIS_PRESS_THRESHOLD;
}

/**
 * ערך הציר יחסית לערך-המנוחה, מנורמל ל-−1..1 עם אזור-מת.
 * הנרמול נעשה *בנפרד לכל כיוון*, לפי כמה טווח פיזי נותר מערך-המנוחה לאותו צד.
 * כך ציר שנח במרכז נותן טווח מלא לשני הכיוונים, ומצעד שנח בקצה נותן טווח מלא
 * לכיוון האחד שבו הוא יכול לזוז — בלי שנדע מראש איזה מהשניים המכשיר הוא.
 */
export function axisFromRest(
  p: Gamepad | null, axis: number | null, deadzone: number,
): number {
  if (!p || axis === null) return 0;
  const v = p.axes?.[axis];
  if (typeof v !== 'number') return 0;
  const rest = restOf(p, axis, v);
  if (rest === null) return 0;

  const d = v - rest;
  const a = Math.abs(d);
  if (a < deadzone) return 0;
  // הטווח שנותר מערך-המנוחה לכיוון שבו הציר זז כרגע
  const travel = d > 0 ? 1 - rest : rest + 1;
  const span = Math.max(1e-6, travel - deadzone);
  return Math.sign(d) * Math.min(1, (a - deadzone) / span);
}

// כמה מהמהלך של המצעד צריך לדחוף כדי להמריא (על הסקאלה המנורמלת, 0..1).
export const LAUNCH_THROTTLE_THRESHOLD = 0.5;

/**
 * האם פקד ההמראה של ההגה פעיל (VelocityOne: המצעד קדימה · G920: ה-HAT מעלה).
 *
 * חשוב: במצעד נבדקת *דחיפה קדימה בלבד*, ולא גודל הסטייה מערך-המנוחה. משיכה
 * אחורה היא גז אחורי של הרחפן, והיא לא אמורה להרים אותו מהרובוט. הכיוון נגזר
 * מאותו VELOCITY_ONE_THRUST_SIGN של הגז, ולכן אם הסימן יתברר הפוך — ההמראה והגז
 * מתהפכים יחד ונשארים עקביים.
 */
export const wheelLaunchActive = (
  p: Gamepad | null, cal: WheelCal = wheelCal(),
): boolean => {
  if (!p) return false;
  const m = wheelMapOf(p);
  if (m.launchAxis !== null) {
    const fwd = axisFromRest(p, m.launchAxis, cal.deadzone) * VELOCITY_ONE_THRUST_SIGN;
    return fwd > LAUNCH_THROTTLE_THRESHOLD;
  }
  return wheelHat(p).y < 0;
};

/**
 * האם פקד ההמראה הוא *אותו* פקד ששולט בגובה אחרי ההמראה (ה-HAT).
 * ב-G920 כן — ולכן ההמראה שם חייבת להיפסק ברגע שהרחפן באוויר, אחרת אותה דחיפה
 * של ה-HAT הייתה נספרת פעמיים באותו פריים (גם המראה ב-Robot.tsx וגם טיפוס ב-Drone.tsx).
 * ב-VelocityOne ההמראה היא ציר נפרד (AXIS 2), ולכן אין התנגשות והיא מתנהגת כמו
 * בשאר אופני הניהוג: מעלה את הרחפן כל עוד מחזיקים, עד תקרת ההמראה.
 */
export const wheelLaunchSharesHat = (p: Gamepad | null): boolean =>
  wheelMapOf(p).launchAxis === null;

/**
 * כיוון הטיית אף הרחפן מכפתורים (+1 מעלה / −1 מטה / 0). ב-G920 בלבד.
 * חיבורי ולא "הראשון שנמצא", כדי לשמור בדיוק על ההתנהגות שהייתה: שני הכפתורים
 * לחוצים יחד מתקזזים ל-0, כמו שני ה-if הנפרדים שהיו ב-Drone.tsx.
 */
export const wheelNoseDir = (p: Gamepad | null): number =>
  (wheelBtn(p, 'noseUp') ? 1 : 0) + (wheelBtn(p, 'noseDown') ? -1 : 0);

export type WheelFlight = {
  fwd: number;      // -1..1 — הסעה לכיוון האף
  turn: number;     // סיבוב גוף הרחפן (אותו סימן וקנה-מידה בשתי ההגות)
  noseRate: number; // -1..1 — קצב הטיית האף (חיובי = הרמה)
};

const ZERO_FLIGHT: WheelFlight = { fwd: 0, turn: 0, noseRate: 0 };

/**
 * פקדי *הטיסה* של הרחפן מההגה — הסעה, סיבוב והטיית אף.
 * זה הנתיב שבו שתי ההגות נבדלות באמת, ולכן הוא מרוכז כאן ולא בקומפוננטה:
 *
 *   G920        — הדוושות מסיעות (אותו מיקס דיפרנציאלי של הרובוט), ההגה מסובבת,
 *                 והאף הוא כפתורים (B4/B5).
 *   VelocityOne — ההגה מסובבת (AXIS 0), AXIS 2 הוא הגז, ו-AXIS 1 הוא *האף*:
 *                 דחיפה מורידה את האף, משיכה מרימה אותו. אותו AXIS 1 מנהג את
 *                 הרובוט — אבל נתיב הטיסה הזה רץ רק כששולטים ברחפן, ולכן אין
 *                 התנגשות: כל פקד עושה דבר אחד בכל רגע נתון.
 *
 * הערכים מוחזרים מנורמלים (-1..1) והקומפוננטה מכפילה אותם בקצבים שלה
 * (NOSE_RATE, DIFF_YAW_RATE, FLY_SPEED) — זהים לשאר הכלים.
 */
export function readWheelFlight(
  pad: Gamepad | null | undefined,
  cal: WheelCal = wheelCal(),
): WheelFlight {
  if (!pad) return ZERO_FLIGHT;
  const m = wheelMapOf(pad);
  const ax = pad.axes;

  if (m.thrustAxis === null) {
    // G920: ההסעה והסיבוב נגזרים מאותו מיקס דיפרנציאלי שמניע את הזחלים.
    const w = readWheelDrive(pad, { cal });
    return {
      fwd: (w.left + w.right) / 2,
      turn: w.right - w.left,
      noseRate: wheelNoseDir(pad),
    };
  }

  // VelocityOne: שלושה פקדים נפרדים.
  // הסיבוב נלקח מההגה בלבד, בקנה-המידה של ה-G920 (שם turn = right − left = −2·steer),
  // כדי שמהירות הסיבוב תהיה זהה בשתי ההגות.
  const steer = normWheel(ax?.[m.steerAxis] ?? 0, cal);

  // הגז נמדד *יחסית לערך-המנוחה* של הציר ולא כציר שנח במרכז, כי AXIS 2 הוא מצעד
  // ואיננו יודעים אם הוא נח במרכז או בקצה. axisFromRest מטפל בשני המקרים: מצעד
  // שנח בקצה ייתן גז קדימה בלבד, וציר שנח במרכז ייתן גם אחורה.
  const thrustRaw = axisFromRest(pad, m.thrustAxis, cal.deadzone) * VELOCITY_ONE_THRUST_SIGN;
  const fwd = Math.max(-1, Math.min(1, thrustRaw * cal.pedalSensitivity));

  // האף הוא ההיפוך של כיוון הנהיגה: דחיפה (drive חיובי) → האף יורד.
  // קשירה לאותו קבוע סימן מבטיחה שאם כיוון הציר יתברר הפוך, שניהם יתהפכו יחד.
  const noseRate = m.noseAxis === null ? 0
    : -(normBipolar(ax?.[m.noseAxis] ?? 0, cal.deadzone) * VELOCITY_ONE_DRIVE_SIGN);

  return { fwd, turn: -2 * steer, noseRate };
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
 * קורא את ההגה ואת פקדי הנהיגה שלה ומחזיר את אותו מיקס דיפרנציאלי שמניע את הרובוט.
 * ignoreButtons — כשתפריט הלייאאוט פתוח, B0/B1 של ה-G920 משמשים לדפדוף ולכן אינם
 * גז/רוורס. ב-VelocityOne הניווט בתפריט הוא בכפתורים נפרדים (B16-B19), ולכן אין שם
 * התנגשות כזו בכלל — אבל הדגל נשאר תקף לשתי ההגות ואינו מזיק.
 */
export function readWheelDrive(
  pad: Gamepad | null | undefined,
  opts: { ignoreButtons?: boolean; cal?: WheelCal } = {},
): WheelDrive {
  if (!pad) return ZERO;
  const ax = pad.axes, bt = pad.buttons;
  const cal = opts.cal ?? wheelCal();
  const m = wheelMapOf(pad);

  const wheel = normWheel(ax?.[m.steerAxis] ?? 0, cal);

  let gas: number, reverse: number;

  if (m.driveAxis !== null) {
    // ===== ציר נהיגה אחד דו-כיווני (VelocityOne): דחיפה = קדימה, משיכה = אחורה =====
    // מחוון "Pedal Sensitivity" ממשיך להיות ההגבר על הנהיגה, בדיוק כמו בדוושות,
    // כך שאותו פרופיל בתפריט ההגדרות משרת את שתי ההגות.
    const raw = normBipolar(ax?.[m.driveAxis] ?? 0, cal.deadzone) * VELOCITY_ONE_DRIVE_SIGN;
    const d = Math.max(-1, Math.min(1, raw * cal.pedalSensitivity));
    gas = Math.max(0, d);
    reverse = Math.max(0, -d);
  } else {
    // ===== שתי דוושות (G920) =====
    // גז מהדוושה (0..1) או מכפתור B בהגה (בינארי מלא) — הגדול מביניהם
    const gasPedal = normPedal(ax?.[m.gasAxis ?? GAS_AXIS] ?? 1, GAS_PRESSED);
    const gasBtn   = (!opts.ignoreButtons && m.gasBtn !== null && bt?.[m.gasBtn]?.pressed) ? 1 : 0;
    gas = Math.min(1, Math.max(gasPedal, gasBtn) * cal.pedalSensitivity);

    // רוורס מהדוושה (0..1) או מכפתור A בהגה (בינארי מלא) — הגדול מביניהם
    const revPedal = normPedal(ax?.[m.reverseAxis ?? REVERSE_AXIS] ?? 1, REVERSE_PRESSED);
    const revBtn   = (!opts.ignoreButtons && m.reverseBtn !== null && bt?.[m.reverseBtn]?.pressed) ? 1 : 0;
    reverse = Math.min(1, Math.max(revPedal, revBtn) * cal.pedalSensitivity);
  }

  // גז ורוורס מתקזזים; ההגה יוצר הפרש בין הצדדים
  const drive = gas - reverse;              // -1..1
  const steer = wheel;

  const L = drive + steer;
  const R = drive - steer;
  const norm = Math.max(1, Math.abs(L), Math.abs(R));

  return { wheel, gas, reverse, drive, steer, left: L / norm, right: R / norm };
}
