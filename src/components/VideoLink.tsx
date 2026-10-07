// File: src/components/VideoLink.tsx
//
// שכבת "קו השידור" של חלונית חוזי אחת. היא יושבת מעל ה-canvas של three ומציגה
// את התמונה *כפי שהגיעה מהמצלמה* — בקצב הפריימים שנבחר, אחרי ההשהייה שנבחרה,
// ועם רעידת-ההשהייה שנבחרה. הסימולציה עצמה (פיזיקה, פקדים, טלמטריה) ממשיכה
// לרוץ בקצב מלא; רק התמונה מתעכבת, בדיוק כמו במצלמה אמיתית על קו אלחוטי.
//
// איך זה עובד:
//   1. דגימה — כל 1000/fps מ"ש מעתיקים את אזור החלונית מתוך ה-canvas של המנוע
//      אל פריים בחוצץ-טבעת, ומחשבים לו זמן-הגעה = עכשיו + השהייה ± רעידה/2.
//   2. הצגה — בכל פריים מציירים את הפריים האחרון שכבר "הגיע". בין הגעה להגעה
//      התמונה פשוט קופאת, וזה בדיוק מה שהעין רואה בקצב נמוך.
//
// שתי הפעולות רצות בתוך ברז (addFeedTap) שמופעל *בסוף לולאת הציור של three*,
// כי רק שם תוכן ה-canvas חוקי לדגימה. ראו ההסבר ב-src/videoLink.ts.
//
// כשהקו "מושלם" (קצב מלא, בלי השהייה ורעידה) הקומפוננטה לא מרנדרת כלום,
// לא נרשם שום ברז, ואין שום עלות — התמונה מגיעה ישירות מ-three כמו קודם.

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTelemetryStore } from '../store';
import {
  CamSource, VideoLinkParams, addFeedTap, linkIsDegraded, runFeedTaps,
} from '../videoLink';

// תקרה קשיחה למספר הפריימים בחוצץ — שומרת על הזיכרון גם בהשהייה וקצב מקסימליים.
const MAX_BUFFER = 64;

type Frame = { canvas: HTMLCanvasElement; arriveAt: number; seq: number };

export function VideoLink({ source }: { source: CamSource }) {
  const params = useTelemetryStore(s => s.videoLink[source]);
  const hostRef = useRef<HTMLCanvasElement>(null);
  // הפרמטרים נקראים מתוך הברז דרך ref, כדי שהזזת מחוון לא תרשום ברז מחדש
  // (ותאפס את החוצץ) — השינוי פשוט נכנס לתוקף בפריים הבא.
  const paramsRef = useRef<VideoLinkParams>(params);
  paramsRef.current = params;

  const active = linkIsDegraded(params);

  useEffect(() => {
    if (!active) return;
    const host = hostRef.current;
    if (!host) return;
    const hostCtx = host.getContext('2d');
    if (!hostCtx) return;

    const ring: Frame[] = [];
    let seq = 0;          // מונה פריימים — שומר על סדר הצגה מונוטוני
    let shownSeq = -1;    // הפריים שמוצג כרגע (לא חוזרים אחורה)
    let lastCapture = -Infinity;

    return addFeedTap((feed, now) => {
      const { fps, latency, jitter } = paramsRef.current;

      // --- התאמת גודל ה-canvas של החלונית ל-DPR של המנוע ---
      const hostRect = host.getBoundingClientRect();
      const feedRect = feed.getBoundingClientRect();
      if (hostRect.width < 1 || hostRect.height < 1 || feedRect.width < 1) return;
      const dpr = feed.width / feedRect.width;
      const w = Math.max(1, Math.round(hostRect.width * dpr));
      const h = Math.max(1, Math.round(hostRect.height * dpr));
      if (host.width !== w || host.height !== h) {
        host.width = w;
        host.height = h;
        ring.length = 0;   // הפריימים הישנים בגודל אחר — מתחילים חוצץ חדש
        shownSeq = -1;
      }

      // --- 1. דגימה בקצב המצלמה ---
      if (now - lastCapture >= 1000 / fps - 0.5) {
        lastCapture = now;
        // חלון המקור בתוך ה-canvas של המנוע, בפיקסלים פיזיים
        const sx = (hostRect.left - feedRect.left) * dpr;
        const sy = (hostRect.top - feedRect.top) * dpr;
        const frame = ring.length >= MAX_BUFFER
          ? ring.shift()!                       // מיחזור הפריים הישן ביותר
          : { canvas: document.createElement('canvas'), arriveAt: 0, seq: 0 };
        if (frame.canvas.width !== w || frame.canvas.height !== h) {
          frame.canvas.width = w;
          frame.canvas.height = h;
        }
        const fctx = frame.canvas.getContext('2d');
        if (fctx) {
          try {
            fctx.drawImage(feed, sx, sy, w, h, 0, 0, w, h);
            // רעידה: פיזור אחיד סביב ההשהייה, אף פעם לא שלילי
            const wobble = jitter > 0 ? (Math.random() - 0.5) * jitter : 0;
            frame.arriveAt = now + Math.max(0, latency + wobble);
            frame.seq = seq++;
            ring.push(frame);
          } catch {
            // דגימה נכשלה — פשוט מדלגים על הפריים
          }
        }
      }

      // --- 2. הצגת הפריים האחרון שכבר הגיע ---
      // רעידה יכולה לסדר פריימים מחדש; המונה המונוטוני מוודא שלא נציג פריים
      // ישן אחרי שכבר הצגנו חדש ממנו (קו אמיתי זורק פריים שאיחר).
      let best: Frame | null = null;
      for (const f of ring) {
        if (f.arriveAt <= now && f.seq > shownSeq && (!best || f.seq > best.seq)) best = f;
      }
      if (best) {
        shownSeq = best.seq;
        hostCtx.drawImage(best.canvas, 0, 0);
      } else if (shownSeq < 0 && ring.length) {
        // עדיין לא "הגיע" כלום (ההשהייה הראשונה) — מציגים את הפריים הישן ביותר
        hostCtx.drawImage(ring[0].canvas, 0, 0);
      }

      // ניקוי פריימים שכבר הוצגו ואין בהם צורך
      while (ring.length > 2 && ring[0].seq < shownSeq && ring[0].arriveAt <= now) ring.shift();
    });
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={hostRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

/**
 * מריץ את כל הברזים בסוף לולאת הציור. חייב לשבת *בתוך* ה-<Canvas>.
 * עדיפות גבוהה (1000) מבטיחה שנרוץ אחרי ש-drei/View צייר את כל החלוניות
 * (הן משתמשות בעדיפויות 1,2,3...), בעודנו באותו פריים.
 */
export function VideoFeedTap() {
  useFrame(({ gl }) => {
    runFeedTaps(gl.domElement as HTMLCanvasElement, performance.now());
  }, 1000);
  return null;
}
