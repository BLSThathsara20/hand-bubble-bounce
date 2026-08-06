import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

/** Index fingertip only */
const INDEX_TIP = 8;

export type FingerPoint = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type HandsTracker = {
  detectIndex: (video: HTMLVideoElement, nowMs: number) => FingerPoint | null;
  close: () => void;
};

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

async function createLandmarker(delegate: "GPU" | "CPU") {
  const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function createHandsTracker(): Promise<HandsTracker> {
  let landmarker: HandLandmarker;
  try {
    landmarker = await createLandmarker("GPU");
  } catch {
    landmarker = await createLandmarker("CPU");
  }

  let prev: { x: number; y: number; t: number } | null = null;
  let lastVideoTime = -1;
  let cached: FingerPoint | null = null;
  let lastDetectMs = 0;
  const minDetectInterval = 1000 / 30;

  return {
    detectIndex: (video, nowMs) => {
      if (video.readyState < 2) return cached;
      if (video.currentTime === lastVideoTime) {
        if (nowMs - lastDetectMs < minDetectInterval) return cached;
      }
      if (video.currentTime === lastVideoTime) return cached;

      lastVideoTime = video.currentTime;
      lastDetectMs = nowMs;

      const result = landmarker.detectForVideo(video, nowMs);
      const hand = result.landmarks?.[0];
      if (!hand) {
        prev = null;
        cached = null;
        return null;
      }

      const lm = hand[INDEX_TIP] as NormalizedLandmark;
      let vx = 0;
      let vy = 0;
      if (prev) {
        const dt = Math.max((nowMs - prev.t) / 1000, 1 / 120);
        vx = (lm.x - prev.x) / dt;
        vy = (lm.y - prev.y) / dt;
      }
      prev = { x: lm.x, y: lm.y, t: nowMs };
      cached = { x: lm.x, y: lm.y, vx, vy };
      return cached;
    },
    close: () => landmarker.close(),
  };
}
