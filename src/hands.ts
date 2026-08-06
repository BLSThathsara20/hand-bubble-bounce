import {
  FilesetResolver,
  HandLandmarker,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

const TIP_INDICES = [4, 8, 12, 16, 20] as const;

export type Fingertip = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  handIndex: number;
  tipIndex: number;
};

export type HandsTracker = {
  detect: (video: HTMLVideoElement, nowMs: number) => Fingertip[];
  close: () => void;
};

type TipState = {
  x: number;
  y: number;
  t: number;
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
    numHands: 2,
    minHandDetectionConfidence: 0.5,
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

  const prev = new Map<string, TipState>();
  let lastVideoTime = -1;
  let cached: Fingertip[] = [];
  let lastDetectMs = 0;
  const minDetectInterval = 1000 / 30;

  const detect = (video: HTMLVideoElement, nowMs: number): Fingertip[] => {
    if (video.readyState < 2) return cached;
    if (nowMs - lastDetectMs < minDetectInterval && video.currentTime === lastVideoTime) {
      return cached;
    }
    if (video.currentTime === lastVideoTime) return cached;

    lastVideoTime = video.currentTime;
    lastDetectMs = nowMs;

    const result = landmarker.detectForVideo(video, nowMs);
    const tips: Fingertip[] = [];
    const hands = result.landmarks ?? [];

    for (let h = 0; h < hands.length; h++) {
      const landmarks = hands[h];
      for (const tipIndex of TIP_INDICES) {
        const lm = landmarks[tipIndex] as NormalizedLandmark | undefined;
        if (!lm) continue;

        const key = `${h}:${tipIndex}`;
        const prevState = prev.get(key);
        let vx = 0;
        let vy = 0;
        if (prevState) {
          const dt = Math.max((nowMs - prevState.t) / 1000, 1 / 120);
          vx = (lm.x - prevState.x) / dt;
          vy = (lm.y - prevState.y) / dt;
        }
        prev.set(key, { x: lm.x, y: lm.y, t: nowMs });

        tips.push({
          x: lm.x,
          y: lm.y,
          vx,
          vy,
          handIndex: h,
          tipIndex,
        });
      }
    }

    // Drop stale tip keys when hands leave
    if (tips.length === 0) prev.clear();

    cached = tips;
    return tips;
  };

  return {
    detect,
    close: () => landmarker.close(),
  };
}
