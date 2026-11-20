// Builds complete scenes (background + text + accent shapes/charts) from script lines.
//offline — no AI required.

import type {
  BackgroundSpec,
  ChartLayer,
  Layer,
  ProjectDoc,
  Scene,
  ShapeLayer,
  TextLayer,
} from "./types";
import { uid } from "./types";
import { estimateSceneDuration, extractTitleSafe } from "./helpers";
import type { ScenePlan, StyleId, VideoTypeId, VisualKind } from "./script";

export interface Palette {
  nameAr: string;
  bg: BackgroundSpec;
  accent: string;
  textColor: string;
  muted: string;
}

export const PALETTES: Record<StyleId, Palette> = {
  cinematic: {
    nameAr: "سينمائي",
    bg: { style: "darkCinema", color: "#11121d", color2: "#2a3d66" },
    accent: "#e8b84b",
    textColor: "#f5f2ea",
    muted: "#aab3cc",
  },
  professional: {
    nameAr: "احترافي",
    bg: { style: "gradientCalm", color: "#0f2a5c", color2: "#1e88e5" },
    accent: "#ffd54a",
    textColor: "#ffffff",
    muted: "#d3e2f7",
  },
  threed: {
    nameAr: "ثلاثي الأبعاد",
    bg: { style: "gradientMove", color: "#241b4d", color2: "#7c4dff" },
    accent: "#00e5c3",
    textColor: "#ffffff",
    muted: "#cfc7f2",
  },
  infographic: {
    nameAr: "إنفوغرافيك",
    bg: { style: "paper", color: "#f8f5ef", color2: "#e0d6c4" },
    accent: "#ef6f61",
    textColor: "#22303f",
    muted: "#5c6b7a",
  },
  minimal: {
    nameAr: "بسيط وأنيق",
    bg: { style: "solid", color: "#101418", color2: "#f6c453" },
    accent: "#f6c453",
    textColor: "#ffffff",
    muted: "#b8bfc7",
  },
  tech: {
    nameAr: "تقني",
    bg: { style: "techGrid", color: "#05080f", color2: "#27e0ff" },
    accent: "#27e0ff",
    textColor: "#eaf6ff",
    muted: "#7fa6bd",
  },
  documentary: {
    nameAr: "وثائقي",
    bg: { style: "spotlight", color: "#161312", color2: "#c79a5b" },
    accent: "#d9a05b",
    textColor: "#f4ede1",
    muted: "#b9ac97",
  },
};

const VERTICAL_TYPES: VideoTypeId[] = ["reels"];

export function canvasForType(type: VideoTypeId): { width: number; height: number; fps: 30 } {
  if (VERTICAL_TYPES.includes(type)) return { width: 1080, height: 1920, fps: 30 };
  return { width: 1920, height: 1080, fps: 30 };
}

let sceneCounter = 0;
export function resetSceneCounter(): void {
  sceneCounter = 0;
}

export function textLayer(
  text: string,
  opts: Partial<TextLayer> & { palette: Palette },
): TextLayer {
  return {
    id: uid("lay"),
    kind: "text",
    name: "نص",
    x: 0.1,
    y: 0.32,
    w: 0.8,
    opacity: 1,
    startAt: 0.15,
    anim: "fadeInUp",
    animDuration: 0.8,
    animDelay: 0,
    rot: 0,
    align: "center",
    lineHeight: 1.45,
    font: {
      family: "Cairo",
      size: 84,
      weight: 700,
      color: opts.palette.textColor,
    },
    text,
    ...opts,
  };
}

export function accentShape(
  accent: string,
  index: number,
  y = 0.62,
): ShapeLayer {
  const patterns = ["bar", "ring", "circle", "rect"] as const;
  return {
    id: uid("lay"),
    kind: "shape",
    name: "شكل",
    shape: patterns[index % patterns.length],
    x: 0.5 - 0.09,
    y,
    w: 0.18,
    opacity: 0.95,
    startAt: 0.5,
    anim: index % 2 === 0 ? "scaleUp" : "wipeIn",
    animDuration: 0.9,
    animDelay: 0.1,
    rot: 0,
    fill: accent,
    stroke: null,
    strokeWidth: 3,
    radius: 0.06,
  };
}

export function counterChart(title: string, values: { label: string; value: number }[]): ChartLayer {
  return {
    id: uid("lay"),
    kind: "chart",
    name: "رسم بياني",
    chart: "bar",
    x: 0.18,
    y: 0.3,
    w: 0.64,
    opacity: 1,
    startAt: 0.4,
    anim: "fadeIn",
    animDuration: 1.2,
    animDelay: 0,
    rot: 0,
    series: values,
    colors: ["#6c8cff", "#ffb74a", "#4dd6a0", "#ff7a9c", "#c792ea"],
    title,
  };
}

export function buildScene(line: string, index: number, palette: Palette, vertical: boolean): Scene {
  const fontSize = vertical ? 64 : 84;
  const title = extractTitleSafe(line);
  const layers: Layer[] = [];
  if (index === 0) {
    layers.push(
      textLayer(line.length > 90 ? line.slice(0, 90) + "…" : line, {
        palette,
        y: 0.42,
        font: { family: "Cairo", size: fontSize, weight: 800, color: palette.textColor },
        anim: "popIn",
        animDuration: 1,
      }),
    );
    layers.push(accentShape(palette.accent, 0, vertical ? 0.56 : 0.62));
  } else {
    layers.push(
      textLayer(line.length > 110 ? line.slice(0, 110) + "…" : line, {
        palette,
        y: 0.38,
        font: { family: "Cairo", size: Math.round(fontSize * 0.78), weight: 700, color: palette.textColor },
        anim: "fadeInUp",
        animDuration: 0.8,
        align: "center",
      }),
    );
    if (index % 3 === 1) layers.push(accentShape(palette.accent, index, vertical ? 0.52 : 0.58));
    if (index % 3 === 2) {
      layers.push(
        counterChart("", [
          { label: "١", value: 40 + index * 7 },
          { label: "٢", value: 65 + index * 4 },
          { label: "٣", value: 85 },
          { label: "٤", value: 55 },
        ]),
      );
    }
  }
  return {
    id: uid("scn"),
    title,
    script: line,
    duration: estimateSceneDuration(line),
    background: palette.bg,
    transitionIn: index === 0 ? "fade" : index % 2 === 0 ? "slideLeft" : "slideUp",
    transitionDuration: 0.6,
    camera: { zoom: index % 2 === 0 ? 1.05 : 1.12, panX: 0, panY: 0 },
    layers,
    voiceScript: line,
  };
}

export function buildDocFromScript(
  doc: ProjectDoc,
  lines: string[],
  style: StyleId,
  type: VideoTypeId,
): ProjectDoc {
  const palette = PALETTES[style];
  doc.canvas = canvasForType(type);
  doc.scenes = lines.map((line, i) => buildScene(line, i, palette, VERTICAL_TYPES.includes(type)));
  return doc;
}

export function buildSceneFromPlan(
  plan: ScenePlan,
  index: number,
  palette: Palette,
  vertical: boolean,
): Scene {
  const fontSize = vertical ? 60 : 80;
  const onScreen = plan.onScreen.length > 110 ? plan.onScreen.slice(0, 110) + "…" : plan.onScreen;
  const layers: Layer[] = [];
  const kind: VisualKind = plan.kind ?? (index === 0 ? "title" : index % 4 === 2 ? "chart" : "point");
  if (kind === "title") {
    layers.push(
      textLayer(onScreen, {
        palette,
        y: vertical ? 0.4 : 0.42,
        font: { family: "Cairo", size: fontSize, weight: 800, color: palette.textColor },
        anim: "popIn",
        animDuration: 1,
      }),
    );
    layers.push(accentShape(palette.accent, 0, vertical ? 0.56 : 0.62));
  } else if (kind === "chart") {
    layers.push(
      textLayer(onScreen, {
        palette,
        y: 0.22,
        font: { family: "Cairo", size: Math.round(fontSize * 0.6), weight: 700, color: palette.textColor },
        anim: "fadeInDown",
        animDuration: 0.7,
      }),
    );
    layers.push(
      counterChart("", [
        { label: "\u0661", value: 35 + ((index * 11) % 25) },
        { label: "\u0662", value: 55 + ((index * 7) % 30) },
        { label: "\u0663", value: 70 + ((index * 5) % 25) },
        { label: "\u0664", value: 45 + ((index * 13) % 30) },
      ]),
    );
  } else if (kind === "cta") {
    layers.push(
      textLayer(onScreen, {
        palette,
        y: 0.46,
        font: { family: "Cairo", size: Math.round(fontSize * 0.9), weight: 900, color: palette.textColor },
        anim: "pulse",
        animDuration: 0.9,
      }),
    );
    layers.push(accentShape(palette.accent, 1, vertical ? 0.6 : 0.66));
  } else {
    layers.push(
      textLayer(onScreen, {
        palette,
        y: 0.36,
        font: { family: "Cairo", size: Math.round(fontSize * 0.78), weight: 700, color: palette.textColor },
        anim: index % 2 === 0 ? "fadeInUp" : "fadeInRight",
        animDuration: 0.8,
      }),
    );
    if (index % 3 === 1) layers.push(accentShape(palette.accent, index, vertical ? 0.52 : 0.58));
  }
  return {
    id: uid("scn"),
    title: plan.title,
    script: plan.onScreen,
    duration: plan.duration > 0 ? plan.duration : estimateSceneDuration(plan.onScreen),
    background: palette.bg,
    transitionIn:
      index === 0 ? "fade" : index % 3 === 0 ? "slideLeft" : index % 3 === 1 ? "slideUp" : "zoomIn",
    transitionDuration: 0.6,
    camera: { zoom: index % 2 === 0 ? 1.05 : 1.12, panX: index % 3 === 1 ? 0.02 : 0, panY: 0 },
    layers,
    voiceScript: plan.voiceover,
  };
}

export function buildDocFromPlan(
  doc: ProjectDoc,
  plan: {
    topic: string;
    targetSeconds: number;
    scenes: ScenePlan[];
  },
  style: StyleId,
  type: VideoTypeId,
  metaIdea?: string,
): ProjectDoc {
  const palette = PALETTES[style];
  doc.canvas = canvasForType(type);
  const vertical = VERTICAL_TYPES.includes(type);
  doc.scenes = plan.scenes.map((scenePlan, i) => {
    const last = i === plan.scenes.length - 1;
    const planScene: ScenePlan = last && plan.scenes.length > 2 ? { ...scenePlan, kind: "cta" } : scenePlan;
    return buildSceneFromPlan(planScene, i, palette, vertical);
  });
  doc.meta = {
    idea: metaIdea ?? plan.topic,
    type,
    style,
    plan: plan.scenes,
  };
  return doc;
}
