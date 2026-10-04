"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const STAGES = [
  "Detecting hand",
  "Tracking landmarks",
  "Measuring thumb-index distance",
  "Counting taps",
] as const;

// Uneven on purpose, so the pass does not tick like a metronome.
// About 6.5 seconds altogether.
const STAGE_MS = [900, 2400, 1900, 1300] as const;

const ANALYSIS_MS = STAGE_MS.reduce((sum, ms) => sum + ms, 0);

const STAGE_ENDS = STAGE_MS.reduce<number[]>((ends, ms) => {
  ends.push((ends.at(-1) ?? 0) + ms);
  return ends;
}, []);

const formatBytes = (bytes: number) => {
  if (bytes < 1000) return `${bytes} bytes`;

  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1000;
  let unit = 0;

  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }

  const digits = value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unit]}`;
};

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "FILE";
  return name.slice(dot + 1).toUpperCase();
};

export default function UploadPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const finishedRef = useRef(false);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    router.prefetch("/analysis");
  }, [router]);

  useEffect(() => {
    if (!analyzing) return;

    finishedRef.current = false;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / ANALYSIS_MS);
      setProgress(next);

      if (next >= 1) {
        if (!finishedRef.current) {
          finishedRef.current = true;
          router.push("/analysis");
        }
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [analyzing, router]);

  const takeFile = (next: File | undefined) => {
    if (!next || analyzing) return;
    setFile(next);
  };

  const elapsed = progress * ANALYSIS_MS;
  const stageAt = STAGE_ENDS.findIndex((end) => elapsed < end);
  const activeStage = stageAt === -1 ? STAGES.length - 1 : stageAt;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-8 sm:px-8 sm:py-14">
        <p className="font-mono text-[11px] text-ink-soft">Camp QMIND 2026</p>

        <h1 className="mt-10 font-display text-4xl leading-[1.05] text-ink sm:text-5xl">
          Start with a recording
        </h1>

        <p className="mt-4 max-w-md text-lg leading-7 text-ink-soft">
          Choose a finger-tapping video. The motor analysis opens when the
          pass finishes.
        </p>

        {analyzing ? (
          <section className="mt-12" aria-live="polite">
            <p className="font-mono text-[11px] text-ink-soft">
              {file?.name}
            </p>

            <p className="mt-6 font-display text-2xl leading-snug">
              {STAGES[activeStage]}
            </p>

            <div className="mt-6 h-px w-full bg-rule">
              <div
                className="h-px origin-left bg-accent"
                style={{ transform: `scaleX(${progress})` }}
              />
            </div>

            <ol className="mt-8 space-y-2">
              {STAGES.map((stage, index) => {
                const done = index < activeStage || progress >= 1;
                const current = index === activeStage && progress < 1;

                return (
                  <li
                    key={stage}
                    className={`text-sm ${
                      done || current ? "text-ink" : "text-ink-soft/70"
                    }`}
                  >
                    <span className="mr-3 font-mono text-[11px] text-ink-soft">
                      {done ? "Done" : current ? "Now" : "0" + (index + 1)}
                    </span>
                    {stage}
                  </li>
                );
              })}
            </ol>
          </section>
        ) : (
          <section className="mt-12">
            <label
              className={`block cursor-pointer border border-dashed px-5 py-10 transition-colors ${
                dragOver
                  ? "border-accent bg-paper-raised"
                  : "border-rule bg-transparent"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragOver(false);
                takeFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                onChange={(event) => {
                  takeFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />

              <span className="block font-display text-2xl leading-snug">
                Drop a video here
              </span>
              <span className="mt-2 block text-sm text-ink-soft">
                or choose a file
              </span>
            </label>

            {file && (
              <div className="mt-4 flex items-center gap-4 border border-rule bg-paper-raised px-4 py-3">
                <FileMark />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{file.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-ink-soft">
                    {extensionOf(file.name)} · {formatBytes(file.size)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
                  onClick={() => setFile(null)}
                >
                  Remove
                </button>
              </div>
            )}

            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                disabled={!file}
                onClick={() => setAnalyzing(true)}
                className="bg-ink px-5 py-2.5 text-sm text-paper-raised disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-soft"
              >
                Analyze
              </button>
              {!file && (
                <button
                  type="button"
                  className="text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
                  onClick={() => inputRef.current?.click()}
                >
                  Browse files
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function FileMark() {
  return (
    <svg
      width="28"
      height="34"
      viewBox="0 0 28 34"
      aria-hidden="true"
      className="shrink-0 text-ink-soft"
    >
      <path
        d="M3 1.5h13.2L25 10.2V32.5H3V1.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path
        d="M16 1.8V10h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </svg>
  );
}
