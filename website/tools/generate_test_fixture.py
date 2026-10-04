"""Build a fixture with a leading zero run for offline tests.

Writes website/app/tap-counter.test-fixtures/tap-timing.json from the
first 20 frames of the real finger-tapping signal plus an appended
rising ramp, so tests cover hand-detection zero frames without videos.
"""

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

SOURCE_PATH = REPO_ROOT / "website" / "public" / "data" / "finger-tapping.json"
OUTPUT_PATH = (
    REPO_ROOT
    / "website"
    / "app"
    / "tap-counter.test-fixtures"
    / "tap-timing.json"
)

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

REAL = json.loads(SOURCE_PATH.read_text())
TRAILING = [0.0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14]

json.dump(
    {
        "fps": REAL["fps"],
        "distances": REAL["distances"][:20] + TRAILING,
    },
    OUTPUT_PATH.open("w"),
)

print(f"saved: {OUTPUT_PATH}")
