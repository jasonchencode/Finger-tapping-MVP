// Shared tap math for the finger-tapping demo page.
// Frame-space (integer) only — the UI converts seconds to frames once, so
// "taps up to now" never depends on how the video was scrubbed.

// Frames where the hand was not detected come through as 0. Tap frames are
// already sorted by generate_peaks.py, but the sort keeps the math honest
// even if the file itself is out of order.
export const normalizeTapFrames = (
  tapFrames: number[],
  distances: number[]
): number[] =>
  [...new Set(tapFrames)].sort((a, b) => a - b).filter((frame) => distances[frame] > 0);

export const countTapsUpToFrame = (
  sortedTapFrames: number[],
  frame: number
): number => {
  let low = 0;
  let high = sortedTapFrames.length - 1;
  let count = 0;

  while (low <= high) {
    const middle = (low + high) >> 1;

    if (sortedTapFrames[middle] <= frame) {
      count = middle + 1;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return count;
};

export const latestTapFrameUpTo = (
  sortedTapFrames: number[],
  frame: number
): number => {
  let low = 0;
  let high = sortedTapFrames.length - 1;
  let latest = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;

    if (sortedTapFrames[middle] <= frame) {
      latest = sortedTapFrames[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return latest;
};

export const meanTapHeight = (
  heights: number[]
): number =>
  heights.length === 0
    ? 0
    : heights.reduce((sum, height) => sum + height, 0) / heights.length;
