import numpy as np
import math
import cv2
import mediapipe as mp
import matplotlib.pyplot as plt

# Use OpenCV’s VideoCapture to load the input video.
video_path = "../data/CONTROL01_DCHA copy.mp4"
cap = cv2.VideoCapture(video_path)

# Load the frame rate of the video using OpenCV’s CV_CAP_PROP_FPS
fps = cap.get(cv2.CAP_PROP_FPS)

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

# Create a hand landmarker instance with the video mode:
options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path='../hand_landmarker.task'),
    running_mode=VisionRunningMode.VIDEO)

results = []

with HandLandmarker.create_from_options(options) as landmarker:
  # The landmarker is initialized. Use it here.
  # ...

  # You’ll need it to calculate the timestamp for each frame.

  # Loop through each frame in the video using VideoCapture#read()
  counter = 1
  while cap.isOpened():
    success, frame = cap.read()

    if not success:
        break

    # Convert the frame received from OpenCV to a MediaPipe’s Image object.
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame)

  
    hand_landmarker_result = landmarker.detect_for_video(mp_image, int(counter*1000/fps))
    results.append(hand_landmarker_result.hand_landmarks)
    counter+=1

def distance(r):
  if len(r)==0:
     return 0
  x_thumb = r[0][4].x
  y_thumb = r[0][4].y
  z_thumb = r[0][4].z

  x_index = r[0][8].x
  y_index = r[0][8].y
  z_index = r[0][8].z

  d = math.sqrt((x_thumb-x_index)**2 + (y_thumb-y_index)**2)
  # with z axis:
  # d = math.sqrt((x_thumb-x_index)**2 + (y_thumb-y_index)**2 + (z_thumb-z_index)**2)

  return d

distances = []

for r in results:
   distances.append(distance(r))

# plt.plot(np.arange(len(distances)), distances)
# plt.show()

# VIDEO WITH LIVE GRAPH

x_values = np.arange(len(distances))
y_values = distances

output_path = '../output/output.mp4'
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

# Graph dimensions
graph_width = 500
graph_height = 300

# Output video is wider because graph is placed beside video
output_width = width + graph_width

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS)

fourcc = cv2.VideoWriter_fourcc(*"mp4v")

out = cv2.VideoWriter(
    output_path,
    fourcc,
    fps,
    (output_width, height)
)

if not out.isOpened():
    print("ERROR: VideoWriter could not be opened")

frame_number = 0

while True:
    ret, frame = cap.read()

    if not ret:
        break

    # --------------------------------------------------
    # 1. Create blank area for the graph
    # --------------------------------------------------

    graph_area = np.ones(
        (height, graph_width, 3),
        dtype=np.uint8
    ) * 255

    # --------------------------------------------------
    # 2. Get the previous 120 frames & set graph settings
    # --------------------------------------------------

    window_size = 120

    start = max(0, frame_number - window_size + 1)
    end = frame_number + 1

    x_window = x_values[start:end]
    y_window = y_values[start:end]

    left = 60
    right = 20
    top = 50
    bottom = 50

    plot_width = graph_width - left - right
    plot_height = graph_height - top - bottom

    # The X axis represents FRAME NUMBER.
    # Always show exactly 120 frames when possible.
    visible_start = max(0, frame_number - window_size + 1)
    visible_end = visible_start + window_size - 1

    # Y limits remain based on the data
    y_min = np.min(y_values)
    y_max = np.max(y_values)

    y_range = y_max - y_min

    if y_range == 0:
        y_range = 1

    y_min -= 0.05 * y_range
    y_max += 0.05 * y_range



    # --------------------------------------------------
    # 3. Convert data coordinates -> pixel coordinates
    # --------------------------------------------------

    points = []

    for i, y in enumerate(y_window):

        # Actual frame number
        frame_index = start + i

        # Convert frame number to graph x-coordinate
        px = int(
            left +
            (frame_index - visible_start) /
            (visible_end - visible_start) *
            plot_width
        )

        # Convert y value to graph y-coordinate
        py = int(
            top +
            (y_max - y) /
            (y_max - y_min) *
            plot_height
        )

        points.append((px, py))

    # --------------------------------------------------
    # 4. Draw graph axes
    # --------------------------------------------------

    cv2.line(
        graph_area,
        (left, top),
        (left, top + plot_height),
        (0, 0, 0),
        2
    )

    cv2.line(
        graph_area,
        (left, top + plot_height),
        (left + plot_width, top + plot_height),
        (0, 0, 0),
        2
    )

    # --------------------------------------------------
    # 5. Draw the line
    # --------------------------------------------------

    if len(points) >= 2:

        for j in range(1, len(points)):

            cv2.line(
                graph_area,
                points[j - 1],
                points[j],
                (255, 0, 0),
                2
            )

    # --------------------------------------------------
    # 6. Draw current point
    # --------------------------------------------------

    if len(points) > 0:

        cv2.circle(
            graph_area,
            points[-1],
            5,
            (0, 0, 255),
            -1
        )

    # --------------------------------------------------
    # 7. Add labels
    # --------------------------------------------------

    cv2.putText(
        graph_area,
        "Distance Between Thumb and Index Finger",
        (left, 30),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (0, 0, 0),
        2
    )

    cv2.putText(
        graph_area,
        f"Frame: {frame_number}",
        (left, height - 15),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (0, 0, 0),
        1
    )

    # --------------------------------------------------
    # 8. Combine video + graph
    # --------------------------------------------------

    combined = np.hstack((frame, graph_area))

    out.write(combined)

    frame_number += 1

cap.release()
out.release()