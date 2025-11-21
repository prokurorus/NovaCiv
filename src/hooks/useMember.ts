// src/hooks/useMember.ts
import { useEffect, useState, useCallback } from "react";
import { db } from "../lib/firebase";
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
  nickname: string | null;
  createdAt: number;
  lastActiveAt: number;
};

const STORAGE_KEY = "novaciv_member";

function createLocalId() {
  return `local_${Math.random().toString(36).slice(2, 11)}`;
}

export function useMember() {
  const [member, setMember] = useState<MemberInfo>({
    memberId: "",
    nickname: null,
    createdAt: 0,
    lastActiveAt: 0,
  });

  // На будущее — можно использовать для блока "кто уже здесь"
  const [recentMembers, setRecentMembers] = useState<MemberInfo[]>([]);

  // Инициализация участника
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      let stored: MemberInfo | null = null;

      try {
        const raw =
          typeof window !== "undefined"
            ? window.localStorage.getItem(STORAGE_KEY)
            : null;
        if (raw) {
          stored = JSON.parse(raw) as MemberInfo;
        }
      } catch (e) {
        console.warn("Failed to read member from localStorage", e);
      }

      const now = Date.now();

      // Если уже есть локальный участник — обновим активность
      if (stored && stored.memberId) {
        const updated: MemberInfo = {
          ...stored,
          lastActiveAt: now,
        };

        try {
          await set(ref(db, `members/${updated.memberId}`), {
            ...updated,
            createdAtServer: stored.createdAt || now,
            lastActiveAtServer: serverTimestamp(),
          });
        } catch (e) {
          console.error("Failed to sync existing member to Firebase", e);
        }

        if (isMounted) {
          setMember(updated);
        }

        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          }
        } catch (e) {
          console.warn("Failed to update member in localStorage", e);
        }
      } else {
        // Иначе создаём нового участника без ника
        const membersRef = ref(db, "members");
        const newRef = push(membersRef);
        const memberId = newRef.key || createLocalId();

        const fresh: MemberInfo = {
          memberId,
          nickname: null,
          createdAt: now,
          lastActiveAt: now,
        };

        try {
          await set(ref(db, `members/${memberId}`), {
            ...fresh,
            createdAtServer: serverTimestamp(),
            lastActiveAtServer: serverTimestamp(),
          });
        } catch (e) {
          console.error("Failed to create member in Firebase", e);
        }

        if (isMounted) {
          setMember(fresh);
        }

        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
          }
        } catch (e) {
          console.warn("Failed to save new member to localStorage", e);
        }
      }

      // Подписка на недавних участников (на будущее)
      const recentRef = query(ref(db, "members"), limitToLast(20));
      const unsubscribe = onValue(recentRef, (snapshot) => {
        const value = snapshot.val() || {};
        const list: MemberInfo[] = Object.values(value).map((raw: any) => ({
          memberId: raw.memberId ?? "",
          nickname: raw.nickname ?? null,
          createdAt: raw.createdAt ?? 0,
          lastActiveAt: raw.lastActiveAt ?? 0,
        }));

        list.sort(
          (a, b) =>
            (b.lastActiveAt || b.createdAt || 0) -
            (a.lastActiveAt || a.createdAt || 0)
        );

        if (isMounted) {
          setRecentMembers(list);
        }
      });

      return unsubscribe;
    };

    let cleanup: (() => void) | undefined;

    init().then((unsub) => {
      cleanup = unsub as any;
    });

    return () => {
      isMounted = false;
      if (cleanup) cleanup();
    };
  }, []);

  // Регистрация или смена ника
  const registerNickname = useCallback(
    async (rawNickname: string): Promise<boolean> => {
      const nickname = rawNickname.trim();

      if (!nickname) {
        return false;
      }

      // Простая защита от слишком длинных ников
      if (nickname.length > 32) {
        return false;
      }

      const now = Date.now();
      let current = member;

      // На всякий случай: если member ещё не инициализирован
      if (!current.memberId) {
        const membersRef = ref(db, "members");
        const newRef = push(membersRef);
        const memberId = newRef.key || createLocalId();

        current = {
          memberId,
          nickname: null,
          createdAt: now,
          lastActiveAt: now,
        };
      }

      const updated: MemberInfo = {
        ...current,
        nickname,
        lastActiveAt: now,
      };

      try {
        await set(ref(db, `members/${updated.memberId}`), {
          ...updated,
          lastActiveAtServer: serverTimestamp(),
        });
      } catch (e) {
        console.error("Failed to save nickname to Firebase", e);
      }

      setMember(updated);

      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }
      } catch (e) {
        console.warn("Failed to write member to localStorage", e);
      }

      return true;
    },
    [member]
  );

  return { member, recentMembers, registerNickname };
}
