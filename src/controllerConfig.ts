// File: src/controllerConfig.ts
// ===== שכבת-תאימות לג'ויסטיקים: Thrustmaster A-10C ⇄ Thrustmaster Solaris (SOL-R) =====
// מקור-אמת יחיד למיפוי הפקדים לפי סוג ההתקן. הקומפוננטות (Robot/Drone/App) קוראות
// מכאן את הפעולות הלוגיות, כך שאותו קוד עובד לשני סוגי הג'ויסטיקים.
//
// עקרון מנחה (לפי בקשת המשתמש): הלוגיקה של *צירים 0 ו-1* (הסטיק הראשי של כל גריף)
// נשארת זהה לחלוטין בשני הסוגים — נהיגה במצב A, הצלב במצב B, והגימבל. לכן אין כאן
// שום תרגום לצירים 0/1; הם נקראים ישירות בקומפוננטות כמו קודם.
//
// ה-Solaris נחשף כ-*שני התקנים* נפרדים (כמו ה-A10C). אומת חי מול ההתקן:
//   • גריף שמאל  = Vendor 044f / Product 0422
//   • גריף ימין  = Vendor 044f / Product 042a
// שניהם מכילים "Solaris" ב-id, ולכן isSolaris() מזהה את שניהם.

import { decodeHatAxis } from './wheelInput';

// ---- זיהוי משפחת ההתקן ----
export const isSolaris = (p: Gamepad | null): boolean =>
  !!p && /solaris/i.test(p.id);

// זיהוי צד הגריף ב-Solaris לפי ה-product id (אומת חי: 0422=שמאל, 042a=ימין)
export const isSolarisLeftGrip  = (p: Gamepad | null): boolean => !!p && /0422/i.test(p.id);
export const isSolarisRightGrip = (p: Gamepad | null): boolean => !!p && /042a/i.test(p.id);

/**
 * מסדר את רשימת הסטיקים ל-[שמאל, ימין].
 * כש-Solaris מחובר — נועל את הצד לפי ה-product id (0422=שמאל, 042a=ימין),
 * ללא תלות בסדר החיבור של ה-USB (עמיד גם אם ה-OS יחליף את סדר האינדקסים).
 * בכל מקרה אחר (A10C וכו') — שומר על הסדר המקורי, כך שההתנהגות הקיימת לא משתנה.
 */
export function sortGrips(pads: (Gamepad | null)[]): (Gamepad | null)[] {
  const list = pads.filter(Boolean) as Gamepad[];
  if (list.some(isSolaris)) {
    const left = list.find(isSolarisLeftGrip) || null;
    const right = list.find(isSolarisRightGrip) || null;
    if (left || right) return [left, right];
  }
  return list;
}

// ---- מפת כפתורים לוגית לכל משפחה ----
// A10C שומר על האינדקסים המקוריים. Solaris לפי מה שאומת חי ב-solaris-mapper.
export interface ButtonMap {
  trigger: number;      // הדק ראשי (מעקב/טיסה)
  paneSwitch: number;   // מעבר שליטה בין חלוניות / החלפת תוכן
  pov: number;          // מחזור POV
  layoutMenu: number;   // פתיחת/בחירת תפריט פריסה
  droneLink: number;    // צימוד/ניתוק רובוט⇄רחפן
  invertY: number;      // היפוך ציר Y של הצלב
}

export const A10C_BTN: ButtonMap = {
  trigger: 0,
  paneSwitch: 1,
  pov: 3,
  layoutMenu: 4,
  droneLink: 2,
  invertY: 2,
};

// TODO(SOLARIS_INVERT_Y): כפתור היפוך-Y טרם נבחר ע"י המשתמש. 14 הוא ברירת-מחדל
// זמנית — יש להחליף לאינדקס שהמשתמש ילחץ ב-solaris-mapper. (B15 שמור לתפריט פריסה.)
export const SOLARIS_INVERT_Y_BTN = 14;

export const SOLARIS_BTN: ButtonMap = {
  trigger: 23,
  paneSwitch: 25,
  pov: 16,
  layoutMenu: 15,
  droneLink: 27,
  invertY: SOLARIS_INVERT_Y_BTN,
};

export const btnMapOf = (p: Gamepad | null): ButtonMap =>
  isSolaris(p) ? SOLARIS_BTN : A10C_BTN;

// ---- אזורי-מת לצירים המשניים של ה-Solaris ----
const STICK2_DZ = 0.15; // מיני-סטיק משני (צירים 3/4) ב-Solaris

// ---- פעולות לוגיות ----

/** האם ההדק הראשי לחוץ (מעקב ברובוט / טיסה ברחפן). */
export const triggerPressed = (p: Gamepad | null): boolean =>
  !!p && (p.buttons?.[btnMapOf(p).trigger]?.pressed || false);

/** שיגור הרחפן מהגריף השמאלי. A10C: B0 או B5. Solaris: ההדק (B23). */
export const launchPressed = (p: Gamepad | null): boolean => {
  if (!p) return false;
  if (isSolaris(p)) return p.buttons?.[23]?.pressed || false;
  return (p.buttons?.[0]?.pressed || p.buttons?.[5]?.pressed) || false;
};

/**
 * כיוון נהיגה "עדין" לכל גריף (−1/0/+1), לפני הכפלה במכפיל העדינות.
 * A10C: כפתורים B6(קדימה)/B8(אחורה).
 * Solaris: ה-HAT (ציר 9) — למעלה=קדימה(+1), למטה=אחורה(−1).
 * משמש גם לנהיגה העדינה ברובוט וגם לנהיגה הדיפרנציאלית ברחפן.
 */
export const fineDriveDir = (p: Gamepad | null): number => {
  if (!p) return 0;
  if (isSolaris(p)) {
    const h = decodeHatAxis(p.axes?.[9]);
    return -h.y; // hat up (y=-1) → קדימה (+1)
  }
  return p.buttons?.[6]?.pressed ? 1 : (p.buttons?.[8]?.pressed ? -1 : 0);
};

/**
 * כיוון נהיגה "גס" לכל גריף (−1/0/+1) — מצב B בלבד.
 * A10C: כפתורים B10(קדימה)/B12(אחורה).
 * Solaris: אין נהיגה גסה (לפי החלטת המשתמש — ה-HAT משמש לנהיגה עדינה בלבד).
 */
export const coarseDriveDir = (p: Gamepad | null): number => {
  if (!p || isSolaris(p)) return 0;
  return p.buttons?.[10]?.pressed ? 1 : (p.buttons?.[12]?.pressed ? -1 : 0);
};

/**
 * פאן מצלמה אופקי (מצב A). מחזיר קצב −1..1 (חיובי = פאן ימינה), או 0.
 * A10C: כפתורים B11(שמאלה)/B13(ימינה) → ±1 בינארי.
 * Solaris: ציר 3 (ציר X של המיני-סטיק הימני) עם אזור-מת.
 */
export const cameraPanX = (p: Gamepad | null): number => {
  if (!p) return 0;
  if (isSolaris(p)) {
    const v = p.axes?.[3] ?? 0;
    return Math.abs(v) > STICK2_DZ ? v : 0;
  }
  if (p.buttons?.[13]?.pressed) return 1;   // ימינה
  if (p.buttons?.[11]?.pressed) return -1;  // שמאלה
  return 0;
};

/**
 * גובה הרחפן מהמיני-סטיק (ריחוף ידני). מחזיר −1..1 (חיובי = עלייה) או 0.
 * A10C: אין כאן — הגובה מגיע מה-HAT (מטופל בקוד הקיים דרך combinedHat).
 * Solaris: ציר 4 (ציר Y של המיני-סטיק הימני). למעלה (שלילי) = עלייה.
 */
export const droneHeightAxis = (p: Gamepad | null): number => {
  if (!p || !isSolaris(p)) return 0;
  const v = p.axes?.[4] ?? 0;
  return Math.abs(v) > STICK2_DZ ? -v : 0; // דחיפה למעלה (v<0) → עלייה (+)
};

/**
 * הסטה הצידה (strafe) מהמיני-סטיק (ריחוף ידני). מחזיר −1..1 (חיובי = ימינה) או 0.
 * A10C: אין כאן — מגיע מה-HAT (combinedHat.x).
 * Solaris: ציר 3 (ציר X של המיני-סטיק הימני).
 */
export const droneStrafeAxis = (p: Gamepad | null): number => {
  if (!p || !isSolaris(p)) return 0;
  const v = p.axes?.[3] ?? 0;
  return Math.abs(v) > STICK2_DZ ? v : 0;
};

/**
 * ניווט בתפריט הפריסה מהמיני-סטיק (Solaris בלבד). מחזיר כיווני x/y בדידים
 * (−1/0/+1) עם אזור-מת, לטובת הזזת הסמן. ב-A10C הניווט נעשה בכפתורים B10-13.
 */
export const menuNavDir = (p: Gamepad | null): { x: number; y: number } => {
  if (!p || !isSolaris(p)) return { x: 0, y: 0 };
  const ax = p.axes?.[3] ?? 0, ay = p.axes?.[4] ?? 0;
  return {
    x: Math.abs(ax) > 0.5 ? Math.sign(ax) : 0,
    y: Math.abs(ay) > 0.5 ? Math.sign(ay) : 0,
  };
};
