"use client";

import { useEffect, useRef, useState } from "react";

type MovementData = {
  fps: number;
  distances: number[];
};

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [data, setData] = useState<MovementData | null>(null);
  const [currentTime, setCurrentTime] = useState(0);

  // Load movement data
  useEffect(() => {
    fetch("/data/finger-tapping.json")
      .then((response) => response.json())
      .then((json) => setData(json));
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

  // Clicking the graph moves the video
const handleGraphClick = (
    event: React.MouseEvent<SVGSVGElement>
  ) => {
    if (!videoRef.current || !data) return;

    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();

    const x = event.clientX - rect.left;

    // Keep percentage between 0 and 1
    const percentage = Math.max(
      0,
      Math.min(1, x / rect.width)
    );

    const WINDOW_SECONDS = 5;
    const duration = videoRef.current.duration;

    if (!Number.isFinite(duration)) return;

    // Use the same sliding-window logic as the graph
    const maxStartTime = Math.max(
      0,
      duration - WINDOW_SECONDS
    );

    const windowStart = Math.max(
      0,
      Math.min(
        currentTime - WINDOW_SECONDS,
        maxStartTime
      )
    );

    const windowEnd = Math.min(
      duration,
      windowStart + WINDOW_SECONDS
    );

    const clickedTime =
      windowStart +
      percentage * (windowEnd - windowStart);

    videoRef.current.currentTime = Math.max(
      0,
      Math.min(clickedTime, duration)
    );
  };

  const currentFrame = data
    ? Math.floor(currentTime * data.fps)
    : 0;

  const currentDistance =
    data?.distances[currentFrame] ?? 0;

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
                  currentTime={currentTime}
                  onClick={handleGraphClick}
                />
              )}
            </div>

            <div className="mt-4 flex justify-between text-sm text-[#68657a]">
              <span>Thumb ↔ Index distance</span>
              <span>
                {currentDistance.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">

          <Metric
            label="Taps"
            value="31"
          />

          <Metric
            label="Frequency"
            value="1.55 Hz"
          />

          <Metric
            label="Average Amplitude"
            value="0.36"
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
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-[#dddaf0] bg-white p-6 shadow-sm">
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
  currentTime,
  onClick,
}: {
  distances: number[];
  fps: number;
  currentTime: number;
  onClick: (event: React.MouseEvent<SVGSVGElement>) => void;
}) {
  const width = 800;
  const height = 350;

  const padding = {
    left: 60,
    right: 20,
    top: 30,
    bottom: 45,
  };

  const graphWidth =
    width - padding.left - padding.right;

  const graphHeight =
    height - padding.top - padding.bottom;

  // Match the Python graph:
  // 120 frames are visible at once.
  const WINDOW_FRAMES = 120;

  // Current video frame
  const currentFrame = Math.min(
    Math.floor(currentTime * fps),
    distances.length - 1
  );

  // Sliding window
  const startFrame = Math.max(
    0,
    currentFrame - WINDOW_FRAMES + 1
  );

  const endFrame = Math.min(
    distances.length - 1,
    startFrame + WINDOW_FRAMES - 1
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

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full cursor-crosshair"
      onClick={onClick}
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

      {/* Current video position */}
      <line
        x1={currentX}
        y1={padding.top}
        x2={currentX}
        y2={height - padding.bottom}
        stroke="#d946ef"
        strokeWidth="2"
        strokeDasharray="5 5"
      />

      {/* Current point */}
      <circle
        cx={currentX}
        cy={currentY}
        r="8"
        fill="#e11d48"
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

