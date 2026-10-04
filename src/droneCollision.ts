// File: src/droneCollision.ts
// ===== התנגשות הרחפן בעולם =====
// עד כה הרחפן היה "כל-יכול": המיקום שלו נכתב ישירות ל-store בלי שום בדיקה,
// ולכן הוא יכול היה לחדור לגבעות ולמבנים ולטוס בתוכם. כאן עוטפים כל תזוזה
// שלו בשאילתת Rapier: אם יש מכשול בדרך — הרחפן נעצר לפניו ונרתע מעט אחורה.
//
// ===== חסימה קשיחה, לא החלקה =====
// מנוע פיזיקה רגיל "מחליק" גוף לאורך המשטח: מבטל רק את רכיב התנועה שנכנס לקיר
// ומשאיר את הרכיב המשיק. בשביל רחפן זה נראה רע — לחיצה קדימה מול מדרון מטפסת
// עליו, ומול מבנה מחליקה לאורך הקיר. לכן כאן התזוזה *כולה* נדחית ברגע שהמסלול
// חסום: הרחפן נעצר, נרתע מעט ברגע הפגיעה, ונשאר עומד עד שהטייס יפנה לכיוון פנוי.
//
// ===== למה סריקת ספירה ולא קרן =====
// קרן בודדת מודדת מרחק רק בכיוון הנסיעה, ולכן ליד מדרון היא "עוצרת" את הרחפן
// במקום שבו גופו עדיין חותך את פני השטח — ואז לחיצה על "למעלה" נראתה כאילו
// המדרון דוחף אותו מטה. castShape סורק את *כל* נפח הרחפן לאורך התזוזה ומחזיר
// את רגע המגע האמיתי, ולכן נקודת העצירה נכונה בכל כיוון.
//
// רק גופים *סטטיים* נחשבים מכשול (גבעות, מבנים, קרקע). הרובוט הוא גוף דינמי
// ולכן מוחרג בכוונה — אחרת ההמראה מגבו והנחיתה עליו היו נחסמות.
import { physicsEnv } from './physicsEnv';

export type V3 = [number, number, number];

export const DRONE_RADIUS = 0.5;   // רדיוס גוף הרחפן לצורך התנגשות (מטרים)
const SKIN = 0.03;                 // מרווח ביטחון קטן מפני המכשול
const BOUNCE_BACK = 0.22;          // תקרת הנסיגה ברגע הפגיעה (מטרים)
// הנסיגה מוגבלת גם לחצי מצעד הפריים. אחרת היא פותחת מרווח גדול מצעד אחד,
// הסריקה בפריים הבא כבר לא פוגעת, דגל הפגיעה מתאפס — והרחפן "פועם" קדימה
// ואחורה מול המכשול במקום לעמוד.
const BOUNCE_STEP_FRACTION = 0.5;

const NO_ROT = { x: 0, y: 0, z: 0, w: 1 };

// הרחפן יחיד בסצנה, ולכן די בדגל אחד: האם בפריים הקודם כבר היינו צמודים למכשול.
// הוא מבדיל בין *רגע* הפגיעה (שבו מגיעה הנסיגה) לבין החזקת הפקד מול המכשול
// (שבה הרחפן פשוט עומד). בלעדיו הנסיגה הייתה חוזרת כל פריים והרחפן היה רוטט.
let wasBlocked = false;

let ballShape: any = null;
const getBall = (rapier: any) => {
  if (!ballShape) ballShape = new rapier.Ball(DRONE_RADIUS);
  return ballShape;
};

export type DroneMove = {
  pos: V3;          // המיקום המותר בפועל
  blocked: boolean; // האם הייתה התנגשות (שימושי לאיפוס מהירות/קפיץ)
};

/**
 * מחזיר את המיקום המותר לרחפן בתזוזה מ-from ל-to.
 * דרך פנויה → to כמו שהוא. מכשול בדרך → עצירה לפניו, עם נסיגה ברגע הפגיעה.
 * כשהפיזיקה עוד לא נטענה, התזוזה עוברת כמו שהיא (אין את מי לשאול).
 */
export function resolveDroneMove(from: V3, to: V3): DroneMove {
  const { rapier, world } = physicsEnv;
  if (!rapier || !world) return { pos: to, blocked: false };

  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  const dist = Math.hypot(dx, dy, dz);
  if (dist <= 1e-6) return { pos: to, blocked: false };

  const ux = dx / dist, uy = dy / dist, uz = dz / dist;
  const flags =
    rapier.QueryFilterFlags.EXCLUDE_SENSORS | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC;

  // סורקים את גוף הרחפן לאורך התזוזה. וקטור המהירות הוא התזוזה עצמה ו-maxToi=1,
  // ולכן ה-time_of_impact שחוזר הוא החלק מהתזוזה שהושלם עד המגע (0..1).
  const hit = world.castShape(
    { x: from[0], y: from[1], z: from[2] },
    NO_ROT,
    { x: dx, y: dy, z: dz },
    getBall(rapier),
    0,      // targetDistance
    1,      // maxToi — יחידות של וקטור התזוזה
    true,   // stopAtPenetration — אם כבר חופפים, מחזיר מגע מיידי במקום להתעלם
    flags,
  );

  if (!hit) {
    wasBlocked = false;
    return { pos: to, blocked: false };
  }

  const travelled = Math.max(0, hit.time_of_impact * dist - SKIN);

  // נסיגה רק ב*רגע* הפגיעה. כל עוד ממשיכים ללחוץ לכיוון המכשול הרחפן עומד
  // (allowed = 0) — בלי זחילה פנימה ובלי רטט של נסיגה חוזרת.
  const recoil = Math.min(BOUNCE_BACK, dist * BOUNCE_STEP_FRACTION);
  const allowed = wasBlocked ? 0 : travelled - recoil;
  wasBlocked = true;

  return {
    pos: [from[0] + ux * allowed, from[1] + uy * allowed, from[2] + uz * allowed],
    blocked: true,
  };
}
