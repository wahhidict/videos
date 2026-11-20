// Global app state (React context). Project docs live here; edits are structural clones.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Layer, NaturalCommandResult, ProjectDoc } from "@msaipro/core";
import { EditHistory, applyNaturalCommand, newDoc, parseArabicCommand, totalDuration, uid } from "@msaipro/core";
import { listProjects, loadProject, removeProject, saveProject, type ProjectMeta } from "./storage";
import { makeT, type Lang } from "../i18n";

export type Route =
  | "dashboard"
  | "wizard"
  | "storyboard"
  | "editor"
  | "settings"
  | "projects";

export interface AISettings {
  ollamaEnabled: boolean;
  ollamaUrl: string;
  ollamaModel: string;
  piperEnabled: boolean;
  piperModel: string;
  whisperEnabled: boolean;
}

export interface AppCtx {
  route: Route;
  goto: (r: Route) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: ReturnType<typeof makeT> extends (k: infer K) => string ? K : never) => string;
  doc: ProjectDoc | null;
  setDoc: (doc: ProjectDoc) => void;
  updateDoc: (fn: (draft: ProjectDoc) => void) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  runNaturalCommand: (text: string) => NaturalCommandResult;
  confirmNaturalCommand: (cmd: NaturalCommandResult) => boolean;
  sceneIndex: number;
  setSceneIndex: (i: number) => void;
  selectedLayerId: string | null;
  setSelectedLayerId: (id: string | null) => void;
  playhead: number;
  setPlayhead: (t: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  projects: ProjectMeta[];
  refreshProjects: () => void;
  openProject: (id: string) => boolean;
  deleteProject: (id: string) => void;
  newBlankProject: (name?: string) => void;
  ai: AISettings;
  setAI: (s: AISettings) => void;
  toast: string | null;
  showToast: (msg: string) => void;
  isDesktop: boolean;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AppCtx missing");
  return ctx;
}

const AI_KEY = "msaipro.ai";

function loadAI(): AISettings {
  try {
    const raw = localStorage.getItem(AI_KEY);
    if (raw) return JSON.parse(raw) as AISettings;
  } catch {
    /* ignore */
  }
  return {
    ollamaEnabled: false,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "",
    piperEnabled: false,
    piperModel: "",
    whisperEnabled: false,
  };
}

function loadLang(): Lang {
  try {
    return (localStorage.getItem("msaipro.lang") as Lang) || "ar";
  } catch {
    return "ar";
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>("dashboard");
  const [lang, setLangState] = useState<Lang>(loadLang());
  const [doc, setDocState] = useState<ProjectDoc | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [ai, setAIState] = useState<AISettings>(loadAI());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);
  const docRef = useRef<ProjectDoc | null>(null);
  const historyRef = useRef(new EditHistory<ProjectDoc>(60));
  const [histVersion, setHistVersion] = useState(0);
  const applyDoc = useCallback((next: ProjectDoc) => {
    docRef.current = next;
    setDocState(next);
  }, []);
  const [isDesktop] = useState(() => "__TAURI_INTERNALS__" in (globalThis as Record<string, unknown>));

  useEffect(() => {
    setProjects(listProjects());
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("msaipro.lang", l);
    } catch {
      /* ignore */
    }
    const html = document.documentElement;
    html.lang = l;
    html.dir = l === "ar" ? "rtl" : "ltr";
  }, []);

  const t = useMemo(() => makeT(lang), [lang]);

  const goto = useCallback((r: Route) => {
    setRoute(r);
    setPlaying(false);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const refreshProjects = useCallback(() => setProjects(listProjects()), []);

  const setDoc = useCallback((next: ProjectDoc) => {
    historyRef.current.reset();
    setHistVersion((v) => v + 1);
    applyDoc(next);
    setSceneIndex(0);
    setSelectedLayerId(null);
    setPlayhead(0);
  }, [applyDoc]);

  const updateDoc = useCallback((fn: (draft: ProjectDoc) => void) => {
    const prev = docRef.current;
    if (!prev) return;
    const draft = cloneDoc(prev);
    fn(draft);
    draft.updatedAt = new Date().toISOString();
    historyRef.current.push(prev);
    setHistVersion((v) => v + 1);
    applyDoc(draft);
  }, [applyDoc]);

  const openProject = useCallback(
    (id: string) => {
      const loaded = loadProject(id);
      if (!loaded) return false;
      historyRef.current.reset();
      setHistVersion((v) => v + 1);
      applyDoc(loaded);
      setSceneIndex(0);
      setSelectedLayerId(null);
      setPlayhead(0);
      setRoute("editor");
      return true;
    },
    [applyDoc],
  );

  const undo = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const prev = historyRef.current.undo(current);
    if (!prev) return;
    applyDoc(prev);
    setHistVersion((v) => v + 1);
    setSceneIndex((i) => (i >= prev.scenes.length ? 0 : i));
  }, [applyDoc]);

  const redo = useCallback(() => {
    const current = docRef.current;
    if (!current) return;
    const next = historyRef.current.redo(current);
    if (!next) return;
    applyDoc(next);
    setHistVersion((v) => v + 1);
    setSceneIndex((i) => (i >= next.scenes.length ? 0 : i));
  }, [applyDoc]);

  const runNaturalCommand = useCallback(
    (text: string): NaturalCommandResult => {
      const current = docRef.current;
      if (!current) return { ok: false, kind: "unknown", summary: "لا يوجد مشروع مفتوح", destructive: false };
      const cmd = parseArabicCommand(text, sceneIndex, current.scenes.length, totalDuration(current));
      if (!cmd.ok) return cmd;
      if (cmd.destructive) return cmd;
      const draft = cloneDoc(current);
      if (!applyNaturalCommand(draft, cmd)) return { ...cmd, ok: false };
      historyRef.current.push(current);
      setHistVersion((v) => v + 1);
      applyDoc(draft);
      return cmd;
    },
    [sceneIndex, applyDoc],
  );

  const confirmNaturalCommand = useCallback(
    (cmd: NaturalCommandResult): boolean => {
      const current = docRef.current;
      if (!current || !cmd.ok) return false;
      const draft = cloneDoc(current);
      if (!applyNaturalCommand(draft, cmd)) return false;
      historyRef.current.push(current);
      setHistVersion((v) => v + 1);
      applyDoc(draft);
      return true;
    },
    [applyDoc],
  );

  const deleteProject = useCallback((id: string) => {
    removeProject(id);
    setProjects(listProjects());
  }, []);

  const newBlankProject = useCallback(
    (name = "مشروع جديد") => {
      const d = newDoc(name, lang);
      historyRef.current.reset();
      setHistVersion((v) => v + 1);
      applyDoc(d);
      setSceneIndex(0);
      setSelectedLayerId(null);
      setPlayhead(0);
      setRoute("wizard");
    },
    [lang, applyDoc],
  );

  const setAI = useCallback((s: AISettings) => {
    setAIState(s);
    try {
      localStorage.setItem(AI_KEY, JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  // autosave debounce
  const saveTimer = useRef<number>(0);
  useEffect(() => {
    if (!doc) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveProject(doc);
      setProjects((prev) => {
        const meta = { id: doc.id, name: doc.name, updatedAt: doc.updatedAt, sceneCount: doc.scenes.length, durationSec: doc.scenes.reduce((a, s) => a + s.duration, 0) };
        const rest = prev.filter((p) => p.id !== doc.id);
        return [meta, ...rest];
      });
    }, 900);
    return () => window.clearTimeout(saveTimer.current);
  }, [doc]);

  const value: AppCtx = {
    route,
    goto,
    lang,
    setLang,
    t,
    doc,
    setDoc,
    updateDoc,
    canUndo: histVersion >= 0 && historyRef.current.canUndo(),
    canRedo: histVersion >= 0 && historyRef.current.canRedo(),
    undo,
    redo,
    runNaturalCommand,
    confirmNaturalCommand,
    sceneIndex,
    setSceneIndex,
    selectedLayerId,
    setSelectedLayerId,
    playhead,
    setPlayhead,
    playing,
    setPlaying,
    projects,
    refreshProjects,
    openProject,
    deleteProject,
    newBlankProject,
    ai,
    setAI,
    toast,
    showToast,
    isDesktop,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function cloneDoc(doc: ProjectDoc): ProjectDoc {
  return JSON.parse(JSON.stringify(doc)) as ProjectDoc;
}

export function cloneLayer(layer: Layer): Layer {
  return { ...layer, id: uid("lay") };
}

export { saveProject };
