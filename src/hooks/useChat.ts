// src/hooks/useChat.ts
import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import {
  onValue,
  push,
  ref,
  set,
} from "firebase/database";

const MEMBER_ID_KEY = "novaciv_member_id";
const NICKNAME_KEY = "novaciv_nickname";

export interface ChatMessage {
  id: string;
  nickname: string;
  text: string;
  createdAt: number;
}

export interface MemberInfo {
  memberId: string | null;
  nickname: string | null;
}

export function useMember() {
  const [member, setMember] = useState<MemberInfo>({
    memberId: null,
    nickname: null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const memberId = localStorage.getItem(MEMBER_ID_KEY);
    const nickname = localStorage.getItem(NICKNAME_KEY);
    setMember({ memberId, nickname });
  }, []);

  const registerNickname = async (nickname: string) => {
    const trimmed = nickname.trim();
    if (!trimmed) return null;

    const membersRef = ref(db, "members");
    const newMemberRef = push(membersRef);

    const memberId = newMemberRef.key!;
    await set(newMemberRef, {
      nickname: trimmed,
      createdAt: Date.now(),
    });

    if (typeof window !== "undefined") {
      localStorage.setItem(MEMBER_ID_KEY, memberId);
      localStorage.setItem(NICKNAME_KEY, trimmed);
    }

    const result: MemberInfo = { memberId, nickname: trimmed };
    setMember(result);
    return result;
  };

  return { member, registerNickname };
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Подписка на все сообщения
  useEffect(() => {
    const messagesRef = ref(db, "messages");
    const unsubscribe = onValue(messagesRef, (snapshot) => {
      const value = snapshot.val() || {};
      const list: ChatMessage[] = Object.entries<any>(value).map(
        ([id, msg]) => ({
          id,
          nickname: msg.nickname || "Аноним",
          text: msg.text || "",
          createdAt: msg.createdAt || 0,
        })
      );
      list.sort((a, b) => a.createdAt - b.createdAt);
      setMessages(list);
    });

    return () => unsubscribe();
  }, []);

  const sendMessage = async (member: MemberInfo, text: string) => {
    const trimmed = text.trim();
    if (!member.memberId || !member.nickname || !trimmed) return;

    setIsSending(true);
    try {
      const messagesRef = ref(db, "messages");
      const newMessageRef = push(messagesRef);
      await set(newMessageRef, {
        memberId: member.memberId,
        nickname: member.nickname,
        text: trimmed,
        createdAt: Date.now(),
      });
    } finally {
      setIsSending(false);
    }
  };

  return { messages, sendMessage, isSending };
}
