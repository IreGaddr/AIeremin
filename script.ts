// Import necessary types from libraries
import { 
    FilesetResolver, 
    HandLandmarker, 
    HandLandmarkerResult, 
    NormalizedLandmark 
} from "@mediapipe/tasks-vision";

// Import the main Tone object and the Synth class separately
import * as Tone from 'tone'; // Reverted back to import *
import { Synth } from 'tone'; // Keep named import for the class type

// --- Type Aliases/Interfaces --- 
// Define a type for the dynamically imported Tone.js module if needed, 
// but ToneLib should work directly as it includes types.
// We might need specific types from ToneLib later, e.g., ToneLib.Synth

// Type for the result of mapCoordinatesToMusic
interface MusicParams {
    frequencyHz: number;
    volumeDb: number;
    quantizedMidi: number;
}

// --- Constants & Configuration (Typed) ---
const TARGET_LANDMARK_ID_THUMB: number = 4;
const TARGET_LANDMARK_ID_INDEX: number = 8;
const TARGET_LANDMARK_ID_MIDDLE: number = 12;
const TARGET_LANDMARK_ID_RING: number = 16;
const TARGET_LANDMARK_ID_PINKY: number = 20;
const TARGET_LANDMARK_IDS = [
    TARGET_LANDMARK_ID_THUMB, 
    TARGET_LANDMARK_ID_INDEX, 
    TARGET_LANDMARK_ID_MIDDLE, 
    TARGET_LANDMARK_ID_RING, 
    TARGET_LANDMARK_ID_PINKY
];
// Expanded range: C3 (48) to C7 (108) - 5 Octaves
const MIDI_RANGE: [number, number] = [48, 108]; 
const VOLUME_RANGE_DB: [number, number] = [-30, -5];
// Keep C Major Pentatonic for now, adjust if desired
const SCALE_NOTES_MIDI: number[] = [48, 50, 52, 55, 57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98, 100, 103, 105];
// Adjusted path for dynamic loading
const MEDIAPIPE_BASE_PATH: string = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const HAND_LANDMARKER_MODEL_PATH: string = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
const RAMP_TIME: number = 0.05; // 50ms ramp time for smooth audio changes
const VIDEO_WIDTH: number = 640;
const VIDEO_HEIGHT: number = 480;

// --- DOM References (Typed with checks) ---
const videoElement = document.getElementById('webcamVideo') as HTMLVideoElement | null;
const canvasElement = document.getElementById('outputCanvas') as HTMLCanvasElement | null;
const toggleButton = document.getElementById('toggleButton') as HTMLButtonElement | null;
const statusElement = document.getElementById('status') as HTMLDivElement | null;

// --- App Initialization & Token Validation (NEW) ---
async function initializeAndValidate() {
    if (!toggleButton || !statusElement) {
        // Should not happen based on earlier checks, but belt-and-suspenders
        console.error("Core UI elements missing!");
        return; 
    }

    statusElement!.textContent = "Verifying access...";
    toggleButton!.disabled = true;
    toggleButton!.style.display = 'none';

    // 1. Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        statusElement!.textContent = "Access Denied: Token missing from URL.";
        console.error("Access token required in URL (?token=...).");
        return; // Stop execution
    }

    // 3. Fetch validation status from serverless function
    try {
        // Adjust path if deploying to Vercel (usually /api/validate-token)
        const response = await fetch(`/.netlify/functions/validate-token?token=${token}`); 
        
        if (!response.ok) {
            throw new Error(`Validation check failed: ${response.statusText}`);
        }

        const validationResult = await response.json();

        // 5. Check result and proceed or block
        if (validationResult?.valid === true) {
            console.log("Token validated successfully.");
            statusElement!.textContent = "Access granted. Ready.";
            toggleButton!.style.display = 'block';
            toggleButton!.disabled = false;
            toggleButton!.textContent = 'Start';
            toggleButton!.addEventListener('click', toggleApp);
        } else {
            const reason = validationResult?.reason || "Invalid token.";
            console.error(`Token validation failed: ${reason}`);
            statusElement!.textContent = `Access Denied: ${reason}`;
            // Keep button hidden/disabled
        }
    } catch (error) {
        console.error("Error during token validation fetch:", error);
        statusElement!.textContent = `Error validating access: ${error instanceof Error ? error.message : 'Network issue'}`;
        // Keep button hidden/disabled
    }
}

// Check if elements exist before proceeding (Keep this check)
if (!videoElement || !canvasElement || !toggleButton || !statusElement) { 
    throw new Error("Required DOM elements not found!");
}

const canvasCtx = canvasElement.getContext('2d');
if (!canvasCtx) {
    throw new Error("Could not get 2D canvas context");
}

// --- State Variables (Typed) ---
let handLandmarker: HandLandmarker | null = null;
// Removed single synth state:
// let synth: Synth | null = null;
// let isSynthTriggered: boolean = false;

// Map to store active synths: Key = landmark ID, Value = { synth: Synth, triggered: boolean }
const activeSynths = new Map<number, { synth: Synth, triggered: boolean }>(); 

let isRunning: boolean = false;
let isInitialized: boolean = false;
let lastVideoTime: number = -1;
let detectedLandmarksResult: HandLandmarkerResult | null = null; 
// Removed isSynthTriggered as it's now part of activeSynths map

// --- Function Definitions (Placeholders with Signatures from design.md) --- 

/** (7.2) Access webcam and link to video element. */
async function setupCamera(): Promise<void> { 
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("getUserMedia() is not supported by your browser");
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                width: VIDEO_WIDTH, 
                height: VIDEO_HEIGHT 
            },
            audio: false, // We only need video
        });

        if (videoElement) {
            videoElement.srcObject = stream;
            // Wait for the stream to load enough to play
            await new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    resolve(undefined); // Resolve the promise when metadata is loaded
                };
            });
             // Optionally set canvas size based on actual video dimensions
            // canvasElement.width = videoElement.videoWidth;
            // canvasElement.height = videoElement.videoHeight;
        } else {
             // This case should ideally not happen due to earlier checks
            throw new Error("Video element is null after guard check?");
        }

    } catch (err) {
        console.error("[setupCamera] Error accessing webcam:", err);
        let message = "Could not access webcam.";
        if (err instanceof DOMException) {
            if (err.name === "NotAllowedError") {
                message = "Webcam access denied. Please allow access in your browser settings.";
            } else if (err.name === "NotFoundError") {
                message = "No webcam found. Please ensure a camera is connected and enabled.";
            } else {
                message = `Error accessing webcam: ${err.name} - ${err.message}`;
            }
        }
        throw new Error(message); // Re-throw the error to be caught by startApp
    }
}

/** (7.3) Load and configure the MediaPipe HandLandmarker model. */
async function loadHandLandmarker(): Promise<void> {
    try {
        // Create FilesetResolver
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_BASE_PATH);
        
        // Create HandLandmarker
        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: HAND_LANDMARKER_MODEL_PATH,
                delegate: "GPU" // Use GPU if available, fallback to CPU
            },
            runningMode: 'VIDEO', // Process frame-by-frame
            numHands: 2, // Detect only one hand for MVP
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        console.log("HandLandmarker model loaded successfully.");

    } catch (err) {
        console.error("[loadHandLandmarker] Error loading model:", err);
        throw new Error(`Failed to load HandLandmarker model: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** (7.4) Initialize Tone.js audio context and create the synthesizer. */
async function setupToneJS(): Promise<void> { 
    // Check if context already exists and is running
    if (Tone.context && Tone.context.state === 'running') {
        console.log("AudioContext already running.");
        return;
    }
    try {
        await Tone.start(); 
        console.log(`Tone.js AudioContext state after start: ${Tone.context.state}`);
        // Check if the context successfully started/resumed
        if (Tone.context.state !== 'running') {
            throw new Error(`AudioContext failed to start or resume. State: ${Tone.context.state}`);
        }

        console.log("Tone.js AudioContext started successfully.");

        // --- REMOVED SINGLE SYNTH CREATION ---
        // synth = new Synth({
        //     // ... synth options ...
        // }).toDestination(); 
        // synth.volume.value = -Infinity; 
        // console.log("Tone.js Synth created and connected.");
        // --- END REMOVAL ---

    } catch (err) {
        console.error("[setupToneJS] Error initializing Tone.js:", err);
        throw new Error(`Failed to setup Tone.js: ${err instanceof Error ? err.message : String(err)}`);
    }
}

/** (7.5) Find the closest MIDI note in the scale. */
function quantizeNote(midiNote: number, scaleMidiNotes: number[]): number {
    if (!scaleMidiNotes || scaleMidiNotes.length === 0) {
        console.warn("[quantizeNote] Scale array is empty or invalid. Returning original note.");
        return midiNote;
    }

    // Ensure the scale is sorted for potentially faster searching (though linear scan is fine for small scales)
    // const sortedScale = [...scaleMidiNotes].sort((a, b) => a - b);

    let closestNote = scaleMidiNotes[0];
    let minDifference = Math.abs(midiNote - closestNote);

    for (let i = 1; i < scaleMidiNotes.length; i++) {
        const scaleNote = scaleMidiNotes[i];
        const difference = Math.abs(midiNote - scaleNote);
        if (difference < minDifference) {
            minDifference = difference;
            closestNote = scaleNote;
        }
        // Optimization: If the scale is sorted, we could potentially break early
        // if (difference > minDifference && scaleNote > midiNote) { break; }
    }

    // console.log(`[quantizeNote] Input: ${midiNote}, Closest: ${closestNote}`); // Debug logging
    return closestNote;
}

/** (7.6) Convert landmark coordinates into frequency and volume. */
function mapCoordinatesToMusic(landmark: NormalizedLandmark): MusicParams {
    if (!landmark) {
        console.warn("[mapCoordinatesToMusic] Invalid landmark received.");
        // Return default silent parameters
        return { frequencyHz: 0, volumeDb: -Infinity, quantizedMidi: 0 }; 
    }
    
    // *** Log Raw Coordinates ***
    // console.log(`Raw Landmark: x=${landmark.x.toFixed(3)}, y=${landmark.y.toFixed(3)}, z=${landmark.z.toFixed(3)}`);

    // --- Pitch Mapping (X-axis, mirrored) ---
    const normalizedX = landmark.x; 
    const mirroredX = 1.0 - normalizedX;
    const midiNoteRaw = MIDI_RANGE[0] + mirroredX * (MIDI_RANGE[1] - MIDI_RANGE[0]);
    const quantizedMidi = quantizeNote(midiNoteRaw, SCALE_NOTES_MIDI);
    const frequencyHz = Tone.Frequency(quantizedMidi, "midi").toFrequency();

    // --- Volume Mapping (Y-axis, inverted) ---
    const normalizedY = landmark.y;
    const invertedY = 1.0 - normalizedY; 
    let volumeDb = VOLUME_RANGE_DB[0] + invertedY * (VOLUME_RANGE_DB[1] - VOLUME_RANGE_DB[0]);
    volumeDb = Math.max(VOLUME_RANGE_DB[0], Math.min(VOLUME_RANGE_DB[1], volumeDb)); 

    // *** Log Calculated Values ***
    // console.log(`  => MidiRaw: ${midiNoteRaw.toFixed(1)}, Quantized: ${quantizedMidi}, Freq: ${frequencyHz.toFixed(1)}, Vol: ${volumeDb.toFixed(1)}`);

    return { frequencyHz, volumeDb, quantizedMidi };
}

/** (7.7) Draw video feed and landmark overlays onto the canvas. */
function drawVisuals(landmarksToDraw: Map<number, NormalizedLandmark>, currentMidiNotes: Map<number, number>): void {
    // Ensure canvas context and elements are available (checked at startup, but good practice)
    if (!canvasCtx || !canvasElement || !videoElement) {
        console.error("[drawVisuals] Canvas context or elements not available.");
        return;
    }

    // Clear the canvas
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw the video frame. Note: video is mirrored via CSS transform: scaleX(-1)
    // We draw it normally onto the canvas.
    canvasCtx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    // Draw landmarks
    if (landmarksToDraw.size > 0) {
        landmarksToDraw.forEach((landmark, landmarkId) => {
            const pixelX = landmark.x * canvasElement.width; 
            const pixelY = landmark.y * canvasElement.height;
            canvasCtx.fillStyle = getFingerColor(landmarkId); 
            canvasCtx.beginPath();
            canvasCtx.arc(pixelX, pixelY, 8, 0, 2 * Math.PI); 
            canvasCtx.fill();
        });
    }
    
    // Draw pitch lines
    if (currentMidiNotes.size > 0) {
        currentMidiNotes.forEach((midiNote, landmarkId) => {
            // Map the MIDI note back to a normalized X value (inverse of mapping)
            const normalizedNoteX = (midiNote - MIDI_RANGE[0]) / (MIDI_RANGE[1] - MIDI_RANGE[0]);
            const normalizedCanvasX = 1.0 - normalizedNoteX; 
            const lineX = normalizedCanvasX * canvasElement.width;

            canvasCtx.strokeStyle = getFingerColor(landmarkId, 0.7); 
            canvasCtx.lineWidth = 2;
            canvasCtx.beginPath();
            canvasCtx.moveTo(lineX, 0);
            canvasCtx.lineTo(lineX, canvasElement.height);
            canvasCtx.stroke();
        });
    }
}

// Helper function to get oscillator type based on landmark ID
function getOscillatorType(landmarkId: number): Tone.ToneOscillatorType {
    switch(landmarkId) {
        case TARGET_LANDMARK_ID_THUMB: return 'sawtooth';
        case TARGET_LANDMARK_ID_INDEX: return 'triangle';
        case TARGET_LANDMARK_ID_MIDDLE: return 'square';
        case TARGET_LANDMARK_ID_RING: return 'sine';
        case TARGET_LANDMARK_ID_PINKY: return 'sine';
        default: return 'sine'; // Default fallback
    }
}

/** (7.8) Main loop for processing video, detecting, mapping, updating audio, drawing. */
function predictWebcam(): void {
    if (!isRunning) {
         console.log("Loop stopped."); 
         return; // Exit if not running
    }

    // Check if prerequisites are met
    if (!handLandmarker || !videoElement || !canvasElement) { 
        console.log("Predict loop waiting for setup or start...");
        if (isRunning) requestAnimationFrame(predictWebcam);
        return;
    }

    let currentMidiNotes = new Map<number, number>(); // Key: landmarkId, Value: midiNote
    let landmarksToDraw = new Map<number, NormalizedLandmark>(); // Key: landmarkId, Value: landmark

    // Ensure video is ready and time has updated
    const startTimeMs = performance.now();
    if (videoElement.readyState < videoElement.HAVE_ENOUGH_DATA) { 
        // Add log here
        console.log(`Video not ready... waiting. readyState: ${videoElement.readyState}`);
        requestAnimationFrame(predictWebcam); 
        return;
    }

    if (lastVideoTime !== videoElement.currentTime) {
        lastVideoTime = videoElement.currentTime;
        const result = handLandmarker.detectForVideo(videoElement, startTimeMs);
        detectedLandmarksResult = result; // Store the full result
        const detectedLandmarkIdsThisFrame = new Set<number>(); // Track LMs *this frame*
        currentMidiNotes.clear(); // Clear notes from previous frame
        landmarksToDraw.clear(); // Clear landmarks from previous frame

        // --- Process Detected Hands (Loop through potentially 2 hands) --- 
        if (result.landmarks && result.landmarks.length > 0) {
            for (let handIndex = 0; handIndex < result.landmarks.length; handIndex++) {
                const handLandmarks = result.landmarks[handIndex];
                
                for (const landmarkId of TARGET_LANDMARK_IDS) {
                    if (handLandmarks && handLandmarks.length > landmarkId) {
                        const fingerTip = handLandmarks[landmarkId];
                        // Create a unique key for the synth map (e.g., handIndex * 100 + landmarkId)
                        // Simple approach: Use landmarkId only (assumes max 1 of each finger across both hands)
                        // If tracking the same finger on both hands is needed later, the key needs handIndex.
                        const synthMapKey = landmarkId; 

                        detectedLandmarkIdsThisFrame.add(synthMapKey);
                        landmarksToDraw.set(synthMapKey, fingerTip); // Store landmark for drawing
                        const { frequencyHz, volumeDb, quantizedMidi } = mapCoordinatesToMusic(fingerTip);
                        currentMidiNotes.set(synthMapKey, quantizedMidi);
                        
                        let synthState = activeSynths.get(synthMapKey);
                        if (!synthState) {
                            console.log(`Creating synth for landmark ${landmarkId}`);
                            // Remove explicit typing for options
                            const synthOptions = {
                                oscillator: { type: getOscillatorType(landmarkId) },
                                envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2 }
                            };
                            const newSynth = new Synth(synthOptions).toDestination();
                            newSynth.volume.value = -Infinity;
                            synthState = { synth: newSynth, triggered: false };
                            activeSynths.set(synthMapKey, synthState);
                        }
                        
                        // Trigger or update synth...
                        const { synth, triggered } = synthState;
                        if (!triggered) {
                            // console.log(`Triggering Attack for ${synthMapKey}!`);
                            synth.triggerAttack(frequencyHz); 
                            synth.volume.value = volumeDb;
                            synthState.triggered = true;
                        } else {
                            synth.frequency.rampTo(frequencyHz, RAMP_TIME);
                            synth.volume.rampTo(volumeDb, RAMP_TIME); 
                        }
                    } 
                } // End loop target landmarks
            } // End loop hands
        }

        // --- Release Synths for Undetected Fingers --- 
        for (const [synthMapKey, synthState] of activeSynths.entries()) {
            if (!detectedLandmarkIdsThisFrame.has(synthMapKey)) {
                // console.log(`Triggering Release for ${synthMapKey}!`);
                synthState.synth.triggerRelease();
                activeSynths.delete(synthMapKey);
            }
        }
    } else {
        // Video time unchanged - Keep drawing existing landmarks and lines
    }

    // Pass the landmarks and notes to drawVisuals
    drawVisuals(landmarksToDraw, currentMidiNotes); 

    // Schedule the next frame
    if (isRunning) {
        requestAnimationFrame(predictWebcam);
    } else {
        console.log("isRunning is false, stopping loop.");
    }
}

/** (NEW) Performs the one-time setup (Called by toggleApp now) */
async function initializeApp(): Promise<void> {
    if (isInitialized) return;
    
    statusElement!.textContent = 'Initializing... Please wait.';
    toggleButton!.disabled = true;
    
    try {
        // Run setups
        await setupToneJS(); 
        statusElement!.textContent = 'Audio ready. Setting up camera...';
        await setupCamera();
        statusElement!.textContent = 'Camera ready. Loading model...';
        await loadHandLandmarker();
        statusElement!.textContent = 'Initialization complete. Ready to start.';
        isInitialized = true; // Mark initialization as complete
        toggleButton!.disabled = false;

    } catch (error) {
        console.error("Initialization failed:", error);
        statusElement!.textContent = `Initialization Error: ${error instanceof Error ? error.message : String(error)}`;
        // Keep button disabled if init fails
    }
}

/** (NEW) Handles Start/Stop button clicks (Called by event listener) */
async function toggleApp(): Promise<void> {
    // Run initialization on first click if needed
    if (!isInitialized) {
        await initializeApp();
        // If initialization failed, don't proceed
        if (!isInitialized) return; 
    }

    // --- Toggle Start/Stop --- 
    isRunning = !isRunning; 

    if (isRunning) {
        console.log("Starting detection loop...");
        statusElement!.textContent = 'Detection running...';
        toggleButton!.textContent = 'Stop';
        toggleButton!.style.backgroundColor = '#ff4d4d';

        // Reset states before starting loop
        lastVideoTime = -1; 
        detectedLandmarksResult = null;
        activeSynths.clear(); // Clear any leftover synths from previous runs
        
        // Ensure AudioContext is running (might be needed if suspended)
        if (Tone.context.state === 'suspended' || Tone.context.state === 'closed') { 
            console.warn(`AudioContext state is ${Tone.context.state}, attempting to resume...`);
            try {
                await Tone.start(); // Try starting again
                // Keep the check for success
                if (Tone.context.state !== 'running') { 
                     throw new Error(`Failed to resume AudioContext. State: ${Tone.context.state}`);
                }
                console.log("AudioContext resumed successfully.");
            } catch (err) {
                console.error("Error resuming AudioContext:", err);
                statusElement!.textContent = `Audio Error: ${err instanceof Error ? err.message : String(err)}. Try refreshing.`;
                isRunning = false; // Prevent loop start
                toggleButton!.textContent = 'Start';
                toggleButton!.style.backgroundColor = ''; 
                return;
            }
        }
        
        predictWebcam(); // Start the loop

    } else {
        console.log("Stopping detection loop...");
        statusElement!.textContent = 'Stopped. Click Start to resume.';
        toggleButton!.textContent = 'Start';
        toggleButton!.style.backgroundColor = ''; 
        
        console.log(`Releasing ${activeSynths.size} active synths.`);
        for (const [landmarkId, synthState] of activeSynths.entries()) {
            console.log(`Releasing synth for ${landmarkId}`);
            synthState.synth.triggerRelease();
        }
        activeSynths.clear(); 
        detectedLandmarksResult = null;
    }
}

// --- Event Listener Setup --- 
// MOVED: Listener is now added inside initializeAndValidate after success
// toggleButton.addEventListener('click', toggleApp); 

// --- Initial Setup --- 
canvasElement.width = VIDEO_WIDTH;
canvasElement.height = VIDEO_HEIGHT;
console.log("AIeremin script loaded. Validating token...");
// statusElement.textContent = "Ready. Click Start!"; // Status set by validation func

// --- Run Validation on Load --- 
initializeAndValidate();

// --- Main Application Logic (Function definitions will replace placeholders above) --- 

// Helper function to get finger color
function getFingerColor(landmarkId: number, alpha: number = 1): string {
    const colorMap: { [key: number]: string } = {
        [TARGET_LANDMARK_ID_THUMB]: `rgba(255, 0, 0, ${alpha})`, // Red
        [TARGET_LANDMARK_ID_INDEX]: `rgba(255, 165, 0, ${alpha})`, // Orange
        [TARGET_LANDMARK_ID_MIDDLE]: `rgba(255, 255, 0, ${alpha})`, // Yellow
        [TARGET_LANDMARK_ID_RING]: `rgba(0, 255, 0, ${alpha})`, // Green
        [TARGET_LANDMARK_ID_PINKY]: `rgba(0, 0, 255, ${alpha})` // Blue
    };
    return colorMap[landmarkId] || `rgba(255, 255, 255, ${alpha})`; // Default white
}