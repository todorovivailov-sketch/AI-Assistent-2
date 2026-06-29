"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Phone,
  PhoneMissed,
  PhoneIncoming,
  Clock,
  CalendarPlus,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Send,
  MessageSquare,
  Sparkles
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import type { DashboardConversation } from "@/lib/dashboard/data";

interface CallCenterWorkspaceProps {
  conversations: DashboardConversation[];
}

const SMS_TEMPLATES = [
  {
    id: "address",
    label: "Изпрати адрес на локацията",
    text: "Здравейте! Адресът на нашия офис/локация е: гр. София, бул. „Черни връх“ №100. Очакваме Ви!",
  },
  {
    id: "reschedule",
    label: "Потвърждение на преместен час",
    text: "Здравейте! Часът Ви беше преместен успешно. Новият час е регистриран в системата. Очакваме Ви!",
  },
  {
    id: "more_info",
    label: "Запитване за допълнителна информация",
    text: "Здравейте! За да можем да Ви съдействаме по-добре, моля изпратете ни допълнителна информация или снимки на този номер.",
  },
];

interface TranscriptLine {
  time?: string;
  speaker: string;
  text: string;
}

function formatDuration(secs: number) {
  const minutes = Math.floor(secs / 60);
  const remainder = Math.floor(secs % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function isAgent(speaker: string) {
  const s = speaker.toLowerCase();
  return (
    s.includes("асистент") ||
    s.includes("рецепция") ||
    s.includes("agent") ||
    s.includes("assistant") ||
    s.includes("ai") ||
    s.includes("operator") ||
    s.includes("оператор")
  );
}

function formatDateTime(value: string) {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "Неизвестна дата";
    return new Intl.DateTimeFormat("bg-BG", {
      timeZone: "Europe/Sofia",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return "Неизвестна дата";
  }
}

// Simple seed-based pseudo random generator for consistent call waveforms
function getWaveformBars(callId: string) {
  let seed = 0;
  for (let i = 0; i < callId.length; i++) {
    seed += callId.charCodeAt(i);
  }
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };
  
  return Array.from({ length: 48 }, () => {
    return Math.floor(random() * 65) + 15; // height from 15% to 80%
  });
}

function parseTranscript(text: string | null, fallbackLines: TranscriptLine[]): TranscriptLine[] {
  if (!text) {
    return fallbackLines;
  }
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const parsed: TranscriptLine[] = [];
  
  for (const line of lines) {
    // Matches: [00:03] Асистент: Здравейте / 00:03 Асистент: Здравейте / Асистент: Здравейте
    const regex = /^(?:\[?([\d:]+)\]?\s+)?([^:]+):\s*(.*)$/;
    const match = line.match(regex);
    if (match) {
      parsed.push({
        time: match[1] || undefined,
        speaker: match[2].trim(),
        text: match[3].trim()
      });
    } else {
      if (parsed.length > 0) {
        parsed[parsed.length - 1].text += "\n" + line;
      } else {
        parsed.push({
          speaker: "Инфо",
          text: line
        });
      }
    }
  }
  return parsed;
}

function getFallbackTranscript(call: DashboardConversation): TranscriptLine[] {
  const service = call.serviceType || "обща консултация";
  const outcome = call.outcome;
  
  if (outcome === "appointment" || outcome === "booked" || outcome === "confirmed") {
    return [
      { speaker: "Асистент", text: "Здравейте! Благодаря, че се обадихте. С какво мога да Ви помогна днес?" },
      { speaker: "Клиент", text: `Здравейте, искам да запиша час за ${service}.` },
      { speaker: "Асистент", text: `Разбира се, имаме свободни часове за ${service} тази седмица. Кой ден би бил най-удобен за Вас?` },
      { speaker: "Клиент", text: "Сряда следобед или четвъртък сутрин, ако е възможно." },
      { speaker: "Асистент", text: "Имаме свободен час за сряда от 14:30 или четвъртък от 09:00 часа. Кой от двата предпочитате?" },
      { speaker: "Клиент", text: "Сряда от 14:30 е супер." },
      { speaker: "Асистент", text: "Чудесно! Записах Ви за сряда от 14:30 часа. Ще получите потвърдителен SMS." },
      { speaker: "Клиент", text: "Благодаря Ви много, лек ден!" },
      { speaker: "Асистент", text: "Лек и приятен ден и на Вас!" }
    ];
  } else if (outcome === "emergency" || outcome === "urgent") {
    return [
      { speaker: "Асистент", text: "Аварийна линия. Какъв е проблемът?" },
      { speaker: "Клиент", text: `Здравейте, имаме спешна нужда от съдействие за ${service}! Имаме сериозна авария.` },
      { speaker: "Асистент", text: "Напълно разбирам. Къде се намирате и има ли опасност от големи материални щети?" },
      { speaker: "Клиент", text: "В Лозенец сме, водата тече бързо по пода." },
      { speaker: "Асистент", text: "Разбрано. Моля затворете главния спирателен кран веднага. Изпращам авариен екип към Вас, ще са при Вас след 20-30 минути." },
      { speaker: "Клиент", text: "Добре, правя го. Благодаря за бързата реакция." },
      { speaker: "Асистент", text: "Моля. Екипът пътува." }
    ];
  } else if (outcome === "missed" || outcome === "no_answer" || outcome === "failed_booking") {
    return [
      { speaker: "Клиент", text: "Здравейте, опитвам се да се свържа с вас..." },
      { speaker: "Асистент", text: "Здравейте! За съжаление разговорът прекъсна неочаквано. С какво можем да Ви помогнем?" }
    ];
  } else {
    return [
      { speaker: "Асистент", text: "Здравейте! С какво можем да Ви помогнем днес?" },
      { speaker: "Клиент", text: `Здравейте, обаждам се за информация относно цените за ${service}.` },
      { speaker: "Асистент", text: `Цените за ${service} варират спрямо спецификата на обекта. Искате ли да Ви свържем със специалист за консултация?` },
      { speaker: "Клиент", text: "Да, може ли да ми изпратите и линк с ценоразписа по SMS?" },
      { speaker: "Асистент", text: "Разбира се, изпращам ценоразписа веднага на този номер." },
      { speaker: "Клиент", text: "Благодаря Ви!" }
    ];
  }
}

interface CallDetailsPanelProps {
  call: DashboardConversation;
}

function CallDetailsPanel({ call }: CallDetailsPanelProps) {
  // Audio Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [duration, setDuration] = useState(call.durationSeconds || 120);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Pause audio on unmount
  useEffect(() => {
    const currentAudio = audioRef.current;
    return () => {
      if (currentAudio) {
        currentAudio.pause();
      }
    };
  }, []);

  // Playback timer simulation (fallback when recordingUrl is not set)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isPlaying && !call.recordingUrl) {
      interval = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return duration;
          }
          return Math.min(duration, prev + 0.1 * speed);
        });
      }, 100);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, speed, duration, call.recordingUrl]);

  // Sync audio element state
  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || call.durationSeconds || 120);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const togglePlay = () => {
    const nextPlay = !isPlaying;
    setIsPlaying(nextPlay);

    if (call.recordingUrl && audioRef.current) {
      if (nextPlay) {
        audioRef.current.play().catch((err) => console.log("Audio play blocked", err));
      } else {
        audioRef.current.pause();
      }
    }
  };

  const cycleSpeed = () => {
    let nextSpeed = 1;
    if (speed === 1) nextSpeed = 1.5;
    else if (speed === 1.5) nextSpeed = 2;
    else nextSpeed = 1;

    setSpeed(nextSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed;
    }
  };

  const toggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (audioRef.current) {
      audioRef.current.muted = nextMute;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;
    setCurrentTime(newTime);
    if (audioRef.current && call.recordingUrl) {
      audioRef.current.currentTime = newTime;
    }
  };

  // SMS Template console state
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [smsText, setSmsText] = useState("");

  const handleTemplateChange = (id: string) => {
    setSelectedTemplateId(id);
    const template = SMS_TEMPLATES.find((t) => t.id === id);
    if (template) {
      setSmsText(template.text);
    } else {
      setSmsText("");
    }
  };

  const handleSendSms = () => {
    if (!smsText.trim()) {
      alert("Моля, въведете съобщение.");
      return;
    }
    const phone = call.callerNumber || call.caller;
    alert(`Съобщението е изпратено успешно по SMS до ${phone}`);
    // Clear template form
    setSelectedTemplateId("");
    setSmsText("");
  };

  // Generate waveform bars for the current selected call
  const waveformBars = useMemo(() => {
    return getWaveformBars(call.id);
  }, [call.id]);

  // Parse or fallback transcript
  const transcriptLines = useMemo(() => {
    return parseTranscript(call.transcriptText, getFallbackTranscript(call));
  }, [call]);



  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Hidden audio element for real playback */}
      {call.recordingUrl && (
        <audio
          ref={audioRef}
          src={call.recordingUrl}
          onTimeUpdate={handleAudioTimeUpdate}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onEnded={handleAudioEnded}
        />
      )}

      {/* Header */}
      <div className="p-4 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-4 bg-[var(--surface-muted)]/10">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base truncate">
              {call.customerName || "Неизвестен клиент"}
            </h3>
            <StatusBadge value={call.outcome} />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--ink-soft)] font-mono">
            <span>{call.callerNumber || call.caller}</span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{formatDuration(call.durationSeconds || 0)}</span>
            </div>
          </div>
        </div>

        {call.outcome !== "appointment" && (
          <Link
            href="/appointments"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white px-3 text-sm font-medium transition-colors shadow-sm outline-none shrink-0"
          >
            <CalendarPlus className="h-4 w-4" />
            Нов час
          </Link>
        )}
      </div>

      {/* Scrollable details wrapper */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Audio Player Simulator */}
        <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/20 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Пауза" : "Възпроизвеждане"}
                className="w-10 h-10 rounded-full bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white flex items-center justify-center transition-transform hover:scale-105 shadow-sm outline-none cursor-pointer"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>

              <button
                onClick={cycleSpeed}
                aria-label="Скорост на възпроизвеждане"
                className="px-2.5 py-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-xs font-mono font-medium hover:bg-[var(--surface-muted)] transition-colors outline-none cursor-pointer"
              >
                {speed}x
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                aria-label={isMuted ? "Включи звука" : "Спри звука"}
                className="p-1.5 rounded-lg text-[var(--ink-soft)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors outline-none cursor-pointer"
              >
                {isMuted ? <VolumeX className="h-4.5 w-4.5" /> : <Volume2 className="h-4.5 w-4.5" />}
              </button>
              <span className="text-xs font-mono text-[var(--ink-soft)]">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* Timeline track / Waveform simulator */}
          <div
            onClick={handleTimelineClick}
            className="flex items-center gap-0.5 h-12 w-full cursor-pointer relative bg-[var(--surface)] rounded-lg p-2 border border-[var(--line)] overflow-hidden"
          >
            {waveformBars.map((height, i) => {
              const barProgress = (i / waveformBars.length) * 100;
              const currentProgress = (currentTime / duration) * 100;
              const isActive = barProgress <= currentProgress;
              return (
                <div
                  key={i}
                  className="w-1 rounded-full transition-all duration-75 flex-1"
                  style={{
                    height: `${height}%`,
                    backgroundColor: isActive ? "var(--accent)" : "var(--line)",
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* AI Summary */}
        <div>
          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            AI Резюме
          </h4>
          <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-sm leading-relaxed text-[var(--foreground)] shadow-xs">
            {call.summary || call.summaryPreview}
          </div>
        </div>

        {/* AI Transcript */}
        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Разговор в реално време
          </h4>
          <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)]/30 space-y-4 max-h-[350px] overflow-y-auto">
            {transcriptLines.map((line, idx) => {
              const agent = isAgent(line.speaker);
              return (
                <div key={idx} className={`flex flex-col ${agent ? "items-end" : "items-start"} w-full`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-xs leading-relaxed ${
                      agent
                        ? "bg-teal-700 dark:bg-teal-800 text-white rounded-tr-none"
                        : "bg-[var(--surface)] border border-[var(--line)] text-[var(--foreground)] rounded-tl-none"
                    }`}
                  >
                    <p className="whitespace-pre-line">{line.text}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1 text-[10px] text-[var(--ink-soft)] font-mono">
                    <span className="font-semibold">{line.speaker}</span>
                    {line.time && (
                      <>
                        <span>•</span>
                        <span>{line.time}</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SMS/Viber Console */}
        <div className="border-t border-[var(--line)] pt-5">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Send className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            Последващ SMS / Viber
          </h4>
          <div className="space-y-3">
            <div>
              <span className="block text-xs font-medium text-[var(--ink-soft)] mb-2">Бързи шаблони</span>
              <div className="flex flex-wrap gap-2">
                {SMS_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateChange(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-all duration-200 cursor-pointer active:scale-95 ${
                      selectedTemplateId === t.id
                        ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                        : "bg-[var(--surface)] text-[var(--ink-soft)] border-[var(--line)] hover:border-teal-500/50 hover:text-teal-700 dark:hover:text-teal-300"
                    }`}
                  >
                    <MessageSquare size={12} />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="sms-message-input" className="block text-xs font-medium text-[var(--ink-soft)] mb-1">Съобщение</label>
              <textarea
                id="sms-message-input"
                rows={3}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="Въведете текст на съобщението..."
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] text-sm p-3 focus:outline-none focus:ring-1 focus:ring-teal-500 text-[var(--foreground)] leading-relaxed resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSendSms}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white px-4 text-sm font-medium transition-colors shadow-sm outline-none cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                Изпрати съобщение
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CallCenterWorkspace({ conversations }: CallCenterWorkspaceProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all"); // all, urgent, missed, recorded

  // Sync selected call with URL query parameter locally to prevent network lag on reload
  const selectedIdFromUrl = searchParams.get("call");
  const [selectedCallId, setSelectedCallId] = useState<string | null>(selectedIdFromUrl);
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(selectedIdFromUrl);

  if (selectedIdFromUrl !== prevSelectedId) {
    setSelectedCallId(selectedIdFromUrl);
    setPrevSelectedId(selectedIdFromUrl);
  }

  const selectedCall = useMemo(() => {
    if (!selectedCallId) return null;
    return conversations.find((c) => c.id === selectedCallId) || null;
  }, [selectedCallId, conversations]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((call) => {
      // 1. Search filter
      const searchLower = searchQuery.toLowerCase();
      const nameMatch = call.customerName?.toLowerCase().includes(searchLower) || false;
      const phoneMatch = call.callerNumber?.includes(searchLower) || call.caller.includes(searchLower) || false;
      if (searchQuery && !nameMatch && !phoneMatch) return false;

      // 2. Tab category filter
      if (activeTab === "urgent") {
        return (
          call.outcome === "urgent" ||
          call.outcome === "emergency" ||
          call.outcome === "high" ||
          call.outcome === "attention" ||
          call.disposition === "emergency" ||
          call.disposition === "urgent"
        );
      }
      if (activeTab === "missed") {
        return call.status === "missed" || call.status === "no_answer" || call.status === "failed";
      }
      if (activeTab === "recorded") {
        return !!call.recordingUrl;
      }

      return true;
    });
  }, [conversations, searchQuery, activeTab]);

  const selectCall = (call: DashboardConversation) => {
    setSelectedCallId(call.id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("call", call.id);
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  };

  return (
    <div className="grid grid-cols-1 gap-0 lg:grid-cols-[380px_auto_1fr] h-[calc(100vh-170px)] min-h-[600px]">
      {/* LEFT COLUMN: Call List */}
      <div className="flex flex-col h-full rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-sm overflow-hidden">
        {/* Search Header */}
        <div className="p-4 border-b border-[var(--line)] flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--ink-soft)]" />
            <input
              type="text"
              placeholder="Търсене по клиент или телефон..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] focus:outline-none focus:ring-1 focus:ring-teal-500 focus:bg-[var(--surface)] text-[var(--foreground)]"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex border-b border-[var(--line)] bg-[var(--surface-muted)] p-1 gap-1">
          {[
            { id: "all", label: "Всички" },
            { id: "urgent", label: "Спешни" },
            { id: "missed", label: "Пропуснати" },
            { id: "recorded", label: "Записани" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 text-center py-1.5 text-xs font-medium rounded-md transition-all duration-150 outline-none cursor-pointer ${
                activeTab === tab.id
                  ? "bg-[var(--surface)] text-teal-700 dark:text-teal-300 shadow-sm border border-[var(--line)]/50"
                  : "text-[var(--ink-soft)] hover:text-[var(--foreground)] hover:bg-[var(--surface)]/50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--line)]">
          {filteredConversations.map((call) => {
            const isSelected = selectedCall?.id === call.id;
            const hasRecording = !!call.recordingUrl;
            const isUrgent =
              call.outcome === "urgent" ||
              call.outcome === "emergency" ||
              call.outcome === "high" ||
              call.outcome === "attention";
            const isMissed = call.status === "missed" || call.status === "no_answer" || call.status === "failed";

            const borderLeftColor = isSelected
              ? "border-l-teal-600 bg-teal-50/20 dark:bg-teal-950/15"
              : isUrgent
              ? "border-l-red-500 hover:bg-[var(--surface-muted)]/50"
              : "border-l-transparent hover:bg-[var(--surface-muted)]/50";

            return (
              <button
                key={call.id}
                onClick={() => selectCall(call)}
                className={`w-full text-left p-4 transition-all duration-150 flex flex-col gap-2 relative outline-none border-l-4 ${borderLeftColor} cursor-pointer`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div className="flex items-center gap-2">
                    {isMissed ? (
                      <PhoneMissed className="h-4 w-4 text-red-500 shrink-0" />
                    ) : (
                      <PhoneIncoming className="h-4 w-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    )}
                    <span className="font-semibold text-sm truncate">{call.customerName || call.caller}</span>
                  </div>
                  <span className="font-mono text-xs text-[var(--ink-soft)] shrink-0">
                    {formatDateTime(call.startedAt || call.createdAt)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-[var(--ink-soft)]">{call.callerNumber || call.caller}</span>
                  <div className="flex items-center gap-1.5">
                    {hasRecording && (
                      <span className="inline-flex items-center rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-[10px] font-mono text-[var(--ink-soft)]">
                        REC
                      </span>
                    )}
                    <StatusBadge value={call.outcome} />
                  </div>
                </div>

                <p className="text-xs text-[var(--ink-soft)] line-clamp-2 mt-0.5 leading-relaxed">
                  {call.summaryPreview}
                </p>
              </button>
            );
          })}

          {filteredConversations.length === 0 && (
            <div className="p-8 text-center text-sm text-[var(--ink-soft)]">
              Няма разговори по избраните критерии.
            </div>
          )}
        </div>
      </div>

      {/* Gradient Divider */}
      <div className="hidden lg:block w-px bg-gradient-to-b from-transparent via-[var(--line)] to-transparent" />

      {/* RIGHT COLUMN: Details Workspace */}
      <div className="flex flex-col h-full rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-sm overflow-hidden">
        {!selectedCall ? (
          /* Placeholder state */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--surface-muted)]/30">
            <div className="w-16 h-16 rounded-full bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center mb-4 text-teal-600 dark:text-teal-400 border border-teal-100 dark:border-teal-900/50">
              <Phone className="h-8 w-8 animate-pulse" />
            </div>
            <h3 className="text-base font-semibold mb-2">Изберете разговор</h3>
            <p className="text-sm text-[var(--ink-soft)] max-w-md leading-relaxed">
              Изберете разговор от списъка вляво, за да прослушате записа, прегледате резюмето и изпратите последващо
              съобщение.
            </p>
          </div>
        ) : (
          /* Active Call Center Workspace Details */
          <CallDetailsPanel key={selectedCall.id} call={selectedCall} />
        )}
      </div>
    </div>
  );
}
