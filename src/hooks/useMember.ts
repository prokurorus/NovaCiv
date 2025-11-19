// src/hooks/useMember.ts
import { useEffect, useState } from "react";
import {
  db
} from "../lib/firebase";
import {
  onValue,
  ref,
  set,
  push,
  serverTimestamp,
  query,
  limitToLast,
} from "firebase/database";

export type MemberInfo = {
  memberId: string;
  nickname: string;
};

const STORAGE_KEY = "novaciv_member";

export function useMember() {
  const [member, setMember] = useState<MemberInfo>({
    memberId: "",
    nickname: "",
  });

  const [recentMembers, setRecentMembers] = useState<MemberInfo[]>([]);

  // читаем сохранённого участника из localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.memberId && parsed.nickname) {
        setMember({
          memberId: parsed.memberId,
          nickname: parsed.nickname,
        });
      }
    } catch (e) {
      console.error("Failed to read member from localStorage", e);
    }
  }, []);

  // подписка на список последних участников
  useEffect(() => {
    const membersQuery = query(ref(db, "members"), limitToLast(20));

    const unsubscribe = onValue(membersQuery, (snap) => {
      const value = snap.val() as
        | Record<string, { nickname: string }>
        | null;

      if (!value) {
        setRecentMembers([]);
        return;
      }

      const list: MemberInfo[] = Object.entries(value).map(([key, v]) => ({
        memberId: key,
        nickname: v.nickname,
      }));

      setRecentMembers(list);
    });

    return () => unsubscribe();
  }, []);

  // регистрация ника
  async function registerNickname(rawNickname: string) {
    const nickname = rawNickname.trim();
    if (!nickname) return null;

    let current = member;

    // если ещё нет id — создаём нового участника
    if (!current.memberId) {
      const newRef = push(ref(db, "members"));
      const memberId = newRef.key ?? "";

      await set(newRef, {
        nickname,
        createdAt: serverTimestamp(),
      });

      current = { memberId, nickname };
    } else {
      // обновляем ник существующего участника
      await set(ref(db, `members/${current.memberId}`), {
        nickname,
        updatedAt: serverTimestamp(),
      });

      current = { ...current, nickname };
    }

    setMember(current);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      console.error("Failed to save member to localStorage", e);
    }

    return current;
  }

  return { member, recentMembers, registerNickname };
}
