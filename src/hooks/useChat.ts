// src/hooks/useChat.ts

import { useEffect, useRef, useState } from "react";
import { db } from "../lib/firebase";
import {
  ref,
  push,
  limitToLast,
  onChildAdded,
  off,
  query,
  serverTimestamp,
  type DataSnapshot,
} from "firebase/database";

type ChatMessage = {
  id: string;
  nickname: string;
  text: string;
  createdAt?: number;
};

type Member = {
  memberId?: string;
  nickname?: string;
};

const MAX_MESSAGE_LENGTH = 500;      // максимум символов
const SEND_COOLDOWN_MS = 5000;       // минимум 5 сек между сообщениями

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  // локальный таймер против спама
  const lastSentRef = useRef<number>(0);

  useEffect(() => {
    // читаем последние 100 сообщений
    const messagesRef = ref(db, "chat/messages");
    const q = query(messagesRef, limitToLast(100));

    const handleChildAdded = (snapshot: DataSnapshot) => {
      const value = snapshot.val();
      if (!value) return;

      setMessages((prev) => {
        const next: ChatMessage[] = [
          ...prev,
          {
            id: snapshot.key ?? "",
            nickname: value.nickname ?? "anon",
            text: value.text ?? "",
            createdAt: value.createdAt ?? 0,
          },
        ];

        // на всякий случай обрезаем до 100
        if (next.length > 100) {
          return next.slice(next.length - 100);
        }
        return next;
      });
    };

    onChildAdded(q, handleChildAdded);

    return () => {
      off(q, "child_added", handleChildAdded);
    };
  }, []);

  const sendMessage = async (member: Member, text: string) => {
    const trimmed = text.trim();

    // без участника или ника — не отправляем
    if (!member || !member.memberId || !member.nickname) {
      console.warn("Cannot send message: member is not registered");
      return;
    }

    if (!trimmed) return;

    // 1) длина сообщения
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      console.warn("Message is too long");
      return;
    }

    // 2) пауза между сообщениями
    const now = Date.now();
    if (now - lastSentRef.current < SEND_COOLDOWN_MS) {
      console.warn("Messages are limited to one every 5 seconds");
      return;
    }

    setIsSending(true);
    try {
      const messagesRef = ref(db, "chat/messages");
      await push(messagesRef, {
        memberId: member.memberId,
        nickname: member.nickname,
        text: trimmed,
        createdAt: Date.now(),
        serverTime: serverTimestamp(),
      });

      lastSentRef.current = now;
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setIsSending(false);
    }
  };

  return { messages, sendMessage, isSending };
}
