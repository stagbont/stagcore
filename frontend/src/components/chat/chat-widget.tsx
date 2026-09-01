"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { useChat } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Bot, MessageCircle, Send, Trash2, X, Square, Sparkles } from "lucide-react";

const SUGGESTED = [
  "Show low stock items",
  "How do I complete a sale?",
  "What's today's revenue?",
];

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="Assistant is typing">
      <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
      <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
      <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
    </span>
  );
}

export function ChatWidget() {
  const { data: sessionData } = useSession();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // useChat expects () => { session: { token } }
  const getSession = useCallback(() => sessionData as unknown, [sessionData]);
  const { messages, isStreaming, error, send, stop, clear } = useChat(getSession);

  // auto-scroll to bottom on new messages / streaming
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // Use instant for user messages, smooth for streaming keeps UX responsive
    el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  // focus input when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    await send(text);
    // refocus after send
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 print:hidden">
        {!open && (
          <Button
            size="icon"
            aria-label="Open shop assistant"
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="size-14 rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-modal)] hover:bg-[var(--action-primary-hover)] border border-transparent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageCircle className="size-6" aria-hidden="true" />
          </Button>
        )}
      </div>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Shop assistant chat"
          className="fixed bottom-4 right-4 z-50 flex max-h-[min(640px,calc(100vh-2rem))] h-[520px] w-[380px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-[var(--shadow-modal)] sm:bottom-4 sm:right-4"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden="true">
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-medium leading-none text-foreground">Shop Assistant</h2>
                <p className="mt-1 text-xs leading-none text-muted-foreground truncate">Stock, sales & help — tenant-scoped</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Clear conversation"
                onClick={clear}
                disabled={isStreaming && messages.length === 0}
                className="size-8"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Close assistant" onClick={() => setOpen(false)} className="size-8">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div
            ref={listRef}
            className="flex-1 overflow-y-auto scroll-fade bg-background px-3 py-4 sm:px-4"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
                <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                  <Bot className="size-6" aria-hidden="true" />
                </div>
                <div className="max-w-[280px] space-y-1">
                  <p className="text-sm font-medium text-foreground">How can I help today?</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Ask about inventory, sales, or how-tos. I can look up stock, low-stock alerts, devices by IMEI, and today&apos;s revenue.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {SUGGESTED.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setInput(s);
                        // small delay so input reflects then send
                        setTimeout(() => send(s), 0);
                      }}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="pt-2 text-[11px] text-muted-foreground">Press Enter to send · Shift+Enter for new line</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m) => {
                  const isUser = m.role === "user";
                  return (
                    <div key={m.id} className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"}`}>
                      {!isUser && (
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground" aria-hidden="true">
                          <Bot className="size-3.5" />
                        </div>
                      )}
                      <div
                        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words border ${
                          isUser
                            ? "rounded-br-md bg-primary text-primary-foreground border-transparent"
                            : "rounded-bl-md bg-card text-card-foreground border-border"
                        }`}
                      >
                        {m.content ? (
                          <span>{m.content}</span>
                        ) : m.pending ? (
                          <TypingDots />
                        ) : null}
                      </div>
                      {isUser && (
                        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden="true">
                          <span className="text-[11px] font-medium">You</span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {isStreaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && (
                  <div className="flex gap-2 justify-start">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground" aria-hidden="true">
                      <Bot className="size-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5">
                      <TypingDots />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mx-3 mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive" role="alert">
              {error}
            </div>
          )}

          {/* Composer */}
          <div className="shrink-0 border-t border-border bg-card p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-end gap-2"
            >
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? "Assistant is replying…" : "Ask about stock, a device, or how to…"}
                  aria-label="Message shop assistant"
                  rows={1}
                  disabled={isStreaming}
                  className="max-h-28 min-h-11 w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 pr-10 text-sm leading-5 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
              </div>
              {isStreaming ? (
                <Button type="button" variant="outline" size="icon" aria-label="Stop generating" onClick={stop} className="size-11 shrink-0 rounded-xl">
                  <Square className="size-4 fill-current" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send message"
                  disabled={!input.trim()}
                  className="size-11 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-[var(--action-primary-hover)] disabled:opacity-50"
                >
                  <Send className="size-4" aria-hidden="true" />
                </Button>
              )}
            </form>
            <p className="mt-2 text-center text-[11px] leading-none text-muted-foreground">AI can make mistakes — verifies stock via tools, not memory.</p>
          </div>
        </div>
      )}
    </>
  );
}
