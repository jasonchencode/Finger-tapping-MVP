"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  countTapsUpToFrame,
  meanTapHeight,
  normalizeTapFrames,
} from "../tap-counter";

type MovementData = {
  fps: number;
  distances: number[];
};

// Match the Python graph: 120 frames are visible at once.
const WINDOW_FRAMES = 120;

// Longest trailing span the frequency metric averages over.
const FREQUENCY_WINDOW_SECONDS = 5;

// Graph geometry shared by the SVG rendering and the pointer mapping.
const GRAPH_WIDTH = 800;
const GRAPH_HEIGHT = 400;

const GRAPH_PADDING = {
  left: 88,
  right: 28,
  top: 36,
  bottom: 84,
};

const framePercent = (distance: number) => distance * 100;

const formatPercent = (distance: number) =>
  `${framePercent(distance).toFixed(1)}%`;

const formatTimecode = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";

  const mins = Math.floor(seconds / 60);
  const secs = seconds - mins * 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
};

// One visible-frame window shared by the graph display and the click-to-seek
// mapping. The window slides with the playhead and clamps identically at
// both edges of the video.
const getVisibleFrameWindow = (
  centerFrame: number,
  totalFrames: number
) => {
  const maxStartFrame = Math.max(0, totalFrames - WINDOW_FRAMES);

  const startFrame = Math.max(
    0,
    Math.min(centerFrame - Math.floor(WINDOW_FRAMES / 2), maxStartFrame)
  );

  const endFrame = Math.min(totalFrames - 1, startFrame + WINDOW_FRAMES - 1);

  return { startFrame, endFrame };
};

// Displayed-frame lookup: the click position already rounds to the nearest
// frame, so the played cursor always lands exactly on a drawn point.
const getFrameAtTime = (time: number, fps: number, totalFrames: number) =>
  Math.max(0, Math.min(Math.round(time * fps), totalFrames - 1));

export default function AnalysisPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const videoFrameRef = useRef<number | null>(null);
  const dragStartFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const seekFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{
    clientX: number;
    svg: SVGSVGElement;
  } | null>(null);
  const scrubbingRef = useRef(false);
  const requestedTimeRef = useRef(0);

  const [data, setData] = useState<MovementData | null>(null);
  const [tapFrames, setTapFrames] = useState<number[] | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartFrame, setDragStartFrame] = useState<number | null>(null);

  useEffect(() => {
    const loadMovement = fetch("/data/finger-tapping.json").then((response) =>
      response.json()
    );

    const loadTapFrames = fetch("/data/finger-tapping-peaks.json").then(
      (response) => response.json()
    );

    Promise.all([loadMovement, loadTapFrames]).then(([movement, peaks]) => {
      setData(movement);
      setTapFrames(peaks);
    });
  }, []);

  const stopPlaybackLoop = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const video = videoRef.current;
    if (
      video &&
      videoFrameRef.current !== null &&
      typeof video.cancelVideoFrameCallback === "function"
    ) {
      video.cancelVideoFrameCallback(videoFrameRef.current);
    }

    videoFrameRef.current = null;
  };

  const startPlaybackLoop = () => {
    const video = videoRef.current;
    if (!video) return;

    stopPlaybackLoop();

    const tick = () => {
      const current = videoRef.current;
      if (!current || current.paused || current.ended) return;

      if (!isDraggingRef.current && !scrubbingRef.current) {
        setCurrentTime(current.currentTime);
      }

      if (typeof current.requestVideoFrameCallback === "function") {
        videoFrameRef.current = current.requestVideoFrameCallback(() => tick());
      } else {
        animationFrameRef.current = requestAnimationFrame(tick);
      }
    };

    if (typeof video.requestVideoFrameCallback === "function") {
      videoFrameRef.current = video.requestVideoFrameCallback(() => tick());
    } else {
      animationFrameRef.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => {
    return () => {
      stopPlaybackLoop();
      if (seekFrameRef.current !== null) {
        cancelAnimationFrame(seekFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const previous = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.userSelect = previous;
    };
  }, [isDragging]);

  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (!isDraggingRef.current && !scrubbingRef.current) return;

      isDraggingRef.current = false;
      scrubbingRef.current = false;
      dragStartFrameRef.current = null;
      setIsDragging(false);
      setDragStartFrame(null);

      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, []);

  const applySeek = (time: number, precise: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    const videoDuration = video.duration;
    if (!Number.isFinite(videoDuration)) return;

    const clamped = Math.max(0, Math.min(time, videoDuration));
    requestedTimeRef.current = clamped;

    if (!precise && typeof video.fastSeek === "function") {
      video.fastSeek(clamped);
    } else {
      video.currentTime = clamped;
    }

    setCurrentTime(clamped);
  };

  // Maps a pointer position to a video time using the same visible window
  // the graph is rendering right now, frozen while dragging.
  const getTimeFromGraphPosition = (clientX: number, svg: SVGSVGElement) => {
    if (!videoRef.current || !data) return null;

    const videoDuration = videoRef.current.duration;
    if (!Number.isFinite(videoDuration)) return null;

    const rect = svg.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * GRAPH_WIDTH;
    const graphWidth = GRAPH_WIDTH - GRAPH_PADDING.left - GRAPH_PADDING.right;

    if (graphWidth <= 0) return null;

    const graphX = Math.max(
      GRAPH_PADDING.left,
      Math.min(GRAPH_PADDING.left + graphWidth, svgX)
    );

    const percentage = (graphX - GRAPH_PADDING.left) / graphWidth;

    const centerFrame =
      isDraggingRef.current && dragStartFrameRef.current !== null
        ? dragStartFrameRef.current + Math.floor(WINDOW_FRAMES / 2)
        : getFrameAtTime(currentTime, data.fps, data.distances.length);

    const { startFrame, endFrame } = getVisibleFrameWindow(
      centerFrame,
      data.distances.length
    );

    const clickedFrame = Math.round(
      startFrame + percentage * (endFrame - startFrame)
    );

    return clickedFrame / data.fps;
  };

  const flushPendingSeek = () => {
    seekFrameRef.current = null;
    const pending = pendingPointerRef.current;
    if (!pending || !isDraggingRef.current) return;

    const time = getTimeFromGraphPosition(pending.clientX, pending.svg);
    if (time !== null) applySeek(time, false);
  };

  const handleGraphPointerDown = (
    event: React.PointerEvent<SVGSVGElement>
  ) => {
    event.preventDefault();

    const svg = event.currentTarget;
    svg.setPointerCapture(event.pointerId);

    const videoDuration = videoRef.current?.duration;
    if (!videoDuration || !Number.isFinite(videoDuration)) return;

    stopPlaybackLoop();
    videoRef.current?.pause();

    const { startFrame } = getVisibleFrameWindow(
      getFrameAtTime(
        currentTime,
        data?.fps ?? 1,
        data?.distances.length ?? 0
      ),
      data?.distances.length ?? 0
    );

    dragStartFrameRef.current = startFrame;
    isDraggingRef.current = true;
    setDragStartFrame(startFrame);
    setIsDragging(true);

    const time = getTimeFromGraphPosition(event.clientX, svg);
    if (time !== null) applySeek(time, true);
  };

  const handleGraphPointerMove = (
    event: React.PointerEvent<SVGSVGElement>
  ) => {
    if (!isDraggingRef.current || dragStartFrameRef.current === null) return;

    event.preventDefault();

    pendingPointerRef.current = {
      clientX: event.clientX,
      svg: event.currentTarget,
    };

    if (seekFrameRef.current !== null) return;

    seekFrameRef.current = requestAnimationFrame(flushPendingSeek);
  };

  const handleGraphPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const svg = event.currentTarget;

    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }

    if (seekFrameRef.current !== null) {
      cancelAnimationFrame(seekFrameRef.current);
      seekFrameRef.current = null;
    }

    const time = isDraggingRef.current
      ? getTimeFromGraphPosition(event.clientX, svg)
      : null;

    isDraggingRef.current = false;
    dragStartFrameRef.current = null;
    pendingPointerRef.current = null;
    setIsDragging(false);
    setDragStartFrame(null);

    if (time !== null) applySeek(time, true);
    else if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) void video.play();
    else video.pause();
  };

  const setRate = (rate: number) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const currentFrame = data
    ? getFrameAtTime(currentTime, data.fps, data.distances.length)
    : 0;

  const currentDistance = data?.distances[currentFrame] ?? 0;

  const sortedTapFrames = tapFrames
    ? normalizeTapFrames(tapFrames, data?.distances ?? [])
    : [];

  const currentTaps = countTapsUpToFrame(sortedTapFrames, currentFrame);

  const windowSeconds = data
    ? Math.min(currentTime, FREQUENCY_WINDOW_SECONDS)
    : 0;

  const windowStartFrame =
    data && windowSeconds < FREQUENCY_WINDOW_SECONDS
      ? 0
      : data
        ? Math.floor((currentTime - FREQUENCY_WINDOW_SECONDS) * data.fps)
        : 0;

  const trailingWindowTaps =
    currentTaps - countTapsUpToFrame(sortedTapFrames, windowStartFrame);

  const currentFrequency =
    windowSeconds > 0 ? trailingWindowTaps / windowSeconds : 0;

  const activeCenterFrame =
    isDragging && dragStartFrame !== null
      ? dragStartFrame + Math.floor(WINDOW_FRAMES / 2)
      : currentFrame;

  const { startFrame: visibleStartFrame, endFrame: visibleEndFrame } = data
    ? getVisibleFrameWindow(activeCenterFrame, data.distances.length)
    : { startFrame: 0, endFrame: 0 };

  const visibleTapHeights = sortedTapFrames
    .filter((frame) => frame >= visibleStartFrame && frame <= visibleEndFrame)
    .map((frame) => data?.distances[frame] ?? 0);

  const averageVisibleAmplitude = meanTapHeight(visibleTapHeights);

  const [tapsPulseKey, setTapsPulseKey] = useState(0);
  const previousTapsRef = useRef(currentTaps);

  useEffect(() => {
    if (currentTaps > previousTapsRef.current) {
      setTapsPulseKey((key) => key + 1);
    }

    previousTapsRef.current = currentTaps;
  }, [currentTaps]);

  const scrubPercent =
    duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="flex items-baseline justify-between gap-4">
          <p className="font-mono text-[11px] text-ink-soft">Camp QMIND 2026</p>
          <Link
            href="/"
            className="text-sm text-ink-soft underline decoration-rule underline-offset-4 hover:text-ink"
          >
            New recording
          </Link>
        </header>

        <div className="mt-8 max-w-2xl">
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">
            Video-based Parkinson&apos;s motor movement analysis
          </h1>
          <p className="mt-4 text-lg leading-7 text-ink-soft">
            Finger-tapping, read from the distance between thumb and index
            fingertip.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-10 lg:grid-cols-2">
          <section>
            <h2 className="font-display text-2xl">Recording</h2>

            <div className="mt-4 border border-rule bg-ink">
              <video
                ref={videoRef}
                src="/video/finger-tapping-web.mp4"
                preload="auto"
                playsInline
                onClick={togglePlay}
                onPlay={() => {
                  setPlaying(true);
                  startPlaybackLoop();
                }}
                onPause={() => {
                  setPlaying(false);
                  stopPlaybackLoop();
                  if (videoRef.current && !isDraggingRef.current) {
                    setCurrentTime(videoRef.current.currentTime);
                  }
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) {
                    setDuration(videoRef.current.duration);
                  }
                }}
                className="aspect-video w-full cursor-pointer bg-ink"
              />
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlay}
                className="w-14 shrink-0 text-left text-sm text-ink"
              >
                {playing ? "Pause" : "Play"}
              </button>

              <input
                type="range"
                className="scrubber"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(currentTime, duration || 0)}
                aria-label="Seek"
                style={{ ["--scrub" as string]: `${scrubPercent}%` }}
                onPointerDown={() => {
                  scrubbingRef.current = true;
                }}
                onPointerUp={() => {
                  scrubbingRef.current = false;
                  applySeek(requestedTimeRef.current, true);
                }}
                onChange={(event) => {
                  scrubbingRef.current = true;
                  applySeek(Number(event.target.value), false);
                }}
              />

              <span className="num w-[9.5rem] shrink-0 text-right text-[12px] text-ink-soft">
                {formatTimecode(currentTime)} / {formatTimecode(duration)}
              </span>
            </div>

            <div className="mt-2 flex gap-3 text-sm">
              {[0.5, 1].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setRate(rate)}
                  className={`num ${
                    playbackRate === rate
                      ? "text-ink underline decoration-accent decoration-2 underline-offset-4"
                      : "text-ink-soft"
                  }`}
                >
                  {rate === 1 ? "1×" : "0.5×"}
                </button>
              ))}
            </div>
          </section>

          <section className="graph-surface select-none">
            <h2 className="font-display text-2xl">Finger distance</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Drag across the trace to move through the recording.
            </p>

            <div className="mt-4 border border-rule bg-paper-raised px-2 py-3 sm:px-4">
              {data && (
                <MovementGraph
                  distances={data.distances}
                  fps={data.fps}
                  tapFrames={sortedTapFrames}
                  currentTime={currentTime}
                  isDragging={isDragging}
                  dragStartFrame={dragStartFrame}
                  onPointerDown={handleGraphPointerDown}
                  onPointerMove={handleGraphPointerMove}
                  onPointerUp={handleGraphPointerUp}
                />
              )}
            </div>

            <p className="num mt-3 text-[13px] text-ink-soft">
              {formatPercent(currentDistance)} of frame
              <span className="mx-2 text-rule">/</span>
              {currentTaps} taps
              <span className="mx-2 text-rule">/</span>
              {currentTime.toFixed(1)}s
            </p>
          </section>
        </div>

        <dl className="mt-10 grid border-y border-rule sm:grid-cols-3">
          <Metric
            label="Taps"
            value={String(currentTaps)}
            pulseKey={tapsPulseKey}
          />
          <Metric
            label="Frequency"
            value={currentFrequency.toFixed(2)}
            unit="Hz"
          />
          <Metric
            label="Average amplitude"
            value={formatPercent(averageVisibleAmplitude)}
            unit="of frame"
          />
        </dl>

        <section className="mt-10 border-t border-rule pt-8">
          <h2 className="font-display text-2xl">What are we measuring?</h2>

          <div className="mt-6 grid gap-8 md:grid-cols-3">
            <Explainer
              kicker="01"
              title="Hand tracking"
              body="MediaPipe follows points on the hand in every frame of the recording."
            />
            <Explainer
              kicker="02"
              title="Distance"
              body="The trace is the gap between the thumb tip and the index tip, drawn as a percent of the frame."
            />
            <Explainer
              kicker="03"
              title="Taps"
              body="A tap is a peak in that trace. Frequency is taps per second over the last five seconds. Amplitude is the average peak height in the window on screen."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Explainer({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <p className="font-mono text-[11px] text-ink-soft">{kicker}</p>
      <h3 className="mt-2 font-display text-xl">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink-soft">{body}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
  pulseKey,
}: {
  label: string;
  value: string;
  unit?: string;
  pulseKey?: number;
}) {
  return (
    <div
      key={pulseKey}
      className={`border-rule py-5 max-sm:[&:not(:first-child)]:border-t sm:px-6 sm:first:pl-0 sm:[&:not(:first-child)]:border-l ${
        pulseKey ? "tap-pulse" : ""
      }`}
    >
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="num mt-2 text-3xl leading-none text-ink">
        {value}
        {unit && (
          <span className="ml-2 font-sans text-sm font-normal text-ink-soft">
            {unit}
          </span>
        )}
      </dd>
    </div>
  );
}

function MovementGraph({
  distances,
  fps,
  tapFrames,
  currentTime,
  isDragging,
  dragStartFrame,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  distances: number[];
  fps: number;
  tapFrames: number[];
  currentTime: number;
  isDragging: boolean;
  dragStartFrame: number | null;
  onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
}) {
  const width = GRAPH_WIDTH;
  const height = GRAPH_HEIGHT;
  const padding = GRAPH_PADDING;

  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const currentFrame = getFrameAtTime(currentTime, fps, distances.length);

  const centerFrame =
    isDragging && dragStartFrame !== null
      ? dragStartFrame + Math.floor(WINDOW_FRAMES / 2)
      : currentFrame;

  const { startFrame, endFrame } = getVisibleFrameWindow(
    centerFrame,
    distances.length
  );

  const visibleDistances = distances.slice(startFrame, endFrame + 1);

  if (visibleDistances.length < 2) return null;

  // Stored distances are normalized. 0.5 on the signal is 50% of the frame.
  const yMin = 0;
  const yMax = 0.5;
  const yRange = yMax - yMin;

  const xForFrame = (frame: number) =>
    padding.left +
    ((frame - startFrame) / Math.max(1, endFrame - startFrame)) * graphWidth;

  const yForDistance = (distance: number) =>
    padding.top + ((yMax - distance) / yRange) * graphHeight;

  const points = visibleDistances.map((distance, index) => {
    const frameIndex = startFrame + index;
    return `${xForFrame(frameIndex)},${yForDistance(distance)}`;
  });

  const currentX = xForFrame(currentFrame);
  const currentY = yForDistance(distances[currentFrame] ?? 0);
  const timeLabelX = Math.max(
    padding.left + 28,
    Math.min(width - padding.right - 28, currentX)
  );

  const visibleTaps = tapFrames
    .map((frame, index) => ({ frame, count: index + 1 }))
    .filter((tap) => tap.frame >= startFrame && tap.frame <= endFrame);

  const axisY = height - padding.bottom;
  const yTicks = [0.5, 0.25, 0];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full select-none ${
        isDragging ? "cursor-grabbing" : "cursor-crosshair"
      }`}
      style={{ touchAction: "none", userSelect: "none" }}
      aria-label="Finger-distance graph. Drag sideways to move through the recording."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {yTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={padding.left}
            y1={yForDistance(tick)}
            x2={width - padding.right}
            y2={yForDistance(tick)}
            stroke="#e6dfd4"
          />
          <text
            x={padding.left - 14}
            y={yForDistance(tick) + 4}
            textAnchor="end"
            fill="#3a342c"
            fontSize="14"
            fontWeight="600"
            style={{ userSelect: "none" }}
          >
            {Math.round(tick * 100)}%
          </text>
        </g>
      ))}

      <line
        x1={padding.left}
        y1={axisY}
        x2={width - padding.right}
        y2={axisY}
        stroke="#cfc6b8"
      />

      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#1c1915"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {visibleTaps.map((tap) => (
        <g key={tap.frame}>
          <circle
            cx={xForFrame(tap.frame)}
            cy={yForDistance(distances[tap.frame] ?? 0)}
            r="3.5"
            fill="#1c1915"
            stroke="#faf7f2"
            strokeWidth="1"
          />
          <text
            x={xForFrame(tap.frame)}
            y={axisY + 20}
            textAnchor="middle"
            fill="#3a342c"
            fontSize="13"
            fontWeight="600"
            style={{ userSelect: "none" }}
          >
            {tap.count}
          </text>
        </g>
      ))}

      <line
        x1={currentX}
        y1={padding.top}
        x2={currentX}
        y2={axisY}
        stroke="#9f2d2d"
        strokeWidth={isDragging ? 2 : 1.25}
      />

      <circle
        cx={currentX}
        cy={currentY}
        r={isDragging ? 7 : 5}
        fill="#9f2d2d"
        stroke="#faf7f2"
        strokeWidth="2"
      />

      <text
        x={padding.left}
        y={height - 18}
        fill="#3a342c"
        fontSize="14"
        fontWeight="600"
        style={{ userSelect: "none" }}
      >
        {(startFrame / fps).toFixed(1)}s
      </text>

      <text
        x={padding.left + graphWidth / 2}
        y={height - 18}
        textAnchor="middle"
        fill="#3a342c"
        fontSize="14"
        fontWeight="600"
        style={{ userSelect: "none" }}
      >
        Time
      </text>

      <text
        x={width - padding.right}
        y={height - 18}
        textAnchor="end"
        fill="#3a342c"
        fontSize="14"
        fontWeight="600"
        style={{ userSelect: "none" }}
      >
        {(endFrame / fps).toFixed(1)}s
      </text>

      <text
        x={timeLabelX}
        y={padding.top - 12}
        textAnchor="middle"
        fill="#1c1915"
        fontSize="14"
        fontWeight="600"
        style={{ userSelect: "none" }}
      >
        {currentTime.toFixed(1)}s
      </text>

      <text
        x="16"
        y={height / 2}
        textAnchor="middle"
        transform={`rotate(-90 16 ${height / 2})`}
        fill="#3a342c"
        fontSize="13"
        fontWeight="600"
        style={{ userSelect: "none" }}
      >
        Thumb-index distance (% of frame)
      </text>
    </svg>
  );
}
