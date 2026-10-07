// src/components/SettingsMenu.tsx
//
// כפתור הגדרות + תפריט. ממוקם בפינה השמאלית-התחתונה (במקום מד הזווית העגול
// שהוסר), ומדבר באותה שפה עיצובית כמו שאר כפתורי המערכת.
//
// התפריט מחולק לשני חלקים:
//   • Sensitivity — רגישות הבקרים (הפרופילים שהיו כאן מאז ומתמיד).
//   • General     — פרמטרים של *המצלמות*: קצב פריימים, השהייה ורעידת-השהייה.
//     אלה מאפיינים של המצלמה ושל קו השידור בלבד — הסימולטור עצמו (פיזיקה,
//     פקדים, טלמטריה) ממשיך לרוץ בקצב מלא. ראו src/videoLink.ts.
//
// בחלק הרגישות לכל סוג התקן פרופיל נפרד לחלוטין:
//   • PlayStation — שלט DualSense/DualShock (ברירת מחדל: אזור מת 10%, רגישות 70%)
//   • Joysticks   — ג'ויסטיקים גדולים (ברירת מחדל: אזור מת 7%, רגישות 100%)
//   • Wheel       — הגה+דוושות Logitech G920 (מצב ניהוג ג'). מלבד אזור-מת יש לו
//     טווח-סיבוב ורגישות דוושות — כיול שהיה עד כה קבוע בקוד.

import { useState } from 'react';
import { useTelemetryStore } from '../store';
import { WHEEL_DEFAULTS } from '../wheelInput';
import { CamSource, NATIVE_FPS, VIDEO_LINK_LIMITS } from '../videoLink';

// ברירות המחדל של כל פרופיל (לכפתור ה-Reset)
const DEFAULTS = {
  ps: { deadzone: 0.10, sensitivity: 0.70 },
  stick: { deadzone: 0.07, sensitivity: 1.0 },
};

// שורת מחוון (slider) בודדת עם כותרת וקריאת-ערך
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 p-2 hover:bg-white/10 rounded transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-200">{label}</span>
        <span className="text-xs font-mono text-blue-300 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-500 cursor-pointer"
      />
    </div>
  );
}

export function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [section, setSection] = useState<'sensitivity' | 'general'>('sensitivity');
  const [device, setDevice] = useState<'ps' | 'stick' | 'wheel'>('ps');
  const [cam, setCam] = useState<CamSource>('robot');

  // פרופיל שלט PS
  const psDeadzone = useTelemetryStore(s => s.psDeadzone);
  const psSensitivity = useTelemetryStore(s => s.psSensitivity);
  const setPsDeadzone = useTelemetryStore(s => s.setPsDeadzone);
  const setPsSensitivity = useTelemetryStore(s => s.setPsSensitivity);

  // פרופיל ג'ויסטיקים גדולים
  const stickDeadzone = useTelemetryStore(s => s.stickDeadzone);
  const stickSensitivity = useTelemetryStore(s => s.stickSensitivity);
  const setStickDeadzone = useTelemetryStore(s => s.setStickDeadzone);
  const setStickSensitivity = useTelemetryStore(s => s.setStickSensitivity);

  // פרופיל הגה+דוושות
  const wheelDeadzone = useTelemetryStore(s => s.wheelDeadzone);
  const wheelRange = useTelemetryStore(s => s.wheelRange);
  const pedalSensitivity = useTelemetryStore(s => s.pedalSensitivity);
  const setWheelDeadzone = useTelemetryStore(s => s.setWheelDeadzone);
  const setWheelRange = useTelemetryStore(s => s.setWheelRange);
  const setPedalSensitivity = useTelemetryStore(s => s.setPedalSensitivity);

  // פרמטרי קו-הווידאו של המצלמה הנבחרת
  const link = useTelemetryStore(s => s.videoLink[cam]);
  const setVideoLink = useTelemetryStore(s => s.setVideoLink);
  const resetVideoLink = useTelemetryStore(s => s.resetVideoLink);

  // איפוס מה שמוצג כרגע לברירות המחדל שלו
  const resetActive = () => {
    if (section === 'general') {
      resetVideoLink(cam);
    } else if (device === 'ps') {
      setPsDeadzone(DEFAULTS.ps.deadzone);
      setPsSensitivity(DEFAULTS.ps.sensitivity);
    } else if (device === 'stick') {
      setStickDeadzone(DEFAULTS.stick.deadzone);
      setStickSensitivity(DEFAULTS.stick.sensitivity);
    } else {
      setWheelDeadzone(WHEEL_DEFAULTS.deadzone);
      setWheelRange(WHEEL_DEFAULTS.range);
      setPedalSensitivity(WHEEL_DEFAULTS.pedalSensitivity);
    }
  };

  // הפרופיל הפעיל לפי ה-tab הנבחר
  const cur = device === 'ps'
    ? {
        deadzone: psDeadzone, sensitivity: psSensitivity,
        setDeadzone: setPsDeadzone, setSensitivity: setPsSensitivity,
      }
    : {
        deadzone: stickDeadzone, sensitivity: stickSensitivity,
        setDeadzone: setStickDeadzone, setSensitivity: setStickSensitivity,
      };

  return (
    <div className="absolute bottom-4 left-4 z-50 pointer-events-auto">
      {/* התפריט — נפתח מעל הכפתור (כי הכפתור בתחתית המסך) */}
      {isOpen && (
        <div
          className="absolute bottom-12 left-0 w-72 bg-black/80 text-white rounded-lg shadow-xl backdrop-blur-md select-none overflow-hidden"
          dir="ltr"
        >
          {/* בורר החלק הראשי — רגישות בקרים / כללי */}
          <div className="flex border-b border-white/20">
            {([
              { key: 'sensitivity', label: 'Sensitivity' },
              { key: 'general', label: 'General' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSection(key)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  section === key
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {section === 'general' ? (
              <>
                {/* בורר מצלמה — לרובוט ולרחפן קו שידור נפרד לגמרי */}
                <div className="flex gap-1.5 mb-3">
                  {([
                    { key: 'robot', label: 'Robot Cam' },
                    { key: 'drone', label: 'Drone Cam' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setCam(key)}
                      className={`flex-1 px-1.5 py-1 border rounded-md text-xs transition-colors ${
                        cam === key
                          ? 'bg-white text-black font-bold border-white'
                          : 'border-white/30 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-1">
                  <SliderRow
                    label="Frame Rate"
                    value={link.fps}
                    min={VIDEO_LINK_LIMITS.fps.min}
                    max={VIDEO_LINK_LIMITS.fps.max}
                    step={VIDEO_LINK_LIMITS.fps.step}
                    format={(v) => (v >= NATIVE_FPS ? 'Native' : `${v} fps`)}
                    onChange={(v) => setVideoLink(cam, { fps: v })}
                  />

                  <SliderRow
                    label="Latency"
                    value={link.latency}
                    min={VIDEO_LINK_LIMITS.latency.min}
                    max={VIDEO_LINK_LIMITS.latency.max}
                    step={VIDEO_LINK_LIMITS.latency.step}
                    format={(v) => `${v} ms`}
                    onChange={(v) => setVideoLink(cam, { latency: v })}
                  />

                  <SliderRow
                    label="Jitter"
                    value={link.jitter}
                    min={VIDEO_LINK_LIMITS.jitter.min}
                    max={VIDEO_LINK_LIMITS.jitter.max}
                    step={VIDEO_LINK_LIMITS.jitter.step}
                    format={(v) => `±${Math.round(v / 2)} ms`}
                    onChange={(v) => setVideoLink(cam, { jitter: v })}
                  />
                </div>
              </>
            ) : (
              <>
            {/* בורר התקן — כל פרופיל נפרד לחלוטין */}
            <div className="flex gap-1.5 mb-3">
              {([
                { key: 'ps', label: 'PlayStation' },
                { key: 'stick', label: 'Joysticks' },
                { key: 'wheel', label: 'Wheel' },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDevice(key)}
                  className={`flex-1 px-1.5 py-1 border rounded-md text-xs transition-colors ${
                    device === key
                      ? 'bg-white text-black font-bold border-white'
                      : 'border-white/30 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              {device === 'wheel' ? (
                <>
                  <SliderRow
                    label="Dead Zone"
                    value={wheelDeadzone}
                    min={0}
                    max={0.4}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={setWheelDeadzone}
                  />

                  <SliderRow
                    label="Steering Range"
                    value={wheelRange}
                    min={0.3}
                    max={1.0}
                    step={0.05}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={setWheelRange}
                  />

                  <SliderRow
                    label="Pedal Sensitivity"
                    value={pedalSensitivity}
                    min={0.2}
                    max={2.0}
                    step={0.05}
                    format={(v) => `${v.toFixed(2)}×`}
                    onChange={setPedalSensitivity}
                  />
                </>
              ) : (
                <>
                  <SliderRow
                    label="Dead Zone"
                    value={cur.deadzone}
                    min={0}
                    max={0.4}
                    step={0.01}
                    format={(v) => `${Math.round(v * 100)}%`}
                    onChange={cur.setDeadzone}
                  />

                  <SliderRow
                    label="Sensitivity"
                    value={cur.sensitivity}
                    min={0.2}
                    max={2.0}
                    step={0.05}
                    format={(v) => `${v.toFixed(2)}×`}
                    onChange={cur.setSensitivity}
                  />
                </>
              )}
            </div>
              </>
            )}

            {/* איפוס הפרופיל/המצלמה המוצגים כרגע — תחתית החלונית, בשני החלקים.
                מיושר לימין בדיוק מול קריאות-הערך של המחוונים (אותו p-2). */}
            <div className="flex justify-end px-2">
              <button
                onClick={resetActive}
                className="text-[11px] text-gray-400 hover:text-white transition-colors underline underline-offset-2"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* הכפתור — אותו סגנון של שאר כפתורי הצד (שכבות / מבט-על) */}
      <button
        onClick={() => setIsOpen(o => !o)}
        className="w-10 h-10 bg-black/70 hover:bg-black/90 backdrop-blur-sm rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center overflow-hidden"
        title="הגדרות"
      >
        {/* אייקון גלגל-שיניים בקו דק (בסגנון Lucide) — תואם לקווים העדינים של שאר האייקונים */}
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    </div>
  );
}
