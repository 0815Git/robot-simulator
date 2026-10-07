// File: src/videoLink.ts
// ===== סימולציית קו-הווידאו של המצלמות =====
// מקור-אמת יחיד לפרמטרים של *ערוץ השידור* מכל מצלמה אל המפעיל — קצב פריימים,
// השהייה ורעידת-השהייה. אלו מאפיינים של המצלמה ושל הקישור האלחוטי, לא של
// הסימולטור: המנוע ממשיך לרוץ ולחשב פיזיקה בקצב מלא, ורק *התמונה* שהמפעיל
// רואה מושהית/מדודה. כך אפשר לחקות מצלמה איטית או קו תקשורת גרוע מבלי לפגוע
// בדיוק הפיזיקלי של הניסוי.
//
// הצרכן היחיד הוא VideoLink.tsx, שמצייר את התמונה המעוכבת מעל חלונית החוזי.

export type CamSource = 'robot' | 'drone';

export interface VideoLinkParams {
  fps: number;      // קצב פריימים של המצלמה (1..60). NATIVE_FPS = ללא הגבלה.
  latency: number;  // השהיית הקו במילישניות (0..1000)
  jitter: number;   // רעידת-השהייה במילישניות (0..500) — פיזור אחיד סביב ההשהייה
}

// קצב הפריימים ה"מלא" — בו המצלמה מצוירת כל פריים של הדפדפן, כמו עד היום.
export const NATIVE_FPS = 60;

export const VIDEO_LINK_DEFAULTS: VideoLinkParams = {
  fps: NATIVE_FPS,
  latency: 0,
  jitter: 0,
};

// גבולות המחוונים בתפריט ההגדרות — גם מקור-האמת לקיטום הערכים ב-store.
export const VIDEO_LINK_LIMITS = {
  fps:     { min: 1, max: NATIVE_FPS, step: 1 },
  latency: { min: 0, max: 1000, step: 10 },
  jitter:  { min: 0, max: 500,  step: 10 },
} as const;

/** האם הפרמטרים האלה משנים משהו בפועל (אם לא — אין טעם להפעיל את שרשרת ההשהייה). */
export const linkIsDegraded = (p: VideoLinkParams): boolean =>
  p.fps < NATIVE_FPS || p.latency > 0 || p.jitter > 0;

// ---- נקודת-דגימה בתוך לולאת הציור ----
// VideoLink יושב *מחוץ* ל-<Canvas>, אבל אסור לו לדגום את ה-canvas מתי שבא לו:
// בלי preserveDrawingBuffer תוכן ה-buffer מוגדר רק בתוך אותו tick שבו three צייר.
// ובכוונה אין preserveDrawingBuffer — הוא משנה את מסלול הציור של הדפדפן ופוגע
// בנראות (אובדן החלקת-קצוות), ואנחנו לא נוגעים בנראות של הסימולטור.
//
// לכן VideoFeedTap (קומפוננטה זעירה *בתוך* ה-Canvas) מריץ את כל ה"ברזים" הרשומים
// מיד אחרי שכל החלוניות צוירו, בעודנו באותו פריים — שם הדגימה חוקית.
export type FeedTap = (feed: HTMLCanvasElement, now: number) => void;

const taps = new Set<FeedTap>();

/** רישום ברז. מחזיר פונקציית ביטול. */
export function addFeedTap(tap: FeedTap): () => void {
  taps.add(tap);
  return () => { taps.delete(tap); };
}

/** מופעל ע"י VideoFeedTap בסוף כל פריים. */
export function runFeedTaps(feed: HTMLCanvasElement, now: number): void {
  for (const tap of taps) tap(feed, now);
}
