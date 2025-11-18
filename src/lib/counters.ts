// src/lib/counters.ts

const NAMESPACE = "novaciv.space";

async function getCount(key: string): Promise<number> {
  try {
    const res = await fetch(`https://api.countapi.xyz/get/${NAMESPACE}/${key}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.value === "number" ? data.value : 0;
  } catch {
    return 0;
  }
}

async function hit(key: string): Promise<number> {
  try {
    const res = await fetch(`https://api.countapi.xyz/hit/${NAMESPACE}/${key}`);
    if (!res.ok) return 0;
    const data = await res.json();
    return typeof data.value === "number" ? data.value : 0;
  } catch {
    return 0;
  }
}

export function getLikesCount() {
  return getCount("likes");
}

export function getJoinsCount() {
  return getCount("joins");
}

export function hitLike() {
  return hit("likes");
}

export function hitJoin() {
  return hit("joins");
}

