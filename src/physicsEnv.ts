// File: src/physicsEnv.ts
// הקשר הפיזיקה (Rapier) משותף לכל הרכיבים. יושב במודול נפרד כדי שגם מודולים
// שאינם רכיבי React (למשל droneCollision) יוכלו לבצע שאילתות בעולם בלי ייבוא מעגלי.
export const physicsEnv: { rapier: any, world: any } = { rapier: null, world: null };
