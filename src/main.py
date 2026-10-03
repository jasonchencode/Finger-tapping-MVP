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

distances = []

# for r in results:
#    print(r)

def distance(r):
  if len(r)==0:
     return 0
  x_thumb = r[0][4].x
  y_thumb = r[0][4].y
  z_thumb = r[0][4].z

  x_index = r[0][8].x
  y_index = r[0][8].y
  z_index = r[0][8].z

  d = math.sqrt((x_thumb-x_index)**2 + (y_thumb-y_index)**2 + (z_thumb+z_index)**2)

  return d

print(distance(results[200]))

for r in results:
   distances.append(distance(r))

plt.scatter(np.arange(len(distances)), distances)
plt.show()