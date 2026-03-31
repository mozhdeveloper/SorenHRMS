"use client";

/**
 * Client-side face detection and embedding using face-api.js
 *
 * Uses TensorFlow.js (WebGL) to compute real 128-dimensional face descriptors.
 * Models are loaded from /models/face-api/ (SSD MobileNet + Landmarks + Recognition).
 *
 * Architecture:
 * - Browser computes embeddings (no server ML needed)
 * - Server stores/compares embeddings (Supabase PostgreSQL function)
 * - Qwen AI handles liveness detection only (anti-spoofing layer)
 */

import * as faceapi from "@vladmandic/face-api";

const MODEL_URL = "/models/face-api";
let modelsLoaded = false;
let modelsLoading: Promise<void> | null = null;

/**
 * Load face-api.js models (SSD MobileNet, Landmarks, Recognition).
 * Safe to call multiple times — only loads once.
 */
export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (modelsLoading) return modelsLoading;

  console.log("[face-api] Loading face models from", MODEL_URL);
  const startTime = performance.now();

  modelsLoading = (async () => {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log(`[face-api] Models loaded in ${(performance.now() - startTime).toFixed(0)}ms (SSD MobileNet + Landmarks + Recognition)`);
  })();

  return modelsLoading;
}

/**
 * Check if models are loaded.
 */
export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

export interface FaceDetectionResult {
  /** 128-dimensional face descriptor */
  descriptor: number[];
  /** Detection confidence score (0-1) */
  score: number;
  /** Bounding box of detected face */
  box: { x: number; y: number; width: number; height: number };
}

/**
 * Detect a single face and compute its 128-d embedding.
 * Returns null if no face found or detection confidence < 0.6.
 */
export async function detectFace(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<FaceDetectionResult | null> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const result = await faceapi
    .detectSingleFace(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!result) {
    console.debug("[face-api] detectFace: no face found (minConfidence=0.6)");
    return null;
  }

  const desc = Array.from(result.descriptor);
  const norm = Math.sqrt(desc.reduce((s, v) => s + v * v, 0));
  console.debug(`[face-api] detectFace: score=${result.detection.score.toFixed(3)} box=${Math.round(result.detection.box.width)}x${Math.round(result.detection.box.height)} embNorm=${norm.toFixed(4)}`);

  return {
    descriptor: desc,
    score: result.detection.score,
    box: {
      x: result.detection.box.x,
      y: result.detection.box.y,
      width: result.detection.box.width,
      height: result.detection.box.height,
    },
  };
}

/**
 * Average multiple 128-d descriptors into a single representative descriptor.
 * Averaging reduces noise from single-frame detection jitter and produces a
 * more stable embedding for verification.
 *
 * The result is L2-normalized to unit length for consistent distance
 * computation with the server-side matching (which also L2-normalizes).
 */
export function averageDescriptors(descriptors: number[][]): number[] {
  if (descriptors.length === 0) return [];
  if (descriptors.length === 1) return descriptors[0];
  const dim = descriptors[0].length;
  const avg = new Array<number>(dim).fill(0);
  for (const desc of descriptors) {
    for (let i = 0; i < dim; i++) avg[i] += desc[i];
  }
  for (let i = 0; i < dim; i++) avg[i] /= descriptors.length;

  // L2-normalize the averaged descriptor
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += avg[i] * avg[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) avg[i] /= norm;
  }

  return avg;
}

/**
 * Compute the consistency of a set of descriptors by measuring
 * average pairwise distance. Low values mean consistent detections.
 * Returns average pairwise euclidean distance.
 */
export function descriptorConsistency(descriptors: number[][]): number {
  if (descriptors.length < 2) return 0;
  let total = 0;
  let count = 0;
  for (let i = 0; i < descriptors.length; i++) {
    for (let j = i + 1; j < descriptors.length; j++) {
      total += computeDistance(descriptors[i], descriptors[j]);
      count++;
    }
  }
  return total / count;
}

/**
 * Detect ALL faces in an image (for multi-face validation).
 */
export async function detectAllFaces(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<FaceDetectionResult[]> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const results = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptors();

  return results.map((r) => ({
    descriptor: Array.from(r.descriptor),
    score: r.detection.score,
    box: {
      x: r.detection.box.x,
      y: r.detection.box.y,
      width: r.detection.box.width,
      height: r.detection.box.height,
    },
  }));
}

/**
 * Compute euclidean distance between two 128-d descriptors.
 * Lower = more similar. Threshold ~0.6 for same person.
 */
export function computeDistance(desc1: number[], desc2: number[]): number {
  if (desc1.length !== desc2.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    sum += (desc1[i] - desc2[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/** Threshold for face matching (euclidean distance). Below this = same person.
 * face-api.js same-person distance across sessions typically 0.3–0.55;
 * inter-person distance usually > 0.9. 0.75 balances accuracy vs convenience.
 */
export const FACE_MATCH_THRESHOLD = 0.75;

// ─── Lightweight tracking (no descriptor computation) ────────────────────────

export interface FaceTrackingResult {
  /** Detection confidence score (0-1) */
  score: number;
  /** Bounding box of detected face */
  box: { x: number; y: number; width: number; height: number };
  /** Estimated head yaw: negative = turned left, positive = turned right, 0 = front */
  yaw: number;
  /** Number of faces detected */
  faceCount: number;
}

/**
 * Fast face tracking without descriptor computation (~3-5x faster than detectFace).
 * Returns bounding box, confidence, estimated head yaw, and face count.
 * Used for real-time UI guidance during enrollment/verification.
 */
export async function detectFaceQuick(
  input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
): Promise<FaceTrackingResult | null> {
  if (!modelsLoaded) {
    await loadFaceModels();
  }

  const allResults = await faceapi
    .detectAllFaces(input, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }))
    .withFaceLandmarks();

  if (!allResults.length) {
    console.debug("[face-api] detectFaceQuick: no faces found (minConfidence=0.4)");
    return null;
  }

  // Use the largest/most-confident face
  const best = allResults.reduce((a, b) =>
    a.detection.score > b.detection.score ? a : b
  );

  // Estimate yaw from landmarks: compare nose tip X vs face center X
  // Landmark indices: nose tip = 30, jaw left = 0, jaw right = 16
  const landmarks = best.landmarks.positions;
  const noseTip = landmarks[30];
  const jawLeft = landmarks[0];
  const jawRight = landmarks[16];

  const faceCenterX = (jawLeft.x + jawRight.x) / 2;
  const faceWidth = jawRight.x - jawLeft.x;

  // Yaw: normalized offset of nose from face center (-1 to +1)
  // On raw front-camera video: Negative = user turned RIGHT, Positive = user turned LEFT
  const yaw = faceWidth > 0 ? (noseTip.x - faceCenterX) / (faceWidth * 0.5) : 0;

  console.debug(`[face-api] detectFaceQuick: faces=${allResults.length} score=${best.detection.score.toFixed(3)} yaw=${yaw.toFixed(2)} box=${Math.round(best.detection.box.width)}x${Math.round(best.detection.box.height)}`);

  return {
    score: best.detection.score,
    box: {
      x: best.detection.box.x,
      y: best.detection.box.y,
      width: best.detection.box.width,
      height: best.detection.box.height,
    },
    yaw,
    faceCount: allResults.length,
  };
}
