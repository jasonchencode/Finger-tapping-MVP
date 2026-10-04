"""Generate tap peak indices for the finger-tapping website demo.

Reads the thumb-index distance signal produced by src/main.py and writes
the frame indices of detected tap peaks to the website's public data
directory so the React app can count taps without a peak-detection
library in the browser.

Usage (from the repo root):

    python3 tools/generate_peaks.py
"""

import json
from pathlib import Path

from scipy.signal import find_peaks

REPO_ROOT = Path(__file__).resolve().parents[2]

INPUT_PATH = REPO_ROOT / "website" / "public" / "data" / "finger-tapping.json"
OUTPUT_PATH = REPO_ROOT / "website" / "public" / "data" / "finger-tapping-peaks.json"


def main() -> None:
    with INPUT_PATH.open() as f:
        data = json.load(f)

    fps = data["fps"]
    distances = data["distances"]

    # Frames where the hand was not detected are 0. A prominence floor well
    # above 0 keeps those flat regions (and the hand-entry ramps) from ever
    # producing peaks, while real taps rise ~0.3 above the baseline.
    MIN_PROMINENCE = 0.05

    # A finger-tapping cycle (open + close) takes at least a third of a
    # second, so peaks closer than that are noise from the same tap.
    MIN_PEAK_DISTANCE = int(fps // 3)

    peaks, _ = find_peaks(
        distances,
        prominence=MIN_PROMINENCE,
        distance=MIN_PEAK_DISTANCE,
    )

    peak_indices = [int(index) for index in peaks]

    with OUTPUT_PATH.open("w") as f:
        json.dump(peak_indices, f)

    duration = len(distances) / fps

    print(f"fps: {fps}")
    print(f"frames: {len(distances)}")
    print(f"duration: {duration:.2f}s")
    print(f"taps detected: {len(peak_indices)}")
    print(f"saved peaks: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
