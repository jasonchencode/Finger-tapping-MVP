import numpy as np
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

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
    base_options=BaseOptions(model_asset_path='./hand_landmarker.task'),
    running_mode=VisionRunningMode.VIDEO)
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
    counter+=1