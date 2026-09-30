// File: src/components/mergeStaticMeshes.ts
//
// ממזג עץ של אלמנטי <group>/<mesh> סטטיים למספר קטן של meshes ממוזגים,
// אחד לכל חתימת חומר ייחודית.
//
// הרעיון: הקוד שמייצר את הגאומטריה (Village.tsx) נשאר כפי שהוא ומייצר בדיוק
// את אותו עץ אלמנטים. כאן עוברים על העץ אחריו, צוברים את הטרנספורמים של
// ה-<group>-ים, "אופים" אותם לתוך הקודקודים, ומאחדים לפי חומר. מה שלא ניתן
// למזג (קומפוננטות, קווים) עובר הלאה ללא שינוי, עם הטרנספורם שלו.
//
// שימור המראה: השיידר של הכפר דוגם רעש לפי מיקום *מקומי* של הקודקוד
// (`vLocalPos = position`). מכיוון שהאפייה הופכת את position למיקום עולמי,
// אנחנו שומרים את המיקום המקורי בתכונה `aLocalPos`, וגרסת השיידר הממוזגת
// קוראת ממנה. התוצאה זהה לחלוטין.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createElement, isValidElement, type ReactNode } from 'react';

type Ctor = new (...args: any[]) => THREE.BufferGeometry;

// אלמנטי גאומטריה שאנחנו יודעים לבנות מחדש מתוך args.
const GEOMETRY_CTORS: Record<string, Ctor> = {
  boxGeometry: THREE.BoxGeometry,
  cylinderGeometry: THREE.CylinderGeometry,
  coneGeometry: THREE.ConeGeometry,
  sphereGeometry: THREE.SphereGeometry,
  planeGeometry: THREE.PlaneGeometry,
  ringGeometry: THREE.RingGeometry,
  circleGeometry: THREE.CircleGeometry,
  torusGeometry: THREE.TorusGeometry,
};

// תכונות של ה-mesh שמשפיעות על הציור ולכן חייבות להיכנס לחתימת הקיבוץ.
const MESH_DRAW_PROPS = ['castShadow', 'receiveShadow', 'renderOrder', 'visible', 'frustumCulled'] as const;

export interface MergeOptions {
  /** מאפשר להחליף מאפייני חומר עבור הגרסה הממוזגת (למשל להחליף שיידר). */
  materialProps?: (props: Record<string, any>) => Record<string, any>;
}

interface Bucket {
  matType: string;
  matProps: Record<string, any>;
  meshProps: Record<string, any>;
  geos: THREE.BufferGeometry[];
  /** האלמנטים המקוריים — משמשים כגיבוי אם המיזוג נכשל. */
  originals: ReactNode[];
}

function flatten(children: any): any[] {
  const out: any[] = [];
  const push = (c: any) => {
    if (c === null || c === undefined || c === false || c === true) return;
    if (Array.isArray(c)) { c.forEach(push); return; }
    out.push(c);
  };
  push(children);
  return out;
}

const _pos = new THREE.Vector3();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();

function localMatrix(props: any): THREE.Matrix4 {
  _pos.set(0, 0, 0);
  _euler.set(0, 0, 0);
  _scale.set(1, 1, 1);

  const p = props.position;
  if (Array.isArray(p)) _pos.set(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
  else if (typeof p === 'number') _pos.set(p, p, p);

  const r = props.rotation;
  if (Array.isArray(r)) _euler.set(r[0] ?? 0, r[1] ?? 0, r[2] ?? 0);

  const s = props.scale;
  if (Array.isArray(s)) _scale.set(s[0] ?? 1, s[1] ?? 1, s[2] ?? 1);
  else if (typeof s === 'number') _scale.set(s, s, s);

  _quat.setFromEuler(_euler);
  return new THREE.Matrix4().compose(_pos, _quat, _scale);
}

function signature(matType: string, matProps: Record<string, any>, meshProps: any): string {
  const parts: string[] = ['m:' + matType];
  for (const k of Object.keys(matProps).sort()) {
    if (k === 'children' || k === 'attach') continue;
    const v = matProps[k];
    // פונקציות (onBeforeCompile / customProgramCacheKey) לא ניתנות להשוואה לפי ערך,
    // אבל עצם קיומן משנה את המראה — אז הן נכנסות לחתימה לפי שם התכונה בלבד.
    parts.push(typeof v === 'function' ? `${k}:fn` : `${k}:${JSON.stringify(v)}`);
  }
  for (const k of MESH_DRAW_PROPS) parts.push(`${k}:${JSON.stringify(meshProps[k] ?? null)}`);
  return parts.join('|');
}

/** עוטף צומת שלא ניתן למזג בקבוצה שנושאת את הטרנספורם המצטבר שלו. */
function wrapWithMatrix(node: ReactNode, matrix: THREE.Matrix4, key: string): ReactNode {
  if (matrixIsIdentity(matrix)) return node;
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  matrix.decompose(p, q, s);
  return createElement(
    'group',
    { key, position: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w], scale: [s.x, s.y, s.z] },
    node,
  );
}

const IDENTITY = new THREE.Matrix4();
function matrixIsIdentity(m: THREE.Matrix4): boolean {
  const a = m.elements, b = IDENTITY.elements;
  for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return false;
  return true;
}

function walk(
  children: any,
  matrix: THREE.Matrix4,
  buckets: Map<string, Bucket>,
  rest: ReactNode[],
  counter: { n: number },
) {
  for (const child of flatten(children)) {
    if (!isValidElement(child)) continue;
    const type = (child as any).type;
    const props = ((child as any).props ?? {}) as any;

    if (type === 'group') {
      walk(props.children, matrix.clone().multiply(localMatrix(props)), buckets, rest, counter);
      continue;
    }

    if (type === 'mesh') {
      let geoEl: any = null;
      let matEl: any = null;
      for (const k of flatten(props.children)) {
        if (!isValidElement(k)) continue;
        const t = (k as any).type;
        if (typeof t !== 'string') continue;
        if (GEOMETRY_CTORS[t]) geoEl = k;
        else if (t.toLowerCase().endsWith('material')) matEl = k;
      }

      // mesh שאנחנו לא יודעים לפרק (גאומטריה שהועברה כ-prop, חומר לא מוכר) — משאירים כמו שהוא.
      if (!geoEl || !matEl) {
        rest.push(wrapWithMatrix(child, matrix, `keep-${counter.n++}`));
        continue;
      }

      const Geo = GEOMETRY_CTORS[(geoEl as any).type];
      const args = ((geoEl as any).props?.args ?? []) as any[];
      const geo = new Geo(...args);

      // שומרים את מיקום הקודקוד לפני האפייה — בשביל שיידר הלכלוך.
      const posAttr = geo.getAttribute('position');
      geo.setAttribute(
        'aLocalPos',
        new THREE.BufferAttribute(Float32Array.from(posAttr.array as ArrayLike<number>), 3),
      );

      geo.applyMatrix4(matrix.clone().multiply(localMatrix(props)));

      const matType = (matEl as any).type as string;
      const matProps = ((matEl as any).props ?? {}) as Record<string, any>;
      const sig = signature(matType, matProps, props);

      let bucket = buckets.get(sig);
      if (!bucket) {
        bucket = { matType, matProps, meshProps: props, geos: [], originals: [] };
        buckets.set(sig, bucket);
      }
      bucket.geos.push(geo);
      bucket.originals.push(wrapWithMatrix(child, matrix, `orig-${counter.n++}`));
      continue;
    }

    // קומפוננטות, קווים, RigidBody וכל השאר — עוברים הלאה עם הטרנספורם שלהם.
    rest.push(wrapWithMatrix(child, matrix, `pass-${counter.n++}`));
  }
}

/**
 * מקבל עץ אלמנטים סטטי ומחזיר רשימה מקוצרת: mesh ממוזג אחד לכל חתימת חומר,
 * ואחריהם כל מה שלא ניתן היה למזג.
 */
export function mergeStaticTree(children: ReactNode, options: MergeOptions = {}): ReactNode[] {
  const buckets = new Map<string, Bucket>();
  const rest: ReactNode[] = [];
  walk(children, new THREE.Matrix4(), buckets, rest, { n: 0 });

  const merged: ReactNode[] = [];
  let i = 0;

  for (const bucket of buckets.values()) {
    let geometry: THREE.BufferGeometry | null = null;
    try {
      geometry = bucket.geos.length === 1 ? bucket.geos[0] : mergeGeometries(bucket.geos, false);
    } catch {
      geometry = null;
    }

    // אם המיזוג נכשל (למשל תכונות לא תואמות) — נשארים עם המקוריים. נכון תמיד.
    if (!geometry) {
      merged.push(...bucket.originals);
      continue;
    }

    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const { children: _ignored, ...restMatProps } = bucket.matProps;
    const matProps = options.materialProps ? options.materialProps(restMatProps) : restMatProps;

    const meshProps: Record<string, any> = { key: `merged-${i++}`, geometry };
    for (const k of MESH_DRAW_PROPS) {
      if (bucket.meshProps[k] !== undefined) meshProps[k] = bucket.meshProps[k];
    }

    merged.push(createElement('mesh', meshProps, createElement(bucket.matType, matProps)));
  }

  return [...merged, ...rest];
}
