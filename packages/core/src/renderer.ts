import type { ChartLayer, ImageLayer, ProjectDoc, Scene, ShapeLayer, TextLayer } from "./types";
import { evalCamera, evalTransform, evalTransitionIn, seededRand } from "./presets";
import { drawSubtitles } from "./subtitles";

type Ctx2D = CanvasRenderingContext2D;

export interface RenderHooks {
  onImageLoad?: () => void;
}

const imageCache = new Map<string, HTMLImageElement>();

export function getImage(src: string, onLoad?: () => void): HTMLImageElement | null {
  const cached = imageCache.get(src);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  if (typeof document === "undefined") return null;
  const img = new Image();
  img.onload = () => onLoad?.();
  img.src = src;
  imageCache.set(src, img);
  return null;
}

export interface SceneLocator {
  scene: Scene;
  tLocal: number;
}

export function locateScene(doc: ProjectDoc, time: number): SceneLocator | null {
  let t = 0;
  for (let i = 0; i < doc.scenes.length; i++) {
    const s = doc.scenes[i];
    if (time < t + s.duration || i === doc.scenes.length - 1) {
      return { scene: s, tLocal: Math.min(time - t, s.duration) };
    }
    t += s.duration;
  }
  return null;
}

function wrapText(ctx: Ctx2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of para.split(" ")) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

function drawBackground(
  ctx: Ctx2D,
  scene: Scene,
  t: number,
  w: number,
  h: number,
): void {
  const bg = scene.background;
  ctx.save();
  switch (bg.style) {
    case "gradientCalm":
    case "gradientMove": {
      const drift = bg.style === "gradientMove" ? Math.sin(t * 0.6) * 0.15 : 0;
      const grad = ctx.createLinearGradient(w * (0.1 + drift), h * 0.1, w * (0.9 - drift), h * 0.9);
      grad.addColorStop(0, bg.color);
      grad.addColorStop(1, bg.color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case "particles": {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      const rand = seededRand(42);
      for (let i = 0; i < 70; i++) {
        const bx = rand() * w;
        const by = rand() * h;
        const r = (0.002 + rand() * 0.005) * w;
        const speed = 25 + rand() * 70;
        let y = (by - t * speed) % h;
        if (y < 0) y += h;
        ctx.globalAlpha = 0.2 + rand() * 0.4;
        ctx.fillStyle = bg.color2;
        ctx.beginPath();
        ctx.arc(bx, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "waves": {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, bg.color);
      grad.addColorStop(1, bg.color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 3; k++) {
        ctx.globalAlpha = 0.15;
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = h * 0.01;
        ctx.beginPath();
        const baseY = h * (0.6 + k * 0.13);
        const amp = h * 0.03 * (k + 1);
        for (let x = 0; x <= w; x += 12) {
          const y = baseY + Math.sin(x / (w / 3) + t * (1 + k * 0.4)) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "dotsGrid": {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      const step = w / 34;
      for (let x = step / 2; x < w; x += step) {
        for (let y = step / 2; y < h; y += step) {
          const phase = Math.sin(t * 2 + (x + y) / (step * 5));
          ctx.fillStyle = bg.color2;
          ctx.globalAlpha = 0.25 + 0.25 * (phase + 1) * 0.5;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(0.5, step * (0.12 + 0.08 * (phase + 1) * 0.5)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "darkCinema": {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, h);
      grad.addColorStop(0, bg.color2);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      break;
    }
    case "techGrid": {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = bg.color2;
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = Math.max(1, w / 1600);
      const off = (t * 30) % (w / 18);
      for (let x = -w * 0.2; x < w * 1.2; x += w / 18) {
        ctx.beginPath();
        ctx.moveTo(x + off, 0);
        ctx.lineTo(x + off - h * 0.25, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += w / 18) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "paper": {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      const rand = seededRand(7);
      ctx.fillStyle = "rgba(0,0,0,0.06)";
      for (let i = 0; i < 200; i++) ctx.fillRect(rand() * w, rand() * h, 2, 2);
      ctx.strokeStyle = bg.color2;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = w * 0.005;
      ctx.strokeRect(w * 0.025, h * 0.035, w * 0.95, h * 0.93);
      ctx.globalAlpha = 1;
      break;
    }
    case "spotlight": {
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.32, 0, w * 0.5, h * 0.32, h * 0.85);
      grad.addColorStop(0, bg.color2);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.globalAlpha = 0.5 + 0.08 * Math.sin(t * 1.4);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      break;
    }
    default:
      ctx.fillStyle = bg.color;
      ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function roundRectPath(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

interface DrawPass {
  ctx: Ctx2D;
  w: number;
  h: number;
  langText: "rtl" | "ltr";
  sx: number; // scale factor x vs 1920
  sy: number; // vs 1080
}

function drawText(ctx: Ctx2D, pass: DrawPass, layer: TextLayer, clipX: number): void {
  const { w, h } = pass;
  const boxW = layer.w * w;
  ctx.save();
  ctx.direction = pass.langText;
  ctx.font = `${layer.font.weight} ${Math.max(6, Math.round(layer.font.size * pass.sy))}px "${layer.font.family}", sans-serif`;
  ctx.fillStyle = layer.font.color;
  ctx.textBaseline = "middle";
  ctx.textAlign = layer.align === "center" ? "center" : layer.align === "left" ? "left" : "right";
  const lines = wrapText(ctx, layer.text, boxW);
  const lineH = layer.font.size * pass.sy * layer.lineHeight;
  const totalH = lines.length * lineH;
  const anchor =
    layer.align === "center" ? layer.x * w + boxW / 2 : layer.align === "left" ? layer.x * w : layer.x * w + boxW;
  lines.forEach((line, i) => {
    const y = layer.y * h - totalH / 2 + lineH * (i + 0.5);
    let visible = line;
    if (clipX < 1) {
      const chars = Math.max(0, Math.ceil(line.length * clipX));
      visible = line.slice(0, chars);
    }
    if (visible) ctx.fillText(visible, anchor, y);
  });
  ctx.restore();
}

function drawShape(ctx: Ctx2D, pass: DrawPass, layer: ShapeLayer): void {
  const { w, h } = pass;
  const x = layer.x * w;
  const y = layer.y * h;
  const lw = layer.w * w;
  const lh = lw * 0.3;
  ctx.save();
  if (layer.stroke) {
    ctx.strokeStyle = layer.stroke;
    ctx.lineWidth = Math.max(1, layer.strokeWidth * pass.sx);
  }
  switch (layer.shape) {
    case "rect":
      ctx.fillStyle = layer.fill;
      roundRectPath(ctx, x, y, lw, lh, layer.radius * w);
      ctx.fill();
      if (layer.stroke) ctx.stroke();
      break;
    case "circle": {
      ctx.fillStyle = layer.fill;
      ctx.beginPath();
      ctx.arc(x + lw / 2, y + lw / 2, lw / 2, 0, Math.PI * 2);
      ctx.fill();
      if (layer.stroke) ctx.stroke();
      break;
    }
    case "triangle": {
      ctx.fillStyle = layer.fill;
      ctx.beginPath();
      ctx.moveTo(x + lw / 2, y);
      ctx.lineTo(x + lw, y + lh);
      ctx.lineTo(x, y + lh);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "line": {
      ctx.strokeStyle = layer.fill;
      ctx.lineWidth = Math.max(2, lh * 0.25);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lw, y);
      ctx.stroke();
      break;
    }
    case "bar": {
      ctx.fillStyle = layer.fill;
      roundRectPath(ctx, x, y - lh * 0.2, lw, lh * 0.4, lh * 0.2);
      ctx.fill();
      break;
    }
    case "ring": {
      ctx.strokeStyle = layer.fill;
      ctx.lineWidth = lw * 0.08;
      ctx.beginPath();
      ctx.arc(x + lw / 2, y + lw / 2, lw / 2, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function drawImage(
  ctx: Ctx2D,
  pass: DrawPass,
  layer: ImageLayer,
  hooks?: RenderHooks,
): void {
  const { w, h } = pass;
  const x = layer.x * w;
  const y = layer.y * h;
  const lw = layer.w * w;
  const lh = lw * 0.5625;
  const img = getImage(layer.src, () => hooks?.onImageLoad?.());
  if (!img) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    roundRectPath(ctx, x, y, lw, lh, layer.radius * w);
    ctx.fill();
    ctx.restore();
    return;
  }
  const ratio =
    layer.fit === "cover"
      ? Math.max(lw / img.naturalWidth, lh / img.naturalHeight)
      : Math.min(lw / img.naturalWidth, lh / img.naturalHeight);
  const dw = img.naturalWidth * ratio;
  const dh = img.naturalHeight * ratio;
  ctx.save();
  roundRectPath(ctx, x, y, lw, lh, layer.radius * w);
  ctx.clip();
  ctx.drawImage(img, x + (lw - dw) / 2, y + (lh - dh) / 2, dw, dh);
  ctx.restore();
}

function drawChart(
  ctx: Ctx2D,
  pass: DrawPass,
  layer: ChartLayer,
  tLocal: number,
): void {
  const { w, h } = pass;
  const x = layer.x * w;
  const y = layer.y * h;
  const lw = layer.w * w;
  const lh = lw * 0.6;
  const p = Math.min(1, Math.max(0.001, tLocal / Math.max(0.6, layer.animDuration || 1)));
  const colors = layer.colors.length ? layer.colors : ["#6c8cff", "#ffb74a", "#4dd6a0", "#ff7a9c"];
  const maxVal = Math.max(...layer.series.map((s) => s.value), 1);
  ctx.save();
  if (layer.title) {
    ctx.direction = pass.langText;
    ctx.fillStyle = "#1e2330";
    ctx.textAlign = "center";
    ctx.font = `600 ${Math.round(34 * pass.sy)}px "Cairo", sans-serif`;
    ctx.fillText(layer.title, x + lw / 2, Math.max(20 * pass.sy, y - 16 * pass.sy));
  }
  if (layer.chart === "bar") {
    const n = layer.series.length || 1;
    const bw = (lw / n) * 0.6;
    layer.series.forEach((s, i) => {
      const bh = (s.value / maxVal) * lh * p;
      const bx = x + (lw / n) * i + (lw / n - bw) / 2;
      ctx.fillStyle = colors[i % colors.length];
      roundRectPath(ctx, bx, y + lh - bh, bw, Math.max(1, bh), bw * 0.15);
      ctx.fill();
    });
  } else if (layer.chart === "line") {
    const n = layer.series.length;
    if (n >= 2) {
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = Math.max(2, w * 0.0035);
      ctx.lineJoin = "round";
      ctx.beginPath();
      layer.series.forEach((s, i) => {
        const px = x + (lw / (n - 1)) * i;
        const py = y + lh - (s.value / maxVal) * lh * p;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  } else if (layer.chart === "pie") {
    const total = layer.series.reduce((a, s) => a + s.value, 0) || 1;
    const cx = x + lw / 2;
    const cy = y + lh / 2;
    const r = Math.min(lw, lh) / 2;
    let angle = -Math.PI / 2;
    layer.series.forEach((s, i) => {
      const sweep = (s.value / total) * Math.PI * 2 * p;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = colors[i % colors.length];
      ctx.fill();
      angle += (s.value / total) * Math.PI * 2;
    });
  }
  ctx.restore();
}

function drawScene(
  ctx: Ctx2D,
  doc: ProjectDoc,
  scene: Scene,
  tLocal: number,
  w: number,
  h: number,
  hooks?: RenderHooks,
): void {
  const tr = evalTransitionIn(tLocal, scene.transitionIn, scene.transitionDuration);
  const cam = evalCamera(scene, tLocal);
  ctx.save();
  ctx.globalAlpha = tr.alpha * ctx.globalAlpha;
  ctx.translate(tr.translateX * w, tr.translateY * h);
  ctx.scale(tr.scale, tr.scale);
  if (tr.wipe < 1) {
    ctx.beginPath();
    ctx.rect(-w, -h, w * 3 * tr.wipe, h * 3);
    ctx.clip();
  }
  ctx.translate(w * (1 - cam.zoom) * 0.5 - cam.panX * w * 0.1, h * (1 - cam.zoom) * 0.5 - cam.panY * h * 0.1);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(cam.panX * w * 0.1, cam.panY * h * 0.1);

  drawBackground(ctx, scene, tLocal, w, h);

  const pass: DrawPass = {
    ctx,
    w,
    h,
    langText: doc.lang === "ar" ? "rtl" : "ltr",
    sx: w / 1920,
    sy: h / 1080,
  };

  for (const layer of scene.layers) {
    const t = tLocal - layer.startAt;
    const tf = evalTransform(layer, t, w, h);
    const effX = tf.effX ?? layer.x;
    const effY = tf.effY ?? layer.y;
    const drawLayer = (tf.effX !== undefined || tf.effY !== undefined) ? { ...layer, x: effX, y: effY } : layer;
    ctx.save();
    const cx = effX * w + (layer.w * w) / 2 + tf.offsetX;
    const cy = effY * h + (layer.kind === "text" ? 0 : layer.w * w * 0.15) + tf.offsetY;
    ctx.translate(cx, cy);
    ctx.rotate(((tf.absRot ?? tf.rot + layer.rot) * Math.PI) / 180);
    ctx.scale(tf.scale, tf.scale);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = Math.max(0, Math.min(1, tf.alpha * layer.opacity));
    if (tf.blur > 0.3) ctx.filter = `blur(${tf.blur}px)`;
    let clipX = tf.clipX;
    if (t < 0 && layer.anim !== "pulse" && layer.anim !== "shake") {
      const before = evalTransform(layer, -1, w, h);
      ctx.globalAlpha = 0;
      clipX = before.clipX;
    }
    if (clipX < 1) {
      ctx.beginPath();
      ctx.rect(effX * w - w, effY * h - h, (layer.w * w + 2 * w) * clipX, h * 3);
      ctx.clip();
    }
    switch (layer.kind) {
      case "text":
        drawText(ctx, pass, drawLayer as typeof layer, clipX);
        break;
      case "shape":
        drawShape(ctx, pass, drawLayer as typeof layer);
        break;
      case "image":
        drawImage(ctx, pass, drawLayer as typeof layer, hooks);
        break;
      case "chart":
        drawChart(ctx, pass, drawLayer as typeof layer, t);
        break;
    }
    ctx.restore();
    ctx.filter = "none";
  }
  ctx.restore();
}

/** Draw one complete frame of the document at global time. */
export function drawFrameAt(
  doc: ProjectDoc,
  ctx: Ctx2D,
  w: number,
  h: number,
  time: number,
  hooks?: RenderHooks,
): void {
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  const loc = locateScene(doc, time);
  if (loc) {
    drawScene(ctx, doc, loc.scene, loc.tLocal, w, h, hooks);
  }
  if (doc.subtitleStyle.enabled && doc.subtitles.length) {
    drawSubtitles(doc, ctx, w, h, time);
  }
  ctx.restore();
}

/** Render a static thumbnail (first frame) of a document onto a canvas. */
export function renderThumbnail(
  doc: ProjectDoc,
  canvas: HTMLCanvasElement,
  sceneIndex = 0,
  hooks?: RenderHooks,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const scene = doc.scenes[Math.min(sceneIndex, doc.scenes.length - 1)];
  if (!scene) {
    ctx.fillStyle = "#1c2233";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const saved = doc.subtitleStyle.enabled;
  doc.subtitleStyle.enabled = false;
  const time = Math.min(1.2, scene.duration * 0.6);
  let t = 0;
  for (let i = 0; i < sceneIndex; i++) t += doc.scenes[i].duration;
  drawFrameAt(doc, ctx, canvas.width, canvas.height, t + time, hooks);
  doc.subtitleStyle.enabled = saved;
}
