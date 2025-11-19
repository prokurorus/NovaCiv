// src/hooks/useChat.ts
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import {
  onValue,
  push,
  query,
  ref,
  limitToLast,
  serverTimestamp,
} from "firebase/database";
import type { MemberInfo } from "./useMember";

export type ChatMessage = {
  id: string;
  nickname: string;
  text: string;
  createdAt: number | null;
};

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  // подписка на последние сообщения
  useEffect(() => {
    const messagesQuery = query(ref(db, "messages"), limitToLast(100));

    const unsubscribe = onValue(messagesQuery, (snap) => {
      const value = snap.val() as
        | Record<string, { nickname?: string; text?: string; createdAt?: number }>
        | null;

      if (!value) {
        setMessages([]);
        return;
      }

      const list: ChatMessage[] = Object.entries(value).map(([key, v]) => ({
        id: key,
        nickname: v.nickname ?? "someone",
        text: v.text ?? "",
        createdAt:
          typeof v.createdAt === "number" ? v.createdAt : null,
      }));

      // упорядочим по времени
      list.sort(
        (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)
      );

      setMessages(list);
    });

    return () => unsubscribe();
  }, []);

  // отправка сообщения
  async function sendMessage(member: MemberInfo, rawText: string) {
    const text = rawText.trim();
    if (!text) return;

    if (!member.memberId || !member.nickname) {
      console.warn("Cannot send message: no member registered");
      return;
    }

    setIsSending(true);
    try {
      await push(ref(db, "messages"), {
        memberId: member.memberId,
        nickname: member.nickname,
        text,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to send message", e);
    } finally {
      setIsSending(false);
    }
  }

  return { messages, isSending, sendMessage };
}
