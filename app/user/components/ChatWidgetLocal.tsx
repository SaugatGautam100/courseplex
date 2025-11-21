"use client";

import { useEffect, useRef, useState, FormEvent, KeyboardEvent } from "react";
import type { SVGProps } from "react";

// Messages shown in your UI (no "system")
type UIMessage = { role: "assistant" | "user"; content: string };
// Messages sent to the model (includes "system")
type LLMMessage = { role: "system" | "assistant" | "user"; content: string };

/**
 Preferred models (best balance → fastest → higher quality fallback)
 - Qwen2.5-1.5B: better multilingual, great balance
 - Llama-3.2-1B: fastest tiny model
 - Llama-3.2-3B: higher quality (heavier)
*/
const PREFERRED_MODELS = [
  "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
  "Llama-3.2-1B-Instruct-q4f16_1-MLC",
  "Llama-3.2-3B-Instruct-q4f16_1-MLC",
];

export default function ChatWidgetLocal() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I’m your Plex Courses assistant. Ask me anything about your courses, schedule, or the platform.",
    },
  ]);
  const [input, setInput] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  // Loader states
  const [progressText, setProgressText] = useState<string>("Loading model…");
  const [progressPct, setProgressPct] = useState<number | null>(null);

  const [engine, setEngine] = useState<any>(null);
  const [ready, setReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Diagnostics helpers
  const getEnvDiagnostics = () => {
    const hasNavigator = typeof navigator !== "undefined";
    const hasWindow = typeof window !== "undefined";
    return {
      webgpu: hasNavigator ? !!(navigator as any).gpu : false,
      secure: hasWindow ? window.isSecureContext : false,
      isolated: hasWindow ? (self as any).crossOriginIsolated === true : false,
    };
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      const env = getEnvDiagnostics();

      // Quick environment checks
      if (!env.secure) {
        setProgressText("This page isn’t a secure context. Use HTTPS (or http://localhost in dev).");
        return;
      }
      if (!env.webgpu) {
        setProgressText(
          "WebGPU not available. Use Chrome/Edge 113+. On Windows 10 enable chrome://flags/#enable-unsafe-webgpu and restart."
        );
        return;
      }

      try {
        // Import as any to avoid TS version mismatch on some installs
        const webllm: any = await import("@mlc-ai/web-llm");

        // Get prebuilt app config (contains the model_list)
        const appConfig = webllm.prebuiltAppConfig ?? (webllm as any).getDefaultAppConfig?.();
        const availableRecords: any[] = appConfig?.model_list ?? [];
        const availableIds: string[] = availableRecords.map((m: any) => m.model_id);

        // Pick the best available model automatically
        let finalModelId: string | null =
          PREFERRED_MODELS.find((id) => availableIds.includes(id)) ??
          (availableIds.length ? availableIds[0] : null);

        if (!finalModelId) {
          throw new Error(
            `No models found in appConfig.model_list. Available: ${JSON.stringify(availableIds)}`
          );
        }

        // Try worker engine first (fast), then fallback to main-thread engine
        let worker: Worker | undefined;
        try {
          const workerUrl = new URL("./webllm.worker.ts", import.meta.url);
          worker = new Worker(workerUrl, { type: "module" });
        } catch (e) {
          console.warn("WebLLM worker init failed, falling back to main thread:", e);
        }

        const initProgressCallback = (p: any) => {
          // Smooth loader: text + percentage with animated bar
          const pct = p?.progress != null ? Math.max(0, Math.min(100, Math.round(p.progress * 100))) : null;
          setProgressPct(pct);
          setProgressText(p?.text || (pct != null ? `Loading… ${pct}%` : "Loading model…"));
        };

        let e: any;
        try {
          if (worker) {
            // Worker signature supports options object
            e = await webllm.CreateWebWorkerMLCEngine(worker, {
              model: finalModelId,
              appConfig,
              initProgressCallback,
            } as any);
          } else {
            // Main-thread signature expects (modelId, options)
            e = await webllm.CreateMLCEngine(finalModelId, {
              appConfig,
              initProgressCallback,
            } as any);
          }
        } catch (err) {
          console.warn("Worker engine failed; trying main-thread engine:", err);
          e = await webllm.CreateMLCEngine(finalModelId, {
            appConfig,
            initProgressCallback,
          } as any);
        }

        if (!cancelled) {
          setEngine(e);
          setReady(true);
          setProgressText("Ready");
          setProgressPct(null);
        }
      } catch (err: any) {
        console.error("WebLLM init error:", err);
        setProgressText(
          (err && (err.message || err.toString())) ||
            "Failed to load local model. Check browser support and network."
        );
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || genLoading || !engine) return;

    const uiNext: UIMessage[] = [...messages, { role: "user" as const, content: text }];
    setMessages(uiNext);
    setInput("");
    setGenLoading(true);

    try {
      const systemPrompt: LLMMessage = {
        role: "system",
        content:
          "You are the Plex Courses student assistant. Be concise, friendly, and helpful. " +
          "Answer questions about courses, modules, schedules, fees, platform usage, and account issues. " +
          "If you don't know, ask clarifying questions or suggest contacting support@PlexCourses.com.",
      };

      const llmMessages: LLMMessage[] = [
        systemPrompt,
        ...uiNext.map((m) => ({ role: m.role, content: m.content } as LLMMessage)),
      ];

      const res = await engine.chat.completions.create({
        messages: llmMessages,
        temperature: 0.3,
      });

      const reply: string =
        res?.choices?.[0]?.message?.content ||
        "Sorry, I couldn’t generate a reply. Please try again.";

      setMessages((prev) => [...prev, { role: "assistant" as const, content: reply }]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant" as const, content: "Sorry, something went wrong. Please try again." },
      ]);
    } finally {
      setGenLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && ready && !genLoading) {
        // simulate form submit
        const fake = { preventDefault() {} } as unknown as FormEvent;
        sendMessage(fake);
      }
    }
  };

  const suggestions = [
    "How do I access my enrolled courses?",
    "What should I study this week?",
    "Explain Module 1 in simple terms.",
    "Where can I find my certificates?",
    "How do I reset my password?",
  ];

  return (
    <>
      {/* Floating robot button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-50 rounded-full bg-sky-600 text-white shadow-lg hover:bg-sky-700 transition p-3"
        aria-label={open ? "Close chat" : "Open chat"}
        title="Plex Courses Assistant"
      >
        <RobotIcon className="h-6 w-6" />
      </button>

      {open && (
        <div className="fixed bottom-20 right-5 z-50 w-[22rem] sm:w-[26rem] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-sky-50 to-indigo-50">
            <div className="h-9 w-9 rounded-full bg-sky-600 flex items-center justify-center text-white shadow">
              <RobotIcon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-slate-900">Plex Courses Assistant</div>
              <div className="text-xs text-slate-500">Here to help with courses, schedules, and more</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
              aria-label="Close"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Loader */}
          {!ready && (
            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-600 border-t-transparent" />
                <span>{progressText}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 animate-gradient-x transition-[width] duration-300"
                  style={{ width: `${Math.max(5, Math.min(100, progressPct ?? 8))}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500">Runs locally in your browser • Free to use</div>
            </div>
          )}

          {/* Messages */}
          <div ref={listRef} className="px-3 pt-3 pb-2 space-y-3 overflow-y-auto" style={{ maxHeight: 360 }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} items-end gap-2`}>
                {m.role === "assistant" && (
                  <div className="h-7 w-7 rounded-full bg-sky-600 flex items-center justify-center text-white shadow">
                    <RobotIcon className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-3.5 py-2 text-sm shadow ${
                    m.role === "user"
                      ? "bg-sky-600 text-white max-w-[80%]"
                      : "bg-slate-100 text-slate-800 max-w-[85%]"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {ready && genLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500 pl-1">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                Assistant is typing…
              </div>
            )}

            {/* Suggestions (only when ready and conversation short) */}
            {ready && messages.length <= 2 && (
              <div className="pt-1 pb-2">
                <div className="text-xs text-slate-500 mb-2 px-1">Try asking:</div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="text-xs rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Composer */}
          <form onSubmit={sendMessage} className="border-t border-slate-200 p-2 flex gap-2 items-center">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={ready ? "Ask about your course, schedule, modules…" : "Loading local model…"}
              disabled={!ready}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-sky-100 focus:border-sky-500 disabled:bg-slate-100"
            />
            <button
              type="submit"
              disabled={genLoading || !input.trim() || !ready}
              className="rounded-md bg-sky-600 text-white px-3 py-2 text-sm font-semibold hover:bg-sky-700 disabled:bg-sky-400 flex items-center gap-2"
            >
              <SendIcon className="h-4 w-4" />
              Send
            </button>
          </form>
        </div>
      )}

      {/* Smooth gradient animation */}
      <style jsx global>{`
        @keyframes gradient-x {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .animate-gradient-x {
          background-size: 200% 100%;
          animation: gradient-x 2s linear infinite;
        }
      `}</style>
    </>
  );
}

/* ================== Icons ================== */

function RobotIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2a1 1 0 011 1v2h5a2 2 0 012 2v7a5 5 0 01-5 5H9a5 5 0 01-5-5V7a2 2 0 012-2h5V3a1 1 0 011-1zm-3 8a1 1 0 100-2 1 1 0 000 2zm6 0a1 1 0 100-2 1 1 0 000 2z" />
    </svg>
  );
}
function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M2.94 2.94a.75.75 0 01.82-.17l13.5 5.4a.75.75 0 010 1.38l-13.5 5.4a.75.75 0 01-1.01-.89l1.72-6.02L2.25 8.1a.75.75 0 010-1.2l.69-.53-1.72-6.02a.75.75 0 01.72-.6z" />
    </svg>
  );
}