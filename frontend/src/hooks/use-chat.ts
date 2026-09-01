"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, getAuthToken } from "@/lib/fetch-with-auth";

export interface UIMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

export function useChat(getSession: () => unknown) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<UIMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  }, []);

  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || isStreaming || abortRef.current) return;
      setError(null);

      const token = getAuthToken(getSession());
      if (!token) {
        setError("Not signed in. Please refresh and log in again.");
        return;
      }

      const userMsg: UIMessage = { id: `u-${Date.now()}`, role: "user", content: text };
      const asstId = `a-${Date.now() + 1}`;
      const asstMsg: UIMessage = { id: asstId, role: "assistant", content: "", pending: true };

      // Build payload deterministically from ref (no closure staleness) + add user msg and update UI
      const base = messagesRef.current.filter((m) => !m.pending).map((m) => ({ role: m.role, content: m.content }));
      const payloadMessages = [...base, { role: userMsg.role, content: userMsg.content }];

      setMessages((prev) => [...prev, userMsg, asstMsg]);

      const controller = new AbortController();
      abortRef.current = controller;
      setIsStreaming(true);

      try {
        const res = await fetch(`${API_URL}/api/v1/chat/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ messages: payloadMessages, stream: true }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const txt = await res.text();
          // Surface 503 hint nicely
          let msg = txt || `Chat failed: ${res.status}`;
          try {
            const j = JSON.parse(txt);
            if (j.detail) msg = j.detail;
          } catch {}
          throw new Error(msg);
        }

        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/event-stream")) {
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) throw new Error("No stream available");
          let acc = "";
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";
            for (const part of parts) {
              const line = part.trim();
              if (!line) continue;
              if (line === "data: [DONE]") {
                buffer = "";
                break;
              }
              if (line.startsWith("data: ")) {
                try {
                  const obj = JSON.parse(line.slice(6));
                  if (typeof obj.content === "string") {
                    // Backend sends 4-word incremental chunks; accumulate
                    acc += obj.content;
                    const current = acc;
                    setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content: current, pending: false } : m)));
                  }
                } catch {
                  // ignore malformed chunk
                }
              }
            }
          }
          setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, pending: false } : m)));
        } else {
          const j = await res.json();
          const content = j.content || j.choices?.[0]?.message?.content || "";
          setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, content, pending: false } : m)));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("AbortError") || controller.signal.aborted) {
          setMessages((prev) => prev.map((m) => (m.id === asstId ? { ...m, pending: false } : m)));
        } else {
          setError(msg);
          setMessages((prev) => prev.filter((m) => m.id !== asstId));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [getSession, isStreaming],
  );

  const clear = useCallback(() => {
    stop();
    setMessages([]);
    setError(null);
  }, [stop]);

  return { messages, isStreaming, error, send, stop, clear, setError };
}
