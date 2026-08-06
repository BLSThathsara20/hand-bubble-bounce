export type CameraHandle = {
  video: HTMLVideoElement;
  stream: MediaStream;
  stop: () => void;
};

export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 30 },
    },
  });

  video.srcObject = stream;
  video.playsInline = true;
  video.muted = true;

  await video.play();
  await waitForVideoSize(video);

  return {
    video,
    stream,
    stop: () => {
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}

function waitForVideoSize(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();

  return new Promise((resolve) => {
    const onReady = () => {
      if (video.videoWidth > 0) {
        video.removeEventListener("loadedmetadata", onReady);
        resolve();
      }
    };
    video.addEventListener("loadedmetadata", onReady);
  });
}

/**
 * Map normalized video landmark → canvas CSS pixels with object-fit: cover
 * and horizontal mirror (video uses CSS scaleX(-1)).
 */
export function mapMirroredCoverPoint(
  nx: number,
  ny: number,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  const vw = videoW || canvasW;
  const vh = videoH || canvasH;
  const scale = Math.max(canvasW / vw, canvasH / vh);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const offsetX = (canvasW - drawW) / 2;
  const offsetY = (canvasH - drawH) / 2;
  return {
    x: offsetX + (1 - nx) * drawW,
    y: offsetY + ny * drawH,
  };
}

export function canvasToNormMirrored(
  x: number,
  y: number,
  videoW: number,
  videoH: number,
  canvasW: number,
  canvasH: number,
): { nx: number; ny: number } {
  const vw = videoW || canvasW;
  const vh = videoH || canvasH;
  const scale = Math.max(canvasW / vw, canvasH / vh);
  const drawW = vw * scale;
  const drawH = vh * scale;
  const offsetX = (canvasW - drawW) / 2;
  const offsetY = (canvasH - drawH) / 2;
  const nx = 1 - (x - offsetX) / drawW;
  const ny = (y - offsetY) / drawH;
  return {
    nx: Math.min(1, Math.max(0, nx)),
    ny: Math.min(1, Math.max(0, ny)),
  };
}
