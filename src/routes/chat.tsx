import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Bot,
  Loader2,
  Mic,
  MicOff,
  Plus,
  Send,
  Sparkles,
  User2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { getChatHistory, sendChatMessage } from "@/lib/chat.functions";
import { useVoice } from "@/lib/useVoice";
import { MedicalDisclaimer } from "@/components/MedicalDisclaimer";

export const Route = createFileRoute("/chat")({
  component: () => (
    <AppShell>
      <Chat />
    </AppShell>
  ),
});

const suggestions = [
  "What are common side effects of Amoxicillin?",
  "Can I take Paracetamol with antibiotics?",
  "What's a cheaper alternative to Pantoprazole?",
  "How long does it take for antibiotics to work?",
];

type Msg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

type HistoryMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

type Conversation = {
  id: string;
  messages: HistoryMessage[];
  title: string;
  createdAt: string;
};

function Chat() {
  const fetchHistory = useServerFn(getChatHistory);
  const sendFn = useServerFn(sendChatMessage);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);

  const voice = useVoice();
  const [autoSpeak, setAutoSpeak] = useState(false);

  // Load all previous conversations.
  const loadHistory = async () => {
    try {
      setLoadingHistory(true);

      const data = (await fetchHistory()) as HistoryMessage[];

      const grouped = new Map<string, HistoryMessage[]>();

      for (const message of data) {
        const existing = grouped.get(message.conversation_id) ?? [];
        existing.push(message);
        grouped.set(message.conversation_id, existing);
      }

      const conversations: Conversation[] = Array.from(grouped.entries())
        .map(([id, conversationMessages]) => {
          const firstUserMessage = conversationMessages.find(
            (m) => m.role === "user",
          );

          return {
            id,
            messages: conversationMessages,
            title:
              firstUserMessage?.content.slice(0, 45) ||
              "New conversation",
            createdAt: conversationMessages[0]?.created_at ?? "",
          };
        })
        .reverse();

      setHistory(conversations);
    } catch (error) {
      console.error(error);
      toast.error("Unable to load chat history");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    void loadHistory();
  }, [fetchHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  // Live transcript -> input
  useEffect(() => {
    if (voice.listening) {
      setInput(voice.transcript);
    }
  }, [voice.transcript, voice.listening]);

  // When mic stops with a transcript, auto-send.
  const lastSentRef = useRef("");

  useEffect(() => {
    if (
      !voice.listening &&
      voice.transcript &&
      voice.transcript !== lastSentRef.current
    ) {
      lastSentRef.current = voice.transcript;
      void ask(voice.transcript);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.listening]);

  const ask = async (text: string) => {
    if (!text.trim() || busy) return;

    const cleanText = text.trim();

    setMessages((m) => [
      ...m,
      {
        role: "user",
        content: cleanText,
      },
    ]);

    setInput("");
    setBusy(true);

    try {
      const result = await sendFn({
        data: {
          message: cleanText,
          ...(conversationId ? { conversationId } : {}),
        },
      });

      // Store the conversation ID returned by the backend.
      setConversationId(result.conversationId);

      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: result.reply,
        },
      ]);

      if (autoSpeak) {
        voice.speak(result.reply);
      }

      // Refresh history so the current conversation appears there.
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  };

  const startNewChat = () => {
    if (busy) return;

    if (voice.listening) {
      voice.stop();
    }

    voice.cancelSpeak();

    setMessages([]);
    setConversationId(null);
    setInput("");

    toast.success("Started a new chat");
  };

  const openConversation = (conversation: Conversation) => {
    if (busy) return;

    const restoredMessages: Msg[] = conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    }));

    setConversationId(conversation.id);
    setMessages(restoredMessages);
    setInput("");

    scrollRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const toggleMic = () => {
    if (voice.listening) {
      voice.stop();
    } else if (voice.sttSupported) {
      voice.start();
    } else {
      toast.error("Voice input is not supported in this browser");
    }
  };

  const toggleAutoSpeak = () => {
    if (!voice.ttsSupported) {
      toast.error("Voice output is not supported in this browser");
      return;
    }

    setAutoSpeak((v) => {
      if (v) {
        voice.cancelSpeak();
      }

      return !v;
    });
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col animate-fade-up">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">AI Assistant</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your 24/7 personal medical AI companion. Tap the mic to ask by
            voice.
          </p>
        </div>

        <Button
          variant={autoSpeak ? "default" : "outline"}
          size="sm"
          onClick={toggleAutoSpeak}
          className={autoSpeak ? "bg-gradient-primary" : ""}
        >
          {autoSpeak ? (
            <Volume2 className="mr-2 h-4 w-4" />
          ) : (
            <VolumeX className="mr-2 h-4 w-4" />
          )}
          {autoSpeak ? "Voice replies on" : "Voice replies off"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Chat History */}
        <Card className="hidden w-64 shrink-0 flex-col overflow-hidden border-border/60 bg-gradient-card shadow-card md:flex">
          <div className="flex items-center justify-between border-b border-border p-3">
            <div>
              <h2 className="text-sm font-semibold">Chat History</h2>
              <p className="text-xs text-muted-foreground">
                Previous conversations
              </p>
            </div>

            <Button
              onClick={startNewChat}
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={busy}
              title="New chat"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto p-2">
            {loadingHistory ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                No previous conversations yet.
              </p>
            ) : (
              history.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => openConversation(conversation)}
                  disabled={busy}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent ${
                    conversation.id === conversationId
                      ? "bg-accent font-medium"
                      : ""
                  }`}
                >
                  <p className="truncate">{conversation.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {conversation.messages.length} messages
                  </p>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Main Chat */}
        <Card className="flex min-w-0 flex-1 flex-col overflow-hidden border-border/60 bg-gradient-card shadow-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3 md:hidden">
            <span className="text-sm font-semibold">AI Assistant</span>

            <Button
              onClick={startNewChat}
              size="sm"
              variant="outline"
              disabled={busy}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Chat
            </Button>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto p-6"
          >
            {messages.length === 0 && (
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>

                <div className="max-w-[75%] rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm">
                  Hello 👋 I'm your MedScan AI assistant. Ask me anything about
                  medications, dosages, or interactions.
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={m.id ?? i}
                className={`flex gap-3 ${
                  m.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    m.role === "user"
                      ? "bg-muted"
                      : "bg-gradient-primary text-primary-foreground"
                  }`}
                >
                  {m.role === "user" ? (
                    <User2 className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>

                <div
                  className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    m.role === "user"
                      ? "rounded-tr-sm bg-primary text-primary-foreground"
                      : "rounded-tl-sm border border-border bg-card"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {busy && (
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-primary-foreground">
                  <Bot className="h-4 w-4" />
                </div>

                <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}

            {messages.length === 0 && (
              <div className="pt-6">
                <p className="mb-3 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3 w-3" />
                  Suggested questions
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-xl border border-border bg-card p-3 text-left text-sm transition hover:border-primary hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border bg-background px-3 pt-2">
            <MedicalDisclaimer className="mt-0" />
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-background p-3">
            <Button
              onClick={toggleMic}
              disabled={busy}
              size="icon"
              variant={voice.listening ? "default" : "outline"}
              className={`h-11 w-11 ${
                voice.listening
                  ? "animate-pulse bg-destructive text-destructive-foreground"
                  : ""
              }`}
              title={
                voice.sttSupported
                  ? "Voice input"
                  : "Voice input not supported"
              }
            >
              {voice.listening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>

            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void ask(input);
                }
              }}
              placeholder={
                voice.listening
                  ? "Listening…"
                  : "Ask about a medication, dosage, or interaction..."
              }
              className="h-11"
              disabled={busy}
            />

            <Button
              onClick={() => void ask(input)}
              disabled={busy}
              size="icon"
              className="h-11 w-11 bg-gradient-primary"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}