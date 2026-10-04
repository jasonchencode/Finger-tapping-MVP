"use client";

import { useEffect, useRef, useState } from "react";
import {
  countTapsUpToFrame,
  meanTapHeight,
  normalizeTapFrames,
} from "./tap-counter";

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
const GRAPH_HEIGHT = 350;

const GRAPH_PADDING = {
  left: 60,
  right: 20,
  top: 30,
  bottom: 45,
};

// One visible-frame window shared by the graph display and the click-to-seek
// mapping. The window slides with the playhead and clamps identically at
// both edges of the video.
const getVisibleFrameWindow = (
  centerFrame: number,
  totalFrames: number
) => {
  const maxStartFrame = Math.max(
    0,
    totalFrames - WINDOW_FRAMES
  );

  const startFrame = Math.max(
    0,
    Math.min(
      centerFrame - Math.floor(WINDOW_FRAMES / 2),
      maxStartFrame
    )
  );

  const endFrame = Math.min(
    totalFrames - 1,
    startFrame + WINDOW_FRAMES - 1
  );

  return { startFrame, endFrame };
};

// Displayed-frame lookup: the click position already rounds to the nearest
// frame, so the played cursor always lands exactly on a drawn point.
const getFrameAtTime = (
  time: number,
  fps: number,
  totalFrames: number
) =>
  Math.max(
    0,
    Math.min(Math.round(time * fps), totalFrames - 1)
  );

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [data, setData] = useState<MovementData | null>(null);
  const [tapFrames, setTapFrames] = useState<number[] | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartFrame, setDragStartFrame] = useState<number | null>(null);

  // Load movement data and detected tap peaks
  useEffect(() => {
    const loadMovement = fetch("/data/finger-tapping.json").then(
      (response) => response.json()
    );

    const loadTapFrames = fetch("/data/finger-tapping-peaks.json").then(
      (response) => response.json()
    );

    Promise.all([loadMovement, loadTapFrames])
      .then(([movement, peaks]) => {
        setData(movement);
        setTapFrames(peaks);
      });
  }, []);

  // Update graph whenever video moves
  const animationFrameRef = useRef<number | null>(null);

  const updateCurrentTime = () => {
    if (!videoRef.current) return;

    setCurrentTime(videoRef.current.currentTime);

    if (!videoRef.current.paused && !videoRef.current.ended) {
      animationFrameRef.current =
        requestAnimationFrame(updateCurrentTime);
    }
  };

  const handlePlay = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current =
      requestAnimationFrame(updateCurrentTime);
  };

  const handlePause = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Reset dragging if the pointer is released anywhere on the page
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      setIsDragging(false);
      setDragStartFrame(null);
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);

    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
    };
  }, []);

  // Maps a pointer position to a video time using the same visible window
  // the graph is rendering right now, frozen while dragging. There is a
  // single shared window formula, so the played cursor lands exactly under
  // the clicked point.
  const getTimeFromGraphPosition = (
    clientX: number,
    svg: SVGSVGElement
  ) => {
    if (!videoRef.current || !data) return null;

    const duration = videoRef.current.duration;

    if (!Number.isFinite(duration)) return null;

    const rect = svg.getBoundingClientRect();

    const svgX =
      ((clientX - rect.left) / rect.width) * GRAPH_WIDTH;

    const graphWidth =
      GRAPH_WIDTH - GRAPH_PADDING.left - GRAPH_PADDING.right;

    if (graphWidth <= 0) return null;

    // Keep mouse inside the actual graph area
    const graphX = Math.max(
      GRAPH_PADDING.left,
      Math.min(
        GRAPH_PADDING.left + graphWidth,
        svgX
      )
    );

    const percentage =
      (graphX - GRAPH_PADDING.left) / graphWidth;

    const centerFrame = isDragging && dragStartFrame !== null
      ? dragStartFrame + Math.floor(WINDOW_FRAMES / 2)
      : getFrameAtTime(
          currentTime,
          data.fps,
          data.distances.length
        );

    const { startFrame, endFrame } =
      getVisibleFrameWindow(
        centerFrame,
        data.distances.length
      );

    // Round to the nearest displayed frame so the red cursor sits exactly
    // under the pointer.
    const clickedFrame = Math.round(
      startFrame +
        percentage * (endFrame - startFrame)
    );

    return clickedFrame / data.fps;
  };

  const handleGraphPointerDown = (
    event: React.PointerEvent<SVGSVGElement>
  ) => {
    const svg = event.currentTarget;

    svg.setPointerCapture(event.pointerId);

    const duration = videoRef.current?.duration;

    if (!duration || !Number.isFinite(duration)) return;

    // Stop the playback loop while scrubbing
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Pause video while dragging
    if (videoRef.current) {
      videoRef.current.pause();
    }

    // Freeze the graph window exactly as it is displayed when the drag
    // starts, so the curve stays still under the cursor while scrubbing.
    const { startFrame } = getVisibleFrameWindow(
      getFrameAtTime(
        currentTime,
        data?.fps ?? 1,
        data?.distances.length ?? 0
      ),
      data?.distances.length ?? 0
    );

    setDragStartFrame(startFrame);
    setIsDragging(true);

    const time = getTimeFromGraphPosition(
      event.clientX,
      svg
    );

    if (time !== null && videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleGraphPointerMove = (
    event: React.PointerEvent<SVGSVGElement>
  ) => {
    if (!isDragging || dragStartFrame === null) return;

    const svg = event.currentTarget;

    const time = getTimeFromGraphPosition(
      event.clientX,
      svg
    );

    if (time !== null && videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleGraphPointerUp = (
    event: React.PointerEvent<SVGSVGElement>
  ) => {
    const svg = event.currentTarget;

    if (svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }

    // Release the frozen window and re-center on the playhead
    setIsDragging(false);
    setDragStartFrame(null);

    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };


  const currentFrame = data
    ? getFrameAtTime(
        currentTime,
        data.fps,
        data.distances.length
      )
    : 0;

  const currentDistance =
    data?.distances[currentFrame] ?? 0;

  // The tap count is a pure function of the current frame, so scrubbing
  // back on the graph winds the counter down as well.
  const sortedTapFrames = tapFrames
    ? normalizeTapFrames(tapFrames, data?.distances ?? [])
    : [];

  const currentTaps = countTapsUpToFrame(
    sortedTapFrames,
    currentFrame
  );

  // Taps in the trailing window divided by that window's length in seconds.
  // The window is capped at what has elapsed, so early frames still show an
  // honest rate instead of a diluted one.
  const windowSeconds = data
    ? Math.min(currentTime, FREQUENCY_WINDOW_SECONDS)
    : 0;

  const windowStartFrame =
    data && windowSeconds < FREQUENCY_WINDOW_SECONDS
      ? 0
      : data
        ? Math.floor(
            (currentTime - FREQUENCY_WINDOW_SECONDS) * data.fps
          )
        : 0;

  const trailingWindowTaps =
    currentTaps - countTapsUpToFrame(sortedTapFrames, windowStartFrame);

  const currentFrequency =
    windowSeconds > 0 ? trailingWindowTaps / windowSeconds : 0;

  // Same sliding window the graph displays, so the amplitude matches what
  // is on screen. Frozen while dragging, exactly like the graph.
  const activeCenterFrame =
    isDragging && dragStartFrame !== null
      ? dragStartFrame + Math.floor(WINDOW_FRAMES / 2)
      : currentFrame;

  const { startFrame: visibleStartFrame, endFrame: visibleEndFrame } =
    data
      ? getVisibleFrameWindow(
          activeCenterFrame,
          data.distances.length
        )
      : { startFrame: 0, endFrame: 0 };

  const visibleTapHeights = sortedTapFrames
    .filter(
      (frame) =>
        frame >= visibleStartFrame && frame <= visibleEndFrame
    )
    .map((frame) => data?.distances[frame] ?? 0);

  const averageVisibleAmplitude =
    meanTapHeight(visibleTapHeights);

  // Restart the Taps card pulse whenever the count ticks up during
  // playback.
  const [tapsPulseKey, setTapsPulseKey] = useState(0);

  const previousTapsRef = useRef(currentTaps);

  useEffect(() => {
    if (currentTaps > previousTapsRef.current) {
      setTapsPulseKey((key) => key + 1);
    }

    previousTapsRef.current = currentTaps;
  }, [currentTaps]);

  return (
    <main className="min-h-screen bg-[#fafaff] px-8 py-12 text-[#26165f]">
      
      {/* Header */}
      <div className="mx-auto max-w-7xl">
        <div className="mb-10">
          <p className="mb-2 text-sm font-medium tracking-widest text-[#6b61a8]">
            CAMP QMIND 2026
          </p>

          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            Video-Based Parkinson&apos;s
            <br />
            Motor Movement Analysis
          </h1>

          <p className="mt-4 max-w-2xl text-lg text-[#68657a]">
            Exploring finger-tapping movements through computer vision.
          </p>
        </div>

        {/* Main analysis area */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* Video */}
          <div className="rounded-2xl border border-[#dddaf0] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">
              Finger-Tapping Video
            </h2>

            <video
              ref={videoRef}
              src="/video/finger-tapping-web.mp4"
              controls
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handlePause}
              className="w-full rounded-xl bg-black"
            />
           
          </div>

          {/* Graph */}
          <div className="rounded-2xl border border-[#dddaf0] bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold">
              Finger Distance
            </h2>

            <div className="w-full overflow-hidden rounded-xl bg-[#fafaff] p-4">
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

            <div className="mt-4 flex justify-between text-sm text-[#68657a]">
              <span>
                Thumb ↔ Index distance{" "}
                {currentDistance.toFixed(2)}
              </span>
              <span>
                {currentTaps} taps @ {" "}
                {currentTime.toFixed(1)}s
              </span>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">

          <Metric
            label="Taps"
            value={String(currentTaps)}
            pulseKey={tapsPulseKey}
          />

          <Metric
            label="Frequency"
            value={`${currentFrequency.toFixed(2)} Hz`}
          />

          <Metric
            label="Average Amplitude"
            value={averageVisibleAmplitude.toFixed(2)}
          />

        </div>

        {/* Explanation */}
        <div className="mt-8 rounded-2xl border border-[#dddaf0] bg-[#f1effc] p-6">
          <h2 className="text-lg font-semibold">
            What are we measuring?
          </h2>

          <p className="mt-2 max-w-3xl leading-7 text-[#5f5b73]">
            MediaPipe tracks points on the hand throughout the video.
            We use the distance between the thumb and index fingertip
            to create a movement signal that changes over time.
          </p>
        </div>
      </div>
    </main>
  );
}


function Metric({
  label,
  value,
  pulseKey,
}: {
  label: string;
  value: string;
  pulseKey?: number;
}) {
  return (
    <div
      key={pulseKey}
      className={`rounded-2xl border border-[#dddaf0] bg-white p-6 shadow-sm ${
        pulseKey ? "tap-pulse" : ""
      }`}
    >
      <p className="text-sm font-medium text-[#77738c]">
        {label}
      </p>

      <p className="mt-2 text-3xl font-bold text-[#26165f]">
        {value}
      </p>
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
    onPointerDown: (
      event: React.PointerEvent<SVGSVGElement>
    ) => void;
    onPointerMove: (
      event: React.PointerEvent<SVGSVGElement>
    ) => void;
    onPointerUp: (
      event: React.PointerEvent<SVGSVGElement>
    ) => void;
  }) {
  const width = GRAPH_WIDTH;
  const height = GRAPH_HEIGHT;

  const padding = GRAPH_PADDING;

  const graphWidth =
    width - padding.left - padding.right;

  const graphHeight =
    height - padding.top - padding.bottom;

  // Current video frame
  const currentFrame = getFrameAtTime(
    currentTime,
    fps,
    distances.length
  );

  // The window is frozen at the drag start while scrubbing and re-centers
  // on the playhead once the pointer is released.
  const centerFrame =
    isDragging && dragStartFrame !== null
      ? dragStartFrame + Math.floor(WINDOW_FRAMES / 2)
      : currentFrame;

  const { startFrame, endFrame } =
    getVisibleFrameWindow(
      centerFrame,
      distances.length
    );

  const visibleDistances = distances.slice(
    startFrame,
    endFrame + 1
  );

  if (visibleDistances.length < 2) {
    return null;
  }

    // Fixed Y-axis range
    const yMin = 0;
    const yMax = 0.5;
    const yRange = yMax - yMin;

  // Convert data points into SVG coordinates
  const points = visibleDistances.map(
    (distance, index) => {
      const frameIndex = startFrame + index;

      const x =
        padding.left +
        ((frameIndex - startFrame) /
          Math.max(1, endFrame - startFrame)) *
          graphWidth;

      const y =
        padding.top +
        ((yMax - distance) / yRange) *
          graphHeight;

      return `${x},${y}`;
    }
  );

  // Current video position
  const currentX =
    padding.left +
    ((currentFrame - startFrame) /
      Math.max(1, endFrame - startFrame)) *
      graphWidth;

  const currentDistance =
    distances[currentFrame] ?? 0;

  const currentY =
    padding.top +
    ((yMax - currentDistance) / yRange) *
      graphHeight;

  // Detected taps inside the visible window, numbered cumulatively so the
  // tick labels read as a running count across the whole video.
  const visibleTaps = tapFrames
    .map((frame, index) => ({ frame, count: index + 1 }))
    .filter(
      (tap) => tap.frame >= startFrame && tap.frame <= endFrame
    );

  const tapX = (frame: number) =>
    padding.left +
    ((frame - startFrame) /
      Math.max(1, endFrame - startFrame)) *
      graphWidth;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${
        isDragging ? "cursor-grabbing" : "cursor-crosshair"
      }`}
      style={{
        touchAction: "none",
        userSelect: "none",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Y axis labels */}

      {/* 0.5 */}
      <text
        x={padding.left - 10}
        y={padding.top + 5}
        textAnchor="end"
        fill="#77738c"
        fontSize="13"
      >
        0.5
      </text>

      {/* 0.25 */}
      <text
        x={padding.left - 10}
        y={padding.top + graphHeight / 2 + 5}
        textAnchor="end"
        fill="#77738c"
        fontSize="13"
      >
        0.25
      </text>

      {/* 0 */}
      <text
        x={padding.left - 10}
        y={height - padding.bottom + 5}
        textAnchor="end"
        fill="#77738c"
        fontSize="13"
      >
        0
      </text>

      {/* X axis */}
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="#d9d6e8"
      />

      {/* Movement line */}
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="#4936a3"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Detected tap markers with cumulative counts */}
      {visibleTaps.map((tap) => (
        <g key={tap.frame}>
          <circle
            cx={tapX(tap.frame)}
            cy={
              padding.top +
              ((yMax - (distances[tap.frame] ?? 0)) / yRange) *
                graphHeight
            }
            r="4"
            fill="#4936a3"
            stroke="white"
            strokeWidth="1"
          />

          <line
            x1={tapX(tap.frame)}
            y1={height - padding.bottom}
            x2={tapX(tap.frame)}
            y2={height - padding.bottom + 6}
            stroke="#c4bee0"
          />

          <text
            x={tapX(tap.frame)}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            fill="#6b61a8"
            fontSize="11"
          >
            {tap.count}
          </text>
        </g>
      ))}

      {/* Current video position */}
      <line
        x1={currentX}
        y1={padding.top}
        x2={currentX}
        y2={height - padding.bottom}
        stroke="#d946ef"
        strokeWidth={isDragging ? 4 : 2}
        strokeDasharray="5 5"
      />

      {/* Current point */}
      <circle
        cx={currentX}
        cy={currentY}
        r={isDragging ? 12 : 8}
        fill="#e11d48"
        stroke="white"
        strokeWidth={isDragging ? 3 : 2}
      />

      {/* Left time */}
      <text
        x={padding.left}
        y={height - 15}
        fill="#77738c"
        fontSize="13"
      >
        {(startFrame / fps).toFixed(1)}s
      </text>

      {/* Right time */}
      <text
        x={width - padding.right}
        y={height - 15}
        textAnchor="end"
        fill="#77738c"
        fontSize="13"
      >
        {(endFrame / fps).toFixed(1)}s
      </text>

      {/* Current time */}
      <text
        x={currentX}
        y={padding.top - 10}
        textAnchor="middle"
        fill="#4936a3"
        fontSize="13"
        fontWeight="600"
      >
        {currentTime.toFixed(1)}s
      </text>

      {/* Y axis label */}
      <text
        x="18"
        y={height / 2}
        textAnchor="middle"
        transform={`rotate(-90 18 ${height / 2})`}
        fill="#77738c"
        fontSize="14"
      >
        Distance
      </text>
    </svg>
  );
}

