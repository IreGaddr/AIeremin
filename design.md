AIeremin: Design & Implementation Plan (MVP)
Version: 1.1 (Enhanced AI Agent Considerations)
Date: April 29, 2025
1. Introduction
The AIeremin is envisioned as a novel digital musical instrument controlled by hand gestures captured via computer vision. Users "play" the instrument by moving their hands in front of a webcam, with hand/finger positions mapped to musical parameters like pitch and volume. This document outlines the design and implementation plan for a Minimum Viable Product (MVP) focused on proving the core concept using web technologies.
2. Core Goal (MVP)
The primary objective of the MVP is to demonstrate real-time control of basic sound synthesis using the detected position of a single fingertip (e.g., the index finger).
Success Criteria:
Successfully access and display the user's webcam feed.
Detect and track at least one hand and its landmarks using MediaPipe Hands.
Visually indicate the tracked fingertip position on the video feed.
Map the vertical (Y) position of the index fingertip to sound pitch (frequency), quantized to a simple scale (e.g., C Major pentatonic).
Map the horizontal (X) or depth (Z) position of the index fingertip to sound volume (amplitude) OR simply activate sound when the finger is detected.
Generate audible sound using Tone.js based on the mapped parameters.
Achieve reasonably low latency between hand movement and sound change.
3. Architecture Overview (MVP)
The MVP will follow a simple pipeline architecture running entirely in the client-side browser:
[Webcam Input] -> [MediaPipe Hand Tracking] -> [Coordinate Processing & Mapping] -> [Tone.js Sound Synthesis] -> [Audio Output]
      |                                                    |
      +-----------------> [Canvas Visual Feedback] <-------+


Components:
Input: Accesses the webcam video stream.
Hand Tracking: Processes video frames to detect hand landmarks.
Processing/Mapping: Extracts relevant coordinates, converts them to musical parameters (pitch, volume), and applies quantization.
Sound Synthesis: Generates audio based on the processed parameters.
Visual Feedback: Displays the video feed and overlays tracking information.
4. Component Breakdown & Implementation Details
4.1. Input Component
Technology: WebRTC navigator.mediaDevices.getUserMedia() API.
Function: Request permission and access the user's webcam feed. Stream video frames to an HTML <video> element (can be hidden).
AI Considerations:
Requires handling permissions requests and potential errors (NotAllowedError, NotFoundError).
Needs to manage the video stream lifecycle.
4.2. Hand Tracking Component
Technology: MediaPipe Hands (JavaScript Solution - Use the newer @mediapipe/tasks-vision HandLandmarker Task API).
Load via CDN: @mediapipe/tasks-vision (WASM files and JS bundle).
Function: Initialize the HandLandmarker model. Process video frames in a loop using detectForVideo. Output detected hand landmarks.
Configuration (MVP):
runningMode: 'VIDEO'
numHands: 1
minHandDetectionConfidence: 0.5
minHandPresenceConfidence: 0.5 (for VIDEO mode)
minTrackingConfidence: 0.5
Output Data: HandLandmarkerResult object containing landmarks (normalized x, y, z), worldLandmarks, and handedness.
landmarks: Array of arrays (one per hand), each containing 21 landmark objects {x, y, z}. Coordinates are normalized [0.0, 1.0] relative to the video frame dimensions. Origin is top-left.
Target Landmark (MVP): Index finger tip (Landmark ID: 8).
AI Considerations:
Requires asynchronous loading of the model and WASM files using FilesetResolver.
The main loop will call handLandmarker.detectForVideo(videoElement, timestamp). Results are handled synchronously within the loop or via a listener if using 'LIVE_STREAM' mode (prefer 'VIDEO' for requestAnimationFrame integration).
Need to handle cases where result.landmarks is empty or undefined.
Understand the coordinate system (normalized, origin top-left) is crucial for mapping.
4.3. Processing & Mapping Component
Technology: Custom JavaScript logic.
Function:
Extract the x, y, z coordinates of the target landmark (#8) from the HandLandmarkerResult.
Pitch Mapping: Convert normalized y to a MIDI note within a defined range, applying inversion.
Quantization: Snap the calculated MIDI note to the closest note in a predefined scale. Convert the quantized MIDI note back to frequency (Hz).
Volume Mapping: Convert normalized x or z (or use detection status) to a decibel (dB) value within a defined range.
AI Considerations:
Coordinate transformation logic needs to be precise.
Quantization algorithm implementation.
State management for smooth transitions (e.g., previous frequency/volume).
4.4. Sound Synthesis Component
Technology: Tone.js library.
Load via CDN: https://unpkg.com/tone
Function:
Initialize Tone.js audio context (await Tone.start()).
Create a synthesizer instance (Tone.Synth, Tone.AMSynth, etc.).
Update synth parameters (frequency, volume) using rampTo based on mapped values.
AI Considerations:
Handle the user gesture requirement for Tone.start().
Manage the synth lifecycle.
Use rampTo for smooth parameter changes.
4.5. Visual Feedback Component
Technology: HTML <canvas> element and the Canvas 2D API.
Function:
Draw the video frame to the canvas.
Convert normalized landmark coordinates to canvas pixel coordinates.
Draw visual indicators (dots, circles) for tracked landmarks.
AI Considerations:
Efficient drawing within requestAnimationFrame.
Accurate coordinate conversion.
5. Technology Stack (MVP)
Language: JavaScript (ES6+)
Markup/Styling: HTML5, CSS3
Core APIs: WebRTC (getUserMedia), Canvas 2D API, Web Audio API (via Tone.js)
Libraries:
MediaPipe HandLandmarker: @mediapipe/tasks-vision
Tone.js: tone
6. Implementation Steps (MVP)
HTML Setup: Create index.html with <video id="webcamVideo">, <canvas id="outputCanvas">, and <button id="startButton">. Add basic CSS for layout (e.g., canvas overlays video or is positioned nearby).
JS Setup: Create script.js.
Constants & Configuration: Define constants for MIDI range, volume range, scale notes, MediaPipe model paths, target landmark ID, etc.
DOM References: Get references to video, canvas, button elements. Get canvas 2D context.
State Variables: Initialize variables for handLandmarker, synth, canvasCtx, videoElement, isRunning, lastVideoTime, detectedLandmarks.
Implement setupCamera(): Async function using navigator.mediaDevices.getUserMedia({video: true}). Sets videoElement.srcObject. Returns promise resolving when stream is ready. Handles errors.
Implement loadHandLandmarker(): Async function. Uses FilesetResolver.forVisionTasks to locate WASM files. Creates HandLandmarker instance using HandLandmarker.createFromOptions with MVP configuration (runningMode: 'VIDEO', numHands: 1, etc.). Stores instance in state. Handles errors.
Implement setupToneJS(): Async function. Calls await Tone.start(). Initializes synth = new Tone.Synth().toDestination() (or other synth type). Stores synth in state. Handles errors (e.g., user blocking audio).
Implement mapCoordinatesToMusic(): Function takes landmark object {x, y, z} as input.
Calculates rawMidiNote based on y, inversion, and MIDI range constants.
Implements quantizeNote(midiNote, scale) helper function (takes MIDI note and scale array, returns closest MIDI note in scale).
Calls quantizeNote to get quantizedMidi.
Converts quantizedMidi to frequencyHz using Tone.Frequency(quantizedMidi, "midi").toFrequency().
Calculates volumeDb based on chosen mapping (Option A, B, or C from 4.3) using x or z and volume range constants. Clamps volume if necessary.
Returns { frequencyHz, volumeDb }.
Implement drawVisuals(): Function takes landmarks array (from HandLandmarkerResult) as input.
Clears the canvas: canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height).
Draws the current video frame: canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height).
If landmarks array is not empty:
Iterate through the landmarks of the first hand (landmarks[0]).
For the target landmark (#8):
Convert normalized x, y to canvas coordinates: pixelX = landmark.x * canvasElement.width, pixelY = landmark.y * canvasElement.height.
Draw a distinct circle/dot at pixelX, pixelY.
Optionally draw other landmarks with a different style.
Implement predictWebcam(): The main loop function.
If videoElement.readyState < 2 or !isRunning, return.
Check if video time has changed (videoElement.currentTime !== lastVideoTime).
If time changed:
Update lastVideoTime = videoElement.currentTime.
Call handLandmarker.detectForVideo(videoElement, performance.now()). Store the result.
Process Results:
Check if result.landmarks && result.landmarks.length > 0.
If yes:
Get the index fingertip landmark: const fingerTip = result.landmarks[0][TARGET_LANDMARK_ID];
Call mapCoordinatesToMusic(fingerTip) to get { frequencyHz, volumeDb }.
Update synth: synth.frequency.rampTo(frequencyHz, 0.05);, synth.volume.rampTo(volumeDb, 0.05);.
Store result.landmarks in detectedLandmarks state for drawing.
If no (no hand detected):
Ramp synth volume down: synth.volume.rampTo(-Infinity, 0.1);.
Clear detectedLandmarks state (detectedLandmarks = null;).
Draw Visuals: Call drawVisuals(detectedLandmarks).
Schedule the next frame: requestAnimationFrame(predictWebcam);
Implement startApp(): Async function called by button click.
Sets isRunning = true. Hides button, shows canvas/video.
Calls await setupCamera().
Calls await loadHandLandmarker().
Calls await setupToneJS().
Starts the main loop: predictWebcam().
Includes error handling for each step, providing user feedback (e.g., alert, status message).
Event Listener: Attach startApp to the "Start" button's click event. Ensure it only runs once.
7. AI Agent Coding Considerations (Detailed Specification)
This section provides specific instructions for an LLM agent tasked with generating the JavaScript code for the AIeremin MVP.
7.1. Global Scope & Initialization
Objective: Set up constants, configuration, DOM references, and initial state.
Action:
Define constants: TARGET_LANDMARK_ID = 8, MIDI_RANGE = [60, 84], VOLUME_RANGE_DB = [-30, -5], SCALE_NOTES_MIDI = [60, 62, 64, 67, 69] (C Major Pentatonic starting C4), MEDIAPIPE_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm', RAMP_TIME = 0.05.
Get DOM element references: videoElement = document.getElementById('webcamVideo'), canvasElement = document.getElementById('outputCanvas'), startButton = document.getElementById('startButton').
Get canvas context: canvasCtx = canvasElement.getContext('2d').
Initialize state variables: let handLandmarker = null;, let synth = null;, let isRunning = false;, let lastVideoTime = -1;, let detectedLandmarks = null;.
Dependencies: Assumes HTML elements with specified IDs exist.
7.2. Function: setupCamera()
Objective: Access webcam and link to video element.
Signature: async function setupCamera()
Logic:
Use await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false }). (Specify dimensions).
Assign the resulting stream to videoElement.srcObject.
Return a Promise that resolves when the videoElement emits the loadedmetadata event.
Error Handling: Catch potential getUserMedia errors (NotAllowedError, NotFoundError, etc.). Log errors and display a user-friendly message (e.g., update a status div). Reject the promise on error.
Return: Promise<void>
7.3. Function: loadHandLandmarker()
Objective: Load and configure the MediaPipe HandLandmarker model.
Signature: async function loadHandLandmarker()
Logic:
Create vision task fileset resolver: const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
Create HandLandmarker: handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numHands: 1, minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 }); (Use appropriate model path).
Error Handling: Catch errors during loading/creation. Log errors and display a user message.
Return: Promise<void>
State Change: Assigns the created instance to the global handLandmarker variable.
7.4. Function: setupToneJS()
Objective: Initialize Tone.js audio context and create the synthesizer.
Signature: async function setupToneJS()
Logic:
Call await Tone.start(). This must be triggered by user interaction (handled in startApp).
Create the synth: synth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 } }).toDestination(); (Example synth config).
Error Handling: Catch potential errors from Tone.start() (e.g., if context cannot be created). Log errors, display message.
Return: Promise<void>
State Change: Assigns the created synth to the global synth variable.
7.5. Function: quantizeNote(midiNote, scaleMidiNotes)
Objective: Find the MIDI note within the provided scale array that is closest to the input MIDI note.
Signature: function quantizeNote(midiNote, scaleMidiNotes)
Logic:
Initialize closestNote = scaleMidiNotes[0] and minDifference = Math.abs(midiNote - closestNote).
Iterate through the scaleMidiNotes array (starting from the second element).
For each scaleNote, calculate difference = Math.abs(midiNote - scaleNote).
If difference < minDifference, update minDifference = difference and closestNote = scaleNote.
Return closestNote.
Input: midiNote (number), scaleMidiNotes (array of numbers).
Return: number (the closest MIDI note from the scale).
7.6. Function: mapCoordinatesToMusic(landmark)
Objective: Convert a single landmark's coordinates into frequency and volume.
Signature: function mapCoordinatesToMusic(landmark)
Input: landmark (object { x: number, y: number, z: number }).
Logic:
Pitch:
normalizedY = landmark.y;
invertedY = 1.0 - normalizedY; // Invert Y
midiNoteRaw = MIDI_RANGE[0] + invertedY * (MIDI_RANGE[1] - MIDI_RANGE[0]); // Scale to MIDI range
quantizedMidi = quantizeNote(midiNoteRaw, SCALE_NOTES_MIDI); // Quantize
frequencyHz = Tone.Frequency(quantizedMidi, "midi").toFrequency(); // Convert to Hz
Volume (Implement Option B: X-axis):
normalizedX = landmark.x;
volumeDb = VOLUME_RANGE_DB[0] + normalizedX * (VOLUME_RANGE_DB[1] - VOLUME_RANGE_DB[0]); // Scale to dB range
volumeDb = Math.max(VOLUME_RANGE_DB[0], Math.min(VOLUME_RANGE_DB[1], volumeDb)); // Clamp volume
Return { frequencyHz, volumeDb }.
Dependencies: MIDI_RANGE, VOLUME_RANGE_DB, SCALE_NOTES_MIDI constants, quantizeNote function, Tone.Frequency.
Return: object { frequencyHz: number, volumeDb: number }.
7.7. Function: drawVisuals(landmarks)
Objective: Draw video feed and landmark overlays onto the canvas.
Signature: function drawVisuals(landmarks)
Input: landmarks (array of arrays of landmark objects, or null).
Logic:
canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
If landmarks && landmarks.length > 0:
const handLandmarks = landmarks[0];
Set drawing style for target landmark (e.g., fillStyle = 'red', radius = 5).
const targetLandmark = handLandmarks[TARGET_LANDMARK_ID];
const pixelX = targetLandmark.x * canvasElement.width;
const pixelY = targetLandmark.y * canvasElement.height;
canvasCtx.beginPath();
canvasCtx.arc(pixelX, pixelY, 5, 0, 2 * Math.PI);
canvasCtx.fill();
(Optional) Loop through other landmarks and draw smaller dots.
Dependencies: canvasCtx, canvasElement, videoElement, TARGET_LANDMARK_ID.
7.8. Function: predictWebcam()
Objective: Main loop for processing video frames, detecting hands, mapping data, updating audio, and drawing visuals.
Signature: function predictWebcam()
Logic:
Check guards: if (videoElement.readyState < videoElement.HAVE_ENOUGH_DATA || !isRunning || !handLandmarker || !synth) { requestAnimationFrame(predictWebcam); return; }
Check time: const now = performance.now(); if (videoElement.currentTime === lastVideoTime) { requestAnimationFrame(predictWebcam); return; }
Update time: lastVideoTime = videoElement.currentTime;
Detect: const result = handLandmarker.detectForVideo(videoElement, now);
Process:
if (result.landmarks && result.landmarks.length > 0) { ... } else { ... } (as detailed in Step 11 of Section 6).
Inside if: Get landmark #8, call mapCoordinatesToMusic, update synth.frequency and synth.volume using rampTo(value, RAMP_TIME), update detectedLandmarks = result.landmarks.
Inside else: synth.volume.rampTo(-Infinity, 0.1), detectedLandmarks = null.
Draw: drawVisuals(detectedLandmarks);
Loop: requestAnimationFrame(predictWebcam);
Dependencies: All state variables, helper functions (mapCoordinatesToMusic, drawVisuals), RAMP_TIME.
State Change: Modifies lastVideoTime, detectedLandmarks. Interacts with synth.
7.9. Function: startApp()
Objective: Orchestrate the application startup sequence triggered by user interaction.
Signature: async function startApp()
Logic:
if (isRunning) return;
isRunning = true;
Update UI (e.g., startButton.disabled = true; startButton.textContent = 'Loading...';). Display status messages.
try { ... } catch (error) { ... } block for the entire setup.
Inside try:
await setupCamera(); (Update status message)
await loadHandLandmarker(); (Update status message)
await setupToneJS(); (Update status message)
Update UI (startButton.style.display = 'none';, etc.)
Call predictWebcam(); to start the loop.
Inside catch:
Log the error.
Display a user-friendly error message.
Reset state: isRunning = false; startButton.disabled = false; startButton.textContent = 'Start';.
Dependencies: setupCamera, loadHandLandmarker, setupToneJS, predictWebcam, state variables.
7.10. Event Listener Setup
Objective: Connect the startApp function to the button click.
Action: startButton.addEventListener('click', startApp);
7.11. General Considerations for AI Agent
Code Style: Use modern JavaScript (ES6+), async/await, const/let. Add JSDoc comments for functions.
Modularity: Implement the functions as specified above. Avoid putting all logic directly into the event listener or main loop.
Error Handling: Implement robust try...catch blocks in async functions and API calls. Provide informative user feedback for errors (e.g., update a dedicated status <div> on the page).
Performance: The predictWebcam loop should be efficient. Avoid unnecessary calculations or allocations inside the loop. Rely on requestAnimationFrame for scheduling.
Configuration: Ensure all magic numbers and configuration values are defined as constants at the top for easy tuning.
8. Future Enhancements (Post-MVP)
Multi-finger tracking and polyphony/multi-parameter control.
Gesture recognition (using landmark relationships) for controls (e.g., instrument change, looping).
More sophisticated synthesizers and effects in Tone.js.
UI for selecting scales, keys, instruments, and mapping configurations.
Visualizations beyond simple landmark dots (e.g., connecting lines, visual representation of sound).
Explore Z-axis mapping more deeply.
(Ambitious) Eye-tracking integration.
9. Conclusion
This plan outlines a feasible approach to building an MVP of the AIeremin concept using standard web technologies. By focusing on the core interaction (single fingertip to sound) and leveraging powerful libraries like MediaPipe and Tone.js, a functional prototype can be developed to validate the idea and provide a foundation for future enhancements. Careful attention to coordinate mapping, real-time performance, and user feedback will be crucial for success. The detailed specifications in Section 7 should enable an AI coding agent to generate a significant portion of the required JavaScript code.
