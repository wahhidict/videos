// Project document operations: editing, autosave serialization, migration, io.

import type { Layer, ProjectDoc, Scene } from "./types";
import { SCHEMA_VERSION, newDoc, uid } from "./types";

export interface SceneOps {
  duplicateScene(doc: ProjectDoc, index: number): void;
  deleteScene(doc: ProjectDoc, index: number): void;
  moveScene(doc: ProjectDoc, from: number, to: number): void;
  setSceneDuration(doc: ProjectDoc, index: number, seconds: number): void;
  addLayer(doc: ProjectDoc, sceneIndex: number, layer: Layer): void;
  updateLayer(doc: ProjectDoc, sceneIndex: number, layerId: string, patch: Partial<Layer>): void;
  deleteLayer(doc: ProjectDoc, sceneIndex: number, layerId: string): void;
  duplicateLayer(doc: ProjectDoc, sceneIndex: number, layerId: string): void;
}

function touch(doc: ProjectDoc): void {
  doc.updatedAt = new Date().toISOString();
}

export function duplicateScene(doc: ProjectDoc, index: number): void {
  const src = doc.scenes[index];
  if (!src) return;
  const copy: Scene = JSON.parse(JSON.stringify(src));
  copy.id = uid("scn");
  copy.title = `${src.title} (نسخة)`;
  copy.layers = copy.layers.map((l) => ({ ...l, id: uid("lay") }));
  doc.scenes.splice(index + 1, 0, copy);
  touch(doc);
}

export function deleteScene(doc: ProjectDoc, index: number): void {
  if (doc.scenes.length <= 1) return;
  doc.scenes.splice(index, 1);
  touch(doc);
}

export function moveScene(doc: ProjectDoc, from: number, to: number): void {
  if (from < 0 || from >= doc.scenes.length) return;
  const target = Math.max(0, Math.min(doc.scenes.length - 1, to));
  const [scene] = doc.scenes.splice(from, 1);
  doc.scenes.splice(target, 0, scene);
  touch(doc);
}

export function setSceneDuration(doc: ProjectDoc, index: number, seconds: number): void {
  const scene = doc.scenes[index];
  if (!scene) return;
  scene.duration = Math.max(0.5, Math.min(600, Math.round(seconds * 10) / 10));
  touch(doc);
}

export function addLayer(doc: ProjectDoc, sceneIndex: number, layer: Layer): void {
  doc.scenes[sceneIndex]?.layers.push(layer);
  touch(doc);
}

export function updateLayer(
  doc: ProjectDoc,
  sceneIndex: number,
  layerId: string,
  patch: Record<string, unknown>,
): void {
  const layer = doc.scenes[sceneIndex]?.layers.find((l) => l.id === layerId) as
    | (Layer & Record<string, unknown>)
    | undefined;
  if (!layer) return;
  Object.assign(layer, patch);
  touch(doc);
}

export function deleteLayer(doc: ProjectDoc, sceneIndex: number, layerId: string): void {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return;
  scene.layers = scene.layers.filter((l) => l.id !== layerId);
  touch(doc);
}

export function duplicateLayer(doc: ProjectDoc, sceneIndex: number, layerId: string): void {
  const scene = doc.scenes[sceneIndex];
  if (!scene) return;
  const idx = scene.layers.findIndex((l) => l.id === layerId);
  if (idx === -1) return;
  const copy = JSON.parse(JSON.stringify(scene.layers[idx])) as Layer;
  copy.id = uid("lay");
  scene.layers.splice(idx + 1, 0, copy);
  touch(doc);
}

// ---------- persistence ----------

export function serializeProject(doc: ProjectDoc): string {
  return JSON.stringify({ ...doc, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() }, null, 2);
}

export interface ParseResult {
  doc: ProjectDoc | null;
  errorAr: string | null;
}

export function parseProject(json: string): ParseResult {
  try {
    const raw = JSON.parse(json) as Partial<ProjectDoc>;
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.scenes)) {
      return { doc: null, errorAr: "الملف ليس مشروعاً صالحاً" };
    }
    const doc = { ...newDoc(raw.name ?? "مشروع مستورد", raw.lang ?? "ar"), ...raw } as ProjectDoc;
    doc.schemaVersion = SCHEMA_VERSION;
    if (!doc.canvas || typeof doc.canvas.width !== "number") doc.canvas = newDoc().canvas;
    if (!doc.audio) doc.audio = [];
    if (!doc.subtitles) doc.subtitles = [];
    if (!doc.subtitleStyle) doc.subtitleStyle = newDoc().subtitleStyle;
    if (!doc.voice) doc.voice = newDoc().voice;
    doc.updatedAt = new Date().toISOString();
    return { doc, errorAr: null };
  } catch {
    return { doc: null, errorAr: "تعذر قراءة ملف المشروع (خطأ في التنسيق)" };
  }
}

/** Autosave key for local storage spaces. */
export function autosaveKey(id: string): string {
  return `msaipro.autosave.${id}`;
}

export function projectListKey(): string {
  return "msaipro.projects";
}
