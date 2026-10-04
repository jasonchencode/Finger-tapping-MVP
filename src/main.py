import math
import cv2
import mediapipe as mp
import json

# --------------------------------------------------
# 1. Load video
# --------------------------------------------------

video_path = "../data/CONTROL01_DCHA copy.mp4"
output_path = "../output/output.mp4"

cap = cv2.VideoCapture(video_path)

fps = cap.get(cv2.CAP_PROP_FPS)
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

# --------------------------------------------------
# 2. Set up MediaPipe Hand Landmarker
# --------------------------------------------------

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

options = HandLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path="../hand_landmarker.task"
    ),
    running_mode=VisionRunningMode.VIDEO
)

# --------------------------------------------------
# 3. Detect hand landmarks
# --------------------------------------------------

results = []

with HandLandmarker.create_from_options(options) as landmarker:

    counter = 1

    while cap.isOpened():

        success, frame = cap.read()

        if not success:
            break

        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB,
            data=frame
        )

        hand_landmarker_result = landmarker.detect_for_video(
            mp_image,
            int(counter * 1000 / fps)
        )

        results.append(
            hand_landmarker_result.hand_landmarks
        )

        counter += 1


# --------------------------------------------------
# 4. Calculate thumb-index distance
# --------------------------------------------------

def distance(r):

    if len(r) == 0:
        return 0

    x_thumb = r[0][4].x
    y_thumb = r[0][4].y

    x_index = r[0][8].x
    y_index = r[0][8].y

    d = math.sqrt(
        (x_thumb - x_index) ** 2 +
        (y_thumb - y_index) ** 2
    )

    return d


distances = []

for r in results:
    distances.append(distance(r))


# --------------------------------------------------
# 5. Prepare output video
# --------------------------------------------------

cap = cv2.VideoCapture(video_path)

fourcc = cv2.VideoWriter_fourcc(*"mp4v")

out = cv2.VideoWriter(
    output_path,
    fourcc,
    fps,
    (width, height)
)

if not out.isOpened():
    print("ERROR: VideoWriter could not be opened")
    exit()


# --------------------------------------------------
# 6. Hand connections
# --------------------------------------------------

HAND_CONNECTIONS = [
    (0, 1),
    (1, 2),
    (2, 3),
    (3, 4),

    (0, 5),
    (5, 6),
    (6, 7),
    (7, 8),

    (5, 9),
    (9, 10),
    (10, 11),
    (11, 12),

    (9, 13),
    (13, 14),
    (14, 15),
    (15, 16),

    (13, 17),
    (17, 18),
    (18, 19),
    (19, 20),

    (0, 17)
]


# --------------------------------------------------
# 7. Draw annotations onto video
# --------------------------------------------------

frame_number = 0

while True:

    ret, frame = cap.read()

    if not ret:
        break

    # Get landmarks for this frame
    frame_landmarks = results[frame_number]

    for hand_landmarks in frame_landmarks:

        points = []

        for i, landmark in enumerate(hand_landmarks):

            x = int(landmark.x * width)
            y = int(landmark.y * height)

            points.append((x, y))

            # Thumb tip and index tip
            if i == 4 or i == 8:

                cv2.circle(
                    frame,
                    (x, y),
                    7,
                    (0, 0, 255),
                    -1
                )

            else:

                cv2.circle(
                    frame,
                    (x, y),
                    5,
                    (0, 255, 0),
                    -1
                )

        # Draw hand connections
        for start, end in HAND_CONNECTIONS:

            cv2.line(
                frame,
                points[start],
                points[end],
                (0, 255, 0),
                2
            )

    # Write annotated frame
    out.write(frame)

    frame_number += 1


# --------------------------------------------------
# 8. Clean up
# --------------------------------------------------

cap.release()
out.release()


# --------------------------------------------------
# 9. Save movement data for Next.js
# --------------------------------------------------

data = {
    "fps": fps,
    "distances": distances
}

with open(
    "../website/public/data/finger-tapping.json",
    "w"
) as f:

    json.dump(data, f)


print("Annotated video saved!")
print(f"Output: {output_path}")
print("Movement data saved!")
print("Overall amplitude:", max(distances) - min(distances))
print("Min:", min(distances))
print("Max:", max(distances))
print("Range:", max(distances) - min(distances))
print("Average:", sum(distances) / len(distances))