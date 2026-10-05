# Parkinson's Finger-Tapping MVP

## Overview

This MVP demonstrates how computer vision can be used to quantify movement from a finger-tapping video.

The system takes a video, tracks the hand using MediaPipe, measures the movement between the thumb and index finger, and displays the measurements alongside the video through an interactive graph.

**Video → Hand Tracking → Movement Measurements → Visualization**

This MVP is not designed to diagnose Parkinson's disease or replace clinicians.

---

## How It Works

### 1. Load the Video

`main.py` uses OpenCV to load the finger-tapping video and processes it one frame at a time.

### 2. Detect the Hand

Each frame is passed to MediaPipe's Hand Landmarker.

MediaPipe detects **21 landmarks** on the hand, with each landmark representing a specific point on the hand.

### 3. Measure Finger Movement

We focus on two landmarks:

- **Thumb tip:** Landmark 4
- **Index fingertip:** Landmark 8

The distance between these two points is calculated for every frame.

### 4. Store Movement Data

Each frame produces one distance measurement.

For example:

```text
Frame 1 → 0.42
Frame 2 → 0.45
Frame 3 → 0.51
Frame 4 → 0.58
...
```
These measurements are stored as a time series along with the video's FPS.

### 5. Generate Outputs

The Python pipeline produces: 

- An annotated video showing the detected hand landmarks
- A JSON file containing the frame-by-frame distance measurements
- FPS information for synchronization

### 6. Visualize the Data

The frontend loads the video and movement data. As the video plays, the current time is converted into a frame number:

```
Current Time × FPS = Current Frame
```

The frontend then finds the distance associated with that frame and displays it on the graph.

For example:
```
Video reaches Frame 127
        ↓
Distance[127] = 0.43
        ↓
Graph displays 0.43
```
This allows the graph to move alongside the video and show the movement being tracked in real time.

---

## Metrics

The MVP uses simple movement measurements to describe the finger-tapping motion.

### Tapping Frequency

Measures how frequently tapping movements occur over the recording.

### Average Amplitude

Measures the average size of the finger movements.

### Total Taps

Counts the number of detected tapping movements.

These measurements are intended to describe movement and are not clinical measures or diagnoses.

---

## Challenge

One challenge is that MediaPipe does not consistently track the hand throughout the entire video.

When the hand is not detected, the corresponding movement measurement may be missing or unreliable.

### Future Improvements

Future versions could:

- Track hand-detection confidence
- Identify unreliable frames
- Handle short gaps in tracking
- Flag videos with poor tracking quality
- Prevent unreliable measurements from being used for future predictions

Rather than generating a potentially misleading measurement, the system should be able to recognize when its tracking is unreliable.

---

## Key Takeaway

This MVP demonstrates how a finger-tapping video can be converted into structured movement data using computer vision.

The goal is not to diagnose Parkinson's disease, but to show how **hand movement can be measured and visualized from video**.
