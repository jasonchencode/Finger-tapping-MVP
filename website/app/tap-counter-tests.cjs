// Formatter-free assertions for the tap counter math against real data.
const assert = require("assert");
const {
  normalizeTapFrames,
  countTapsUpToFrame,
  latestTapFrameUpTo,
  meanTapHeight,
} = require("./tap-counter.ts");
const realData = require("../public/data/finger-tapping.json");
const realPeaks = require("../public/data/finger-tapping-peaks.json");
const fixture = require("./tap-counter.test-fixtures/tap-timing.json");

assert(realPeaks.length > 0, "generated peaks file should not be empty");
assert(
  realPeaks.every((frame, index) => frame > (realPeaks[index - 1] ?? 0)),
  "generated peaks file should be sorted and strictly increasing"
);
const sortedRealPeaks = normalizeTapFrames(realPeaks, realData.distances);
assert.deepEqual(
  sortedRealPeaks,
  realPeaks,
  "generated peaks are already sorted and positive"
);

// Binary search edge cases.
assert.equal(countTapsUpToFrame([], 5), 0, "empty peaks count nothing");
assert.equal(countTapsUpToFrame([10], 0), 0, "before the first tap");
assert.equal(countTapsUpToFrame([10], 9), 0, "one frame before the first tap");
assert.equal(countTapsUpToFrame([10], 10), 1, "at the tap frame");
assert.equal(countTapsUpToFrame([10], 11), 1, "after the tap frame");
assert.equal(countTapsUpToFrame([1, 3, 3, 7], 3), 3, "duplicated frames count");
assert.equal(latestTapFrameUpTo([10, 20], 5), -1, "no tap before frame 10");
assert.equal(latestTapFrameUpTo([10, 20], 25), 20, "latest tap in range");

// Frames where the hand was not detected come through as 0, so the all-zero
// prefix is a hand-checked t=0 case with no taps counted yet. The fixture
// keeps the real leading zeros plus a small trailing ramp.
const zeroRunFrames = fixture.distances.findIndex((value) => value > 0);
assert(zeroRunFrames > 0, "fixture keeps a leading zero run");
const fixturePeaks = normalizeTapFrames(realPeaks, fixture.distances);
assert.equal(
  countTapsUpToFrame(fixturePeaks, zeroRunFrames - 1),
  0,
  "no taps during the leading all-zero detection gap"
);
assert.equal(
  countTapsUpToFrame(fixturePeaks, zeroRunFrames),
  0,
  "the hand-boundary frame itself still has no tap"
);
assert.equal(
  countTapsUpToFrame(fixturePeaks, realPeaks[0]),
  1,
  "the first tap counts from its own frame onwards"
);

// Hand-checked mid-video count at exactly 10.0s (frame 300 → 14 taps).
const tenthFrame = Math.floor(10 * realData.fps);
assert.equal(countTapsUpToFrame(sortedRealPeaks, tenthFrame), 14);
assert.equal(latestTapFrameUpTo(sortedRealPeaks, tenthFrame), 294);
assert.equal(
  realPeaks[Math.max(0, 14 - 1)],
  294,
  "the latest tap at 10.0s is peak #14"
);

// Sweep the whole video: the count must agree with an independent filter at
// every probed frame, never decrease as time advances, and recompute to the
// same value whatever order frames were visited in.
const totalFrames = realData.distances.length;
const probedFrames = Array.from(
  { length: 30 },
  (_, i) => Math.floor(((totalFrames - 1) * i) / 29)
);
let previousCount = 0;

for (const frame of [...new Set([...probedFrames, 0, tenthFrame, totalFrames - 1])].sort((a, b) => a - b)) {
  const count = countTapsUpToFrame(sortedRealPeaks, frame);
  assert.equal(
    count,
    realPeaks.filter((tapFrame) => tapFrame <= frame).length,
    `frame ${frame} should match an independent filter`
  );
  assert(
    count >= previousCount,
    `counts never decrease as frames advance (frame ${frame})`
  );
  previousCount = count;
}

assert.equal(countTapsUpToFrame(sortedRealPeaks, totalFrames - 1), realPeaks.length);
assert.equal(meanTapHeight([]), 0, "no taps yet means no measurable height");
assert.equal(meanTapHeight([0.3, 0.4]), 0.35, "plain arithmetic mean");

console.log("tap-counter tests passed");
