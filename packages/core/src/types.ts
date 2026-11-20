// Core document model for Motion Studio AI Pro (Arabic-first).

import type { StyleId, VideoTypeId } from "./script";

export const SCHEMA_VERSION = 1;

export type Lang = "ar" | "en";

export type SceneTransitionId =
  | "none"
  | "fade"
  | "slideLeft"
  | "slideUp"
  | "zoomIn"
  | "wipeRight";

export type BackgroundStyleId =
  | "solid"
  | "gradientCalm"
  | "gradientMove"
  | "particles"
  | "waves"
  | "dotsGrid"
  | "darkCinema"
  | "techGrid"
  | "paper"
  | "spotlight";

export type MotionPresetId =
  | "none"
  | "fadeIn"
  | "fadeInUp"
  | "fadeInDown"
  | "fadeInRight"
  | "fadeInLeft"
  | "scaleUp"
  | "popIn"
  | "typewriter"
  | "rotateIn"
  | "wipeIn"
  | "bounceIn"
  | "blurIn"
  | "pulse"
  | "shake";

export type ChartKind = "bar" | "line" | "pie";

export interface CanvasSpec {
  width: number;
  height: number;
  fps: 24 | 25 | 30 | 60;
}

export interface FontSpec {
  family: string;
  size: number;
  weight: number;
  color: string;
}

export interface BaseLayer {
  id: string;
  name: string;
  x: number; // ratio 0..1 of canvas width
  y: number; // ratio 0..1
  w: number; // ratio 0..1
  opacity: number;
  startAt: number; // seconds, scene-relative
  anim: MotionPresetId;
  animDuration: number;
  animDelay: number;
  rot: number; // degrees
}

export interface TextLayer extends BaseLayer {
  kind: "text";
  text: string;
  font: FontSpec;
  align: "right" | "center" | "left";
  lineHeight: number;
}

export interface ShapeLayer extends BaseLayer {
  kind: "shape";
  shape: "rect" | "circle" | "triangle" | "line" | "bar" | "ring";
  fill: string;
  stroke: string | null;
  strokeWidth: number;
  radius: number;
}

export interface ImageLayer extends BaseLayer {
  kind: "image";
  src: string; // data URL or asset reference
  fit: "cover" | "contain";
  radius: number;
}

export interface ChartLayer extends BaseLayer {
  kind: "chart";
  chart: ChartKind;
  series: { label: string; value: number }[];
  colors: string[];
  title: string | null;
}

export type Layer = TextLayer | ShapeLayer | ImageLayer | ChartLayer;

export interface BackgroundSpec {
  style: BackgroundStyleId;
  color: string;
  color2: string;
}

export interface Scene {
  id: string;
  title: string;
  script: string;
  duration: number;
  background: BackgroundSpec;
  transitionIn: SceneTransitionId;
  transitionDuration: number;
  camera: { zoom: number; panX: number; panY: number };
  layers: Layer[];
  voiceScript: string;
}

export interface AudioTrack {
  id: string;
  assetId: string;
  name: string;
  role: "music" | "voice" | "sfx";
  startAt: number;
  inPoint: number;
  outPoint: number | null;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  sceneId?: string;
}

export interface SubtitleCue {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface VoiceSettings {
  mode: "none" | "piper" | "upload" | "system";
  voice: string | null;
  speed: number;
}

export interface ProjectDoc {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lang: Lang;
  canvas: CanvasSpec;
  scenes: Scene[];
  audio: AudioTrack[];
  subtitles: SubtitleCue[];
  subtitleStyle: {
    enabled: boolean;
    fontSize: number;
    color: string;
    highlightColor: string;
    position: number;
    animated: boolean;
  };
  voice: VoiceSettings;
  quality: "draft" | "balanced" | "high";
  meta?: {
    idea?: string;
    type?: VideoTypeId;
    style?: StyleId;
    plan?: { title: string; onScreen: string; voiceover: string; visual: string; duration: number }[];
  };
}

export interface StoryboardCard {
  sceneIndex: number;
  title: string;
  script: string;
  duration: number;
}

let counter = 0;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export interface SceneTiming {
  index: number;
  start: number;
  end: number;
}

export function sceneTimings(doc: ProjectDoc): SceneTiming[] {
  let t = 0;
  return doc.scenes.map((s, index) => {
    const timing = { index, start: t, end: t + s.duration };
    t += s.duration;
    return timing;
  });
}

export function totalDuration(doc: ProjectDoc): number {
  return doc.scenes.reduce((a, s) => a + s.duration, 0);
}

export function sceneAt(doc: ProjectDoc, time: number): SceneTiming | null {
  const timings = sceneTimings(doc);
  for (const t of timings) {
    if (time >= t.start && time < t.end) return t;
  }
  return timings.length ? { ...timings[timings.length - 1] } : null;
}

export function newDoc(name = "مشروع جديد", lang: Lang = "ar"): ProjectDoc {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid("prj"),
    name,
    createdAt: now,
    updatedAt: now,
    lang,
    canvas: { width: 1920, height: 1080, fps: 30 },
    scenes: [],
    audio: [],
    subtitles: [],
    subtitleStyle: {
      enabled: true,
      fontSize: 48,
      color: "#ffffff",
      highlightColor: "#ffd54a",
      position: 0.9,
      animated: true,
    },
    voice: { mode: "none", voice: null, speed: 1 },
    quality: "balanced",
  };
}
