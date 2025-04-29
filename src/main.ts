// AIeremin MVP Implementation in TypeScript
// Based on design.md specifications

// Type declarations for global variables provided by CDNs
declare const FilesetResolver: any;
declare const HandLandmarker: any;
declare const Tone: any;

// Constants and Configuration
const TARGET_LANDMARK_ID = 8;
const MIDI_RANGE = [60, 84]; // C4 to C6
const VOLUME_RANGE_DB = [-30, -5]; // Volume range in decibels
const SCALE_NOTES_MIDI = [60, 62, 64, 67, 69]; // C Major Pentatonic scale
const MEDIAPIPE_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const RAMP_TIME = 0.05; // For smooth parameter transitions

// DOM Elements
const videoElement = document.getElementById('webcamVideo') as HTMLVideoElement;
const canvasElement = document.getElementById('outputCanvas') as HTMLCanvasElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const canvasCtx = canvasElement.getContext('2d');

// State Variables
let handLandmarker: any = null;
let synth: any = null;
let isRunning = false;
let lastVideoTime = -1;
let detectedLandmarks: any = null;

// Function Implementations

/**
 * Sets up the webcam access and video stream
 */
async function setupCamera(): Promise<void> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480 },
            audio: false
        });
        
        videoElement.srcObject = stream;
        
        return new Promise((resolve, reject) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
            
            // Set timeout to handle cases where metadata never loads
            setTimeout(() => reject(new Error('Timeout waiting for video metadata')), 5000);
        });
    } catch (error) {
        console.error('Error accessing webcam:', error);
        statusDiv.textContent = 'Error accessing webcam. Please check permissions.';
        throw error;
    }
}

/**
 * Loads and initializes the MediaPipe HandLandmarker model
 */
async function loadHandLandmarker(): Promise<void> {
    try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
        
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
                delegate: 'GPU'
            },
            runningMode: 'VIDEO',
            numHands: 1,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        statusDiv.textContent = 'Hand tracking model loaded';
    } catch (error) {
        console.error('Error loading hand landmarker:', error);
        statusDiv.textContent = 'Error loading hand tracking model';
        throw error;
    }
}

/**
 * Initializes Tone.js audio context and creates the synthesizer
 */
async function setupToneJS(): Promise<void> {
    try {
        await Tone.start();
        statusDiv.textContent = 'Audio system initialized';
        
        synth = new Tone.Synth({
            oscillator: { type: 'sine' },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 }
        }).toDestination();
    } catch (error) {
        console.error('Error initializing Tone.js:', error);
        statusDiv.textContent = 'Error initializing audio system';
        throw error;
    }
}

/**
 * Quantizes a MIDI note to the closest note in the provided scale
 * @param midiNote - The raw MIDI note value (can be fractional)
 * @param scaleMidiNotes - Array of MIDI notes representing the scale
 * @returns The closest MIDI note from the scale
 */
function quantizeNote(midiNote: number, scaleMidiNotes: number[]): number {
    let closestNote = scaleMidiNotes[0];
    let minDifference = Math.abs(midiNote - closestNote);
    
    for (let i = 1; i < scaleMidiNotes.length; i++) {
        const scaleNote = scaleMidiNotes[i];
        const difference = Math.abs(midiNote - scaleNote);
        
        if (difference < minDifference) {
            minDifference = difference;
            closestNote = scaleNote;
        }
    }
    
    return closestNote;
}

/**
 * Maps landmark coordinates to musical parameters
 * @param landmark - A single landmark object with x, y, z coordinates
 * @returns An object containing frequency (Hz) and volume (dB)
 */
function mapCoordinatesToMusic(landmark: { x: number, y: number, z: number }): { frequencyHz: number, volumeDb: number } {
    // Pitch mapping (Y-axis inverted, mapped to MIDI range)
    const normalizedY = landmark.y;
    const invertedY = 1.0 - normalizedY;
    const midiNoteRaw = MIDI_RANGE[0] + invertedY * (MIDI_RANGE[1] - MIDI_RANGE[0]);
    const quantizedMidi = quantizeNote(midiNoteRaw, SCALE_NOTES_MIDI);
    const frequencyHz = Tone.Frequency(quantizedMidi, "midi").toFrequency();
    
    // Volume mapping (X-axis mapped to dB range)
    const normalizedX = landmark.x;
    let volumeDb = VOLUME_RANGE_DB[0] + normalizedX * (VOLUME_RANGE_DB[1] - VOLUME_RANGE_DB[0]);
    // Clamp volume to ensure it stays within the defined range
    volumeDb = Math.max(VOLUME_RANGE_DB[0], Math.min(VOLUME_RANGE_DB[1], volumeDb));
    
    return { frequencyHz, volumeDb };
}

/**
 * Draws the video feed and landmark overlays on the canvas
 * @param landmarks - Array of arrays of landmark objects, or null
 */
function drawVisuals(landmarks: any): void {
    if (!canvasCtx || !canvasElement || !videoElement) return;
    
    // Clear canvas and draw video frame
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Draw landmarks if available
    if (landmarks && landmarks.length > 0) {
        const handLandmarks = landmarks[0];
        const targetLandmark = handLandmarks[TARGET_LANDMARK_ID];
        
        // Draw target landmark (index fingertip)
        const pixelX = targetLandmark.x * canvasElement.width;
        const pixelY = targetLandmark.y * canvasElement.height;
        
        canvasCtx.beginPath();
        canvasCtx.arc(pixelX, pixelY, 5, 0, 2 * Math.PI);
        canvasCtx.fillStyle = 'red';
        canvasCtx.fill();
        
        // Optional: Draw other landmarks as smaller dots
        for (let i = 0; i < handLandmarks.length; i++) {
            if (i === TARGET_LANDMARK_ID) continue; // Skip the target landmark as we already drew it
            
            const landmark = handLandmarks[i];
            const x = landmark.x * canvasElement.width;
            const y = landmark.y * canvasElement.height;
            
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 2, 0, 2 * Math.PI);
            canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            canvasCtx.fill();
        }
    }
}

/**
 * Main loop for processing video frames and updating audio/visuals
 */
function predictWebcam(): void {
    if (!isRunning || !handLandmarker || !synth || 
        videoElement.readyState < videoElement.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(predictWebcam);
        return;
    }
    
    const now = performance.now();
    
    if (videoElement.currentTime === lastVideoTime) {
        requestAnimationFrame(predictWebcam);
        return;
    }
    
    lastVideoTime = videoElement.currentTime;
    
    try {
        const result = handLandmarker.detectForVideo(videoElement, now);
        
        if (result.landmarks && result.landmarks.length > 0) {
            const handLandmarks = result.landmarks[0];
            const fingerTip = handLandmarks[TARGET_LANDMARK_ID];
            
            if (fingerTip) {
                const { frequencyHz, volumeDb } = mapCoordinatesToMusic(fingerTip);
                
                // Update synth parameters with smooth transitions
                synth.frequency.rampTo(frequencyHz, RAMP_TIME);
                synth.volume.rampTo(volumeDb, RAMP_TIME);
                
                detectedLandmarks = result.landmarks;
            }
        } else {
            // No hand detected - ramp volume down
            synth.volume.rampTo(-Infinity, 0.1);
            detectedLandmarks = null;
        }
        
        // Update visuals
        drawVisuals(detectedLandmarks);
        
        // Schedule next frame
        requestAnimationFrame(predictWebcam);
    } catch (error) {
        console.error('Error in webcam processing:', error);
        statusDiv.textContent = 'Error processing webcam feed';
        requestAnimationFrame(predictWebcam);
    }
}

/**
 * Starts the application when the user clicks the start button
 */
async function startApp(): Promise<void> {
    if (isRunning) return;
    
    isRunning = true;
    startButton.disabled = true;
    startButton.textContent = 'Loading...';
    statusDiv.textContent = 'Initializing application';
    
    try {
        // Setup components in sequence
        await setupCamera();
        statusDiv.textContent = 'Webcam access granted';
        
        await loadHandLandmarker();
        statusDiv.textContent = 'Hand tracking model loaded';
        
        await setupToneJS();
        statusDiv.textContent = 'Audio system initialized';
        
        // Hide start button and start the main loop
        startButton.style.display = 'none';
        predictWebcam();
    } catch (error) {
        console.error('Application initialization failed:', error);
        statusDiv.textContent = 'Failed to initialize application. Please refresh and try again.';
        isRunning = false;
        startButton.disabled = false;
        startButton.textContent = 'Start';
    }
}

// Event listener setup
startButton.addEventListener('click', startApp);
