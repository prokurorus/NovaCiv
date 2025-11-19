// src/hooks/useStats.ts
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { onValue, ref, runTransaction } from "firebase/database";

export interface Stats {
  visitors: number;
  likes: number;
  joined: number;
}

const STATS_PATH = "stats";
const VISITOR_FLAG = "novaciv_visitor_counted";
const LIKE_FLAG = "novaciv_liked";

export function useStats() {
  const [stats, setStats] = useState<Stats>({
    visitors: 0,
    likes: 0,
    joined: 0,
  });

  // Подписка на изменения счётчиков
  useEffect(() => {
    const statsRef = ref(db, STATS_PATH);
    const unsubscribe = onValue(statsRef, (snapshot) => {
      const value = snapshot.val() || {};
      setStats({
        visitors: value.visitors || 0,
        likes: value.likes || 0,
        joined: value.joined || 0,
      });
    });
    return () => unsubscribe();
  }, []);

  // Увеличить счётчик (общая функция)
  const increment = (field: keyof Stats) => {
    const fieldRef = ref(db, `${STATS_PATH}/${field}`);
    return runTransaction(fieldRef, (current) => (current || 0) + 1);
  };

  // Считаем посетителя один раз на браузер
  const ensureVisitorCounted = () => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(VISITOR_FLAG)) return;
    increment("visitors").then(() => {
      localStorage.setItem(VISITOR_FLAG, "true");
    });
  };

  // Лайк — только один раз на браузер
  const like = () => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LIKE_FLAG)) return;
    increment("likes").then(() => {
      localStorage.setItem(LIKE_FLAG, "true");
    });
  };

  // Увеличение числа присоединившихся (вызываем при успешной регистрации ника)
  const joined = () => increment("joined");

  return {
    stats,
    ensureVisitorCounted,
    like,
    joined,
  };
}

