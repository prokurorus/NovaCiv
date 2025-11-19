// src/hooks/useChat.ts
import { useEffect, useState, useRef } from "react";
import { db } from "../lib/firebase";
import { ref, push, onValue } from "firebase/database";

// простой локальный идентификатор участника
export function useMember() {
  const [member, setMember] = useState<{ memberId: string; nickname: string | null }>({
    memberId: "",
    nickname: null,
  });

  useEffect(() => {
    let storedId = localStorage.getItem("memberId");
    if (!storedId) {
      storedId = "m_" + Math.random().toString(36).substring(2, 12);
      localStorage.setItem("memberId", storedId);
    }

    const nickname = localStorage.getItem("memberNickname");

    setMember({
      memberId: storedId,
      nickname: nickname || null,
    });
  }, []);

  const registerNickname = (nickname: string) => {
    if (!nickname || nickname.trim().length < 2) return false;
    localStorage.setItem("memberNickname", nickname.trim());
    setMember((prev) => ({ ...prev, nickname: nickname.trim() }));
    return true;
  };

  return { member, registerNickname };
}

// -------------------------------------------------------------

export function useChat() {
  const [messages, setMessages] = useState<
    { id: string; nickname: string; text: string }[]
  >([]);

  const [isSending, setIsSending] = useState(false);

  // ТАЙМЕР ЗАЩИТЫ ОТ ФЛУДА
  const lastSendRef = useRef(0);

  useEffect(() => {
    const messagesRef = ref(db, "messages");

    return onValue(messagesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data).map(([id, msg]: any) => ({
        id,
        nickname: msg.nickname,
        text: msg.text,
      }));

      setMessages(list.reverse());
    });
  }, []);

  // -----------------------------------------
  // ОТПРАВКА С УЧЁТОМ АНТИФЛУДА
  // -----------------------------------------
  const sendMessage = async (
    member: { nickname: string | null },
    text: string
  ) => {
    if (!member.nickname) return;
    if (!text || text.length > 300) return; // уже существующее ограничение

    const now = Date.now();
    if (now - lastSendRef.current < 2000) {
      // меньше 2 секунд — блокируем
      return;
    }
    lastSendRef.current = now;

    setIsSending(true);
    const messagesRef = ref(db, "messages");

    await push(messagesRef, {
      nickname: member.nickname,
      text: text.trim(),
    });

    setIsSending(false);
  };

  return { messages, sendMessage, isSending };
}
