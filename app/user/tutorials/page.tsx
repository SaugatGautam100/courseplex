"use client";

import { useEffect, useMemo, useState, useCallback, type SVGProps } from "react";
import { database } from "@/lib/firebase";
import { ref as dbRef, onValue } from "firebase/database";

// ========== TYPES ==========
type Tutorial = {
  id: string;
  title: string;
  url: string;
  order?: number;
};
type TutorialsDb = Record<string, Omit<Tutorial, "id">>;

type VideoInfo =
  | { type: "youtube"; videoId: string; url: string }
  | { type: "direct"; url: string; ext?: string }
  | { type: "invalid" };

// ========== HELPERS ==========
function getYouTubeId(url: string): string | null {
  const regex =
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/ ]{11})/;
  const match = url?.match(regex);
  return match ? match[1] : null;
}

function getVideoInfo(url: string): VideoInfo {
  if (!url) return { type: "invalid" };
  const yt = getYouTubeId(url);
  if (yt) return { type: "youtube", videoId: yt, url };
  if (url.includes("firebasestorage.googleapis.com")) {
    const extMatch = url.match(/\.(mp4|mov|webm|mkv|m4v)(\?|$)/i);
    return { type: "direct", url, ext: extMatch?.[1]?.toUpperCase() };
  }
  return { type: "invalid" };
}

function getYouTubeThumb(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// ========== MAIN ==========
export default function TutorialsPage() {
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Tutorial | null>(null);

  useEffect(() => {
    const tutorialsRef = dbRef(database, "tutorials");
    const unsub = onValue(
      tutorialsRef,
      (snap) => {
        const data = (snap.val() as TutorialsDb | null) || {};
        const list: Tutorial[] = Object.entries(data)
          .map(([id, v]) => ({ id, ...v }))
          .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setTutorials(list);
        setLoading(false);
      },
      () => {
        setTutorials([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tutorials;
    return tutorials.filter((t) => t.title.toLowerCase().includes(q));
  }, [query, tutorials]);

  const openTutorial = useCallback((t: Tutorial) => setActive(t), []);
  const closeModal = useCallback(() => setActive(null), []);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <header className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-violet-50 p-6 shadow-sm">
        <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-sky-200/30 blur-2xl" />
        <div className="absolute -bottom-14 -left-10 h-56 w-56 rounded-full bg-fuchsia-200/30 blur-2xl" />
        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-sky-600 ring-1 ring-sky-100 backdrop-blur">
              <SparklesIcon className="h-4 w-4" /> New tutorials added regularly
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">
              Tutorials & Guides
            </h1>
            <p className="mt-1 text-slate-500">
              Learn the platform, sharpen your skills, and boost your results.
            </p>
          </div>
          <div className="mt-2 sm:mt-0 w-full sm:w-auto">
            <SearchBar value={query} onChange={setQuery} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="rounded-2xl border bg-white p-4 sm:p-6 shadow-sm">
        {loading ? (
          <SkeletonGrid />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={query ? "No matches found" : "No tutorials available"}
            subtitle={
              query
                ? "Try a different keyword."
                : "Please check back later. We're adding helpful guides for you."
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((t) => (
              <TutorialCard key={t.id} tutorial={t} onOpen={() => openTutorial(t)} />
            ))}
          </div>
        )}
      </main>

      {/* Modal Player */}
      {active && (
        <VideoModal tutorial={active} onClose={closeModal} onPrevNext={(dir) => {
          if (!active) return;
          const idx = filtered.findIndex((x) => x.id === active.id);
          if (idx < 0) return;
          const nextIdx = dir === "prev" ? (idx - 1 + filtered.length) % filtered.length : (idx + 1) % filtered.length;
          setActive(filtered[nextIdx]);
        }} />
      )}
    </div>
  );
}

// ========== COMPONENTS ==========
function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder="Search tutorials..."
        className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm text-slate-700 shadow-sm outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
      />
    </div>
  );
}

function TutorialCard({
  tutorial,
  onOpen,
}: {
  tutorial: Tutorial;
  onOpen: () => void;
}) {
  const info = getVideoInfo(tutorial.url);
  const isYouTube = info.type === "youtube";
  const thumb = isYouTube ? getYouTubeThumb((info as any).videoId) : null;
  const ext = info.type === "direct" ? info.ext : undefined;

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-video w-full overflow-hidden bg-slate-100">
        {/* Thumbnail */}
        {isYouTube && thumb ? (
          // Using img to avoid Next.js remote domain config issues
          <img
            src={thumb}
            alt={tutorial.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <FilmIcon className="h-10 w-10 text-slate-400" />
          </div>
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Play Button */}
        <button
          onClick={onOpen}
          className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-slate-900 shadow ring-1 ring-slate-200 transition hover:scale-105"
          aria-label={`Play ${tutorial.title}`}
        >
          <PlayIcon className="h-5 w-5 text-sky-600" />
          Watch
        </button>

        {/* Badge */}
        {typeof tutorial.order === "number" && (
          <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
            #{tutorial.order}
          </div>
        )}
        {ext && (
          <div className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white">
            {ext}
          </div>
        )}
      </div>

      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-slate-800">{tutorial.title}</h3>
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={onOpen}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700"
          >
            <PlayIcon className="h-4 w-4" />
            Play
          </button>
          <a
            href={tutorial.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700"
            title="Open source link"
          >
            <ExternalLinkIcon className="h-4 w-4" />
            Source
          </a>
        </div>
      </div>
    </div>
  );
}

function VideoModal({
  tutorial,
  onClose,
  onPrevNext,
}: {
  tutorial: Tutorial;
  onClose: () => void;
  onPrevNext: (dir: "prev" | "next") => void;
}) {
  const info = getVideoInfo(tutorial.url);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") onPrevNext("prev");
      if (e.key === "ArrowRight") onPrevNext("next");
    };
    document.addEventListener("keydown", onKey);
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = original;
    };
  }, [onClose, onPrevNext]);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      {/* Panel */}
      <div className="absolute inset-x-0 top-6 mx-auto w-[95%] max-w-5xl">
        <div className="relative overflow-hidden rounded-2xl border bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                <PlayIcon className="h-4 w-4" />
              </div>
              <h3 className="line-clamp-1 text-sm font-semibold text-slate-900">
                {tutorial.title}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onPrevNext("prev")}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                title="Previous"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Prev
              </button>
              <button
                onClick={() => onPrevNext("next")}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                title="Next"
              >
                Next
                <ChevronRightIcon className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
              >
                <CloseIcon className="h-4 w-4" />
                Close
              </button>
            </div>
          </div>

          <div className="bg-black">
            <div className="aspect-video w-full">
              {info.type === "youtube" && (
                <iframe
                  src={`https://www.youtube.com/embed/${info.videoId}?autoplay=1&rel=0`}
                  title={tutorial.title}
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="h-full w-full"
                />
              )}
              {info.type === "direct" && (
                <video
                  src={info.url}
                  controls
                  autoPlay
                  playsInline
                  className="h-full w-full object-contain bg-black"
                />
              )}
              {info.type === "invalid" && (
                <div className="flex h-full w-full items-center justify-center bg-red-50 text-red-600">
                  <AlertTriangleIcon className="mr-2 h-5 w-5" />
                  Video source not supported
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-3">
            <a
              href={tutorial.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              <ExternalLinkIcon className="h-4 w-4" />
              Open source link
            </a>
            <div className="text-xs text-slate-500">
              Tip: Use Left/Right arrow keys to switch videos, Esc to close
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400 ring-1 ring-slate-100">
        <VideoCameraSlashIcon className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-xl border bg-white shadow-sm"
        >
          <div className="aspect-video w-full bg-slate-100" />
          <div className="space-y-2 p-3">
            <div className="h-3 w-3/4 rounded bg-slate-100" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
            <div className="mt-3 h-7 w-20 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ========== ICONS ==========
function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path
        fillRule="evenodd"
        d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
        clipRule="evenodd"
      />
    </svg>
  );
}
function SparklesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" {...props}>
      <path strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904l-1.33 4.008a.563.563 0 01-1.066 0l-1.33-4.008a2.25 2.25 0 00-1.423-1.423l-4.008-1.33a.563.563 0 010-1.066l4.008-1.33a2.25 2.25 0 001.423-1.423l1.33-4.008a.563.563 0 011.066 0l1.33 4.008a2.25 2.25 0 001.423 1.423l4.008 1.33a.563.563 0 010 1.066l-4.008 1.33a2.25 2.25 0 00-1.423 1.423z" />
      <path strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M17.573 8.427l-.754 2.27a1.284 1.284 0 01-.811.811l-2.27.754a.321.321 0 000 .616l2.27.754c.376.125.686.435.811.812l.754 2.269a.321.321 0 00.616 0l.754-2.27c.125-.376.435-.686.812-.811l2.269-.754a.321.321 0 000-.616l-2.27-.754a1.284 1.284 0 01-.811-.811l-.754-2.27a.321.321 0 00-.616 0z" />
    </svg>
  );
}
function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M6.5 5.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}
function FilmIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" {...props}>
      <path strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 17h16M7 4v16M17 4v16" />
      <rect x="4" y="7" width="16" height="10" rx="2" ry="2" />
    </svg>
  );
}
function ExternalLinkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M12.293 2.293a1 1 0 011.414 0L19 7.586V9h-2V8.414l-4.293 4.293a1 1 0 11-1.414-1.414L15.586 7H14V5h1.414l-4.293-2.707a1 1 0 010-1.414z" />
      <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3h-2v3H5V7h3V5H5z" />
    </svg>
  );
}
function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" {...props}>
      <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" {...props}>
      <path d="M6.28 5.22a.75.75 0 10-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 001.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 10-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}
function VideoCameraSlashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" {...props}>
      <path strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75zM3 3l18 18" />
    </svg>
  );
}
function AlertTriangleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" {...props}>
      <path strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
      <circle cx="12" cy="16" r=".75" fill="currentColor" />
    </svg>
  );
}