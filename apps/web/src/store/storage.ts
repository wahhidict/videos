// Local-first persistence: project list in localStorage, big blobs in IndexedDB.

import type { ProjectDoc } from "@msaipro/core";
import { autosaveKey, projectListKey, serializeProject, parseProject } from "@msaipro/core";

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: string;
  sceneCount: number;
  durationSec: number;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage full — the project still stays in memory */
  }
}

export function listProjects(): ProjectMeta[] {
  try {
    const raw = safeGet(projectListKey());
    return raw ? (JSON.parse(raw) as ProjectMeta[]) : [];
  } catch {
    return [];
  }
}

function setMeta(id: string, meta: ProjectMeta): void {
  const all = listProjects().filter((p) => p.id !== id);
  all.unshift(meta);
  safeSet(projectListKey(), JSON.stringify(all));
}

export function saveProjectMeta(doc: ProjectDoc, durationSec: number): void {
  setMeta(doc.id, {
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    sceneCount: doc.scenes.length,
    durationSec,
  });
}

export function saveProject(doc: ProjectDoc): boolean {
  const ok = (() => {
    try {
      localStorage.setItem(autosaveKey(doc.id), serializeProject(doc));
      return true;
    } catch {
      return false;
    }
  })();
  saveProjectMeta(doc, doc.scenes.reduce((a, s) => a + s.duration, 0));
  return ok;
}

export function loadProject(id: string): ProjectDoc | null {
  const raw = safeGet(autosaveKey(id));
  if (!raw) return null;
  const { doc } = parseProject(raw);
  return doc;
}

export function removeProject(id: string): void {
  try {
    localStorage.removeItem(autosaveKey(id));
    const all = listProjects().filter((p) => p.id !== id);
    safeSet(projectListKey(), JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

// ---------- IndexedDB asset store (audio blobs etc.) ----------

const DB_NAME = "msaipro-assets";
const STORE = "blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAsset(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAsset(id: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
