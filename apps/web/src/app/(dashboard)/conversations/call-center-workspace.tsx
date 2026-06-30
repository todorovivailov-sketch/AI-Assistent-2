"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarPlus,
  MessageSquare,
  Pause,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  Play,
  Search,
  Send,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import type { DashboardConversation } from "@/lib/dashboard/data";

type CallCenterWorkspaceProps = {
  conversations: DashboardConversation[];
};

type TranscriptLine = {
  time?: string;
  speaker: string;
  text: string;
};

const smsTemplates = [
  {
    id: "confirm",
    label: "Потвърждение",
    text: "Здравейте! Потвърждаваме Вашия час. При промяна ще се свържем с Вас своевременно.",
  },
  {
    id: "details",
    label: "Искане на детайли",
    text: "Здравейте! За да подготвим посещението, моля изпратете кратко описание и удобен адрес.",
  },
  {
    id: "callback",
    label: "Обратно обаждане",
    text: "Здравейте! Опитахме да се свържем с Вас. Моля върнете обаждане, когато Ви е удобно.",
  },
];

const tabs = [
  { id: "all", label: "Всички" },
  { id: "urgent", label: "Спешни" },
  { id: "missed", label: "Пропуснати" },
  { id: "recorded", label: "Със запис" },
];

function formatDuration(secs: number) {
  const minutes = Math.floor(secs / 60);
  const remainder = Math.floor(secs % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Няма дата";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Няма дата";

  return new Intl.DateTimeFormat("bg-BG", {
    timeZone: "Europe/Sofia",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isAssistantSpeaker(speaker: string) {
  const normalized = speaker.toLowerCase();
  return (
    normalized.includes("асистент") ||
    normalized.includes("рецепция") ||
    normalized.includes("assistant") ||
    normalized.includes("agent") ||
    normalized.includes("operator") ||
    normalized.includes("ai")
  );
}

function waveformFor(id: string) {
  let seed = 0;
  for (let index = 0; index < id.length; index += 1) seed += id.charCodeAt(index);

  return Array.from({ length: 52 }, () => {
    const x = Math.sin(seed++) * 10000;
    return Math.floor((x - Math.floor(x)) * 62) + 18;
  });
}

function parseTranscript(text: string | null, fallbackLines: TranscriptLine[]): TranscriptLine[] {
  if (!text) return fallbackLines;

  const parsed: TranscriptLine[] = [];
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(?:\[?([\d:]+)\]?\s+)?([^:]+):\s*(.*)$/);
    if (match) {
      parsed.push({
        time: match[1] || undefined,
        speaker: match[2].trim(),
        text: match[3].trim(),
      });
    } else if (parsed.length > 0) {
      parsed[parsed.length - 1].text += `\n${line}`;
    } else {
      parsed.push({ speaker: "Инфо", text: line });
    }
  }

  return parsed.length > 0 ? parsed : fallbackLines;
}

function getFallbackTranscript(call: DashboardConversation): TranscriptLine[] {
  const service = call.serviceType || "консултация";

  if (["appointment", "booked", "confirmed"].includes(call.outcome)) {
    return [
      { speaker: "Асистент", text: "Здравейте! С какво мога да съдействам?" },
      { speaker: "Клиент", text: `Искам да запазя час за ${service}.` },
      { speaker: "Асистент", text: "Разбирам. Кой ден и в колко часа Ви е удобно?" },
      { speaker: "Клиент", text: "Удобно ми е следобед." },
      { speaker: "Асистент", text: "Проверявам календара. Има свободен час, който мога да потвърдя." },
      { speaker: "Клиент", text: "Да, устройва ме." },
      { speaker: "Асистент", text: "Записах часа. Има ли още нещо, с което мога да съдействам?" },
      { speaker: "Клиент", text: "Не, благодаря." },
      { speaker: "Асистент", text: "Дочуване и приятен ден!" },
    ];
  }

  if (["urgent", "emergency", "high"].includes(call.outcome)) {
    return [
      { speaker: "Асистент", text: "Здравейте. Опишете накратко ситуацията, за да преценим спешността." },
      { speaker: "Клиент", text: `Имам спешна нужда от съдействие за ${service}.` },
      { speaker: "Асистент", text: "Разбирам. Ще маркирам разговора като приоритетен и ще го предам към екипа." },
    ];
  }

  return [
    { speaker: "Асистент", text: "Здравейте! Как мога да помогна?" },
    { speaker: "Клиент", text: `Искам информация за ${service}.` },
    { speaker: "Асистент", text: "Разбирам. Ще запиша заявката и при нужда ще Ви свържем със специалист." },
  ];
}

function isUrgentCall(call: DashboardConversation) {
  return (
    ["urgent", "emergency", "high", "attention"].includes(call.outcome) ||
    call.disposition === "urgent" ||
    call.disposition === "emergency"
  );
}

function isMissedCall(call: DashboardConversation) {
  return ["missed", "no_answer", "failed"].includes(call.status ?? "");
}

function CallDetailsPanel({ call }: { call: DashboardConversation }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(call.durationSeconds || 120);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [smsText, setSmsText] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
  }, []);

  useEffect(() => {
    if (!isPlaying || call.recordingUrl) return;

    const interval = window.setInterval(() => {
      setCurrentTime((prev) => {
        if (prev >= duration) {
          setIsPlaying(false);
          return duration;
        }
        return Math.min(duration, prev + 0.1 * speed);
      });
    }, 100);

    return () => window.clearInterval(interval);
  }, [call.recordingUrl, duration, isPlaying, speed]);

  const waveform = useMemo(() => waveformFor(call.id), [call.id]);
  const transcriptLines = useMemo(() => parseTranscript(call.transcriptText, getFallbackTranscript(call)), [call]);

  const togglePlay = () => {
    const shouldPlay = !isPlaying;
    setIsPlaying(shouldPlay);

    if (!call.recordingUrl || !audioRef.current) return;
    if (shouldPlay) {
      audioRef.current.play().catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
    }
  };

  const cycleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) audioRef.current.muted = nextMute;
  };

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const newTime = ((event.clientX - rect.left) / rect.width) * duration;
    setCurrentTime(newTime);
    if (audioRef.current && call.recordingUrl) audioRef.current.currentTime = newTime;
  };

  const handleTemplateChange = (id: string) => {
    const template = smsTemplates.find((item) => item.id === id);
    setSelectedTemplateId(id);
    setSmsText(template?.text ?? "");
  };

  const handleSendSms = () => {
    if (!smsText.trim()) {
      alert("Моля, въведете съобщение.");
      return;
    }

    alert(`Съобщението е подготвено за ${call.callerNumber || call.caller}.`);
    setSelectedTemplateId("");
    setSmsText("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {call.recordingUrl ? (
        <audio
          ref={audioRef}
          src={call.recordingUrl}
          onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || call.durationSeconds || 120)}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
        />
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] bg-[var(--surface)] px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold">{call.customerName || "Неизвестен клиент"}</h3>
            <StatusBadge value={call.outcome} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-[var(--ink-soft)]">
            <span>{call.callerNumber || call.caller}</span>
            <span>/</span>
            <span>{formatDuration(call.durationSeconds || 0)}</span>
            <span>/</span>
            <span>{formatDateTime(call.startedAt || call.createdAt)}</span>
          </div>
        </div>

        {call.outcome !== "appointment" ? (
          <Link
            href="/appointments"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-3 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
          >
            <CalendarPlus size={16} />
            Нов час
          </Link>
        ) : null}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        <section className="rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Пауза" : "Възпроизвеждане"}
                className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--accent-strong)] text-white"
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>
              <button
                onClick={cycleSpeed}
                className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs font-semibold"
              >
                {speed}x
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                aria-label={isMuted ? "Включи звук" : "Спри звук"}
                className="rounded-md p-2 text-[var(--ink-soft)] transition hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
              >
                {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <span className="font-mono text-xs text-[var(--ink-soft)]">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </span>
            </div>
          </div>

          <div
            onClick={handleTimelineClick}
            className="flex h-12 cursor-pointer items-center gap-0.5 rounded-md border border-[var(--line)] bg-[var(--surface)] p-2"
          >
            {waveform.map((height, index) => {
              const active = index / waveform.length <= currentTime / duration;
              return (
                <div
                  key={index}
                  className="flex-1 rounded-full"
                  style={{
                    height: `${height}%`,
                    backgroundColor: active ? "var(--accent-strong)" : "var(--line)",
                  }}
                />
              );
            })}
          </div>
        </section>

        <section>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Sparkles size={16} className="text-[var(--accent-strong)]" />
            AI резюме
          </h4>
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm leading-relaxed">
            {call.summary || call.summaryPreview}
          </div>
        </section>

        <section>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <MessageSquare size={16} className="text-[var(--accent-strong)]" />
            Транскрипция
          </h4>
          <div className="max-h-[360px] space-y-3 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] p-4">
            {transcriptLines.map((line, index) => {
              const assistant = isAssistantSpeaker(line.speaker);
              return (
                <div key={index} className={`flex ${assistant ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[86%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      assistant
                        ? "bg-[var(--foreground)] text-[var(--background)]"
                        : "border border-[var(--line)] bg-[var(--surface)]"
                    }`}
                  >
                    <div className="mb-1 flex gap-2 font-mono text-[10px] uppercase tracking-[0.08em] opacity-70">
                      <span>{line.speaker}</span>
                      {line.time ? <span>{line.time}</span> : null}
                    </div>
                    <p className="whitespace-pre-line">{line.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border-t border-[var(--line)] pt-5">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Send size={16} className="text-[var(--accent-strong)]" />
            Последващо съобщение
          </h4>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {smsTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateChange(template.id)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                    selectedTemplateId === template.id
                      ? "border-[var(--accent-strong)] bg-[var(--surface-soft)] text-[var(--accent-strong)]"
                      : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {template.label}
                </button>
              ))}
            </div>
            <textarea
              rows={3}
              value={smsText}
              onChange={(event) => setSmsText(event.target.value)}
              placeholder="Въведете текст на съобщението..."
              className="w-full resize-none rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 text-sm outline-none transition focus:border-[var(--accent-strong)]"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSendSms}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--foreground)] px-4 text-sm font-semibold text-[var(--background)] transition hover:opacity-90"
              >
                <Send size={15} />
                Изпрати
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function CallCenterWorkspace({ conversations }: CallCenterWorkspaceProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const selectedIdFromUrl = searchParams.get("call");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(selectedIdFromUrl);
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(selectedIdFromUrl);

  if (selectedIdFromUrl !== prevSelectedId) {
    setSelectedCallId(selectedIdFromUrl);
    setPrevSelectedId(selectedIdFromUrl);
  }

  const selectedCall = useMemo(() => {
    if (!selectedCallId) return null;
    return conversations.find((conversation) => conversation.id === selectedCallId) ?? null;
  }, [conversations, selectedCallId]);

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return conversations.filter((call) => {
      const matchesSearch =
        !query ||
        call.customerName?.toLowerCase().includes(query) ||
        call.callerNumber?.includes(query) ||
        call.caller.includes(query);

      if (!matchesSearch) return false;
      if (activeTab === "urgent") return isUrgentCall(call);
      if (activeTab === "missed") return isMissedCall(call);
      if (activeTab === "recorded") return Boolean(call.recordingUrl);

      return true;
    });
  }, [activeTab, conversations, searchQuery]);

  const selectCall = (call: DashboardConversation) => {
    setSelectedCallId(call.id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("call", call.id);
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  };

  return (
    <div className="grid min-h-[620px] grid-cols-1 gap-4 lg:h-[calc(100vh-170px)] lg:grid-cols-[380px_1fr]">
      <aside className="syn-card flex min-h-0 flex-col overflow-hidden">
        <div className="border-b border-[var(--line)] p-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-[var(--ink-soft)]" />
            <input
              type="text"
              placeholder="Търсене по клиент или телефон..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 w-full rounded-md border border-[var(--line)] bg-[var(--surface-muted)] pl-9 pr-3 text-sm outline-none transition focus:border-[var(--accent-strong)] focus:bg-[var(--surface)]"
            />
          </div>
        </div>

        <div className="flex gap-1 border-b border-[var(--line)] bg-[var(--surface-muted)] p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`h-8 flex-1 rounded-md text-xs font-semibold transition ${
                activeTab === tab.id
                  ? "border border-[var(--line)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface)]/70 hover:text-[var(--foreground)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-[var(--line)]">
          {filteredConversations.map((call) => {
            const selected = selectedCall?.id === call.id;
            const urgent = isUrgentCall(call);
            const missed = isMissedCall(call);

            return (
              <button
                key={call.id}
                onClick={() => selectCall(call)}
                className={`w-full border-l-4 p-4 text-left transition ${
                  selected
                    ? "border-l-[var(--accent-strong)] bg-[var(--surface-soft)]"
                    : urgent
                    ? "border-l-red-500 hover:bg-[var(--surface-muted)]"
                    : "border-l-transparent hover:bg-[var(--surface-muted)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {missed ? (
                      <PhoneMissed size={16} className="shrink-0 text-red-500" />
                    ) : (
                      <PhoneIncoming size={16} className="shrink-0 text-[var(--accent-strong)]" />
                    )}
                    <span className="truncate text-sm font-semibold">{call.customerName || call.caller}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-[var(--ink-soft)]">
                    {formatDateTime(call.startedAt || call.createdAt)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs text-[var(--ink-soft)]">{call.callerNumber || call.caller}</span>
                  <StatusBadge value={call.outcome} />
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--ink-soft)]">{call.summaryPreview}</p>
              </button>
            );
          })}

          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--ink-soft)]">Няма разговори по избраните критерии.</div>
          ) : null}
        </div>
      </aside>

      <section className="syn-card min-h-0 overflow-hidden">
        {selectedCall ? (
          <CallDetailsPanel key={selectedCall.id} call={selectedCall} />
        ) : (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center p-8 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] text-[var(--accent-strong)]">
              <Phone size={26} />
            </div>
            <h3 className="text-base font-semibold">Изберете разговор</h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--ink-soft)]">
              Отворете разговор от списъка, за да прослушате записа, да видите резюмето и да изпратите последващо
              съобщение.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
