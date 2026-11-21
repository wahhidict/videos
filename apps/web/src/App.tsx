// الهيكل الرئيسي: شريط علوي عربي + توجيه بين الشاشات + إشعارات.

import { useApp } from "./store/appState";
import { Dashboard } from "./views/Dashboard";
import { Wizard } from "./views/Wizard";
import { Storyboard } from "./views/Storyboard";
import { Editor } from "./views/Editor";
import { SettingsView } from "./views/SettingsView";
import { ProjectsView } from "./views/ProjectsView";

export function App() {
  const { route, goto, lang, setLang, t, toast } = useApp();

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo">🎬</span>
          <span>{t("appName")}</span>
        </div>
        <span className="spacer" />
        {route !== "dashboard" && (
          <button className="btn small" onClick={() => goto("dashboard")}>🏠 الرئيسية</button>
        )}
        {(route === "editor" || route === "storyboard") && (
          <button className="btn small" onClick={() => goto("projects")}>🗂 {t("myProjects")}</button>
        )}
        <button className="btn small" onClick={() => goto("settings")}>⚙ {t("settings")}</button>
        <button
          className="btn small"
          title={lang === "ar" ? "English interface (اختياري)" : "الواجهة العربية"}
          onClick={() => setLang(lang === "ar" ? "en" : "ar")}
        >
          {lang === "ar" ? "EN" : "ع"}
        </button>
      </header>

      {route === "dashboard" && <Dashboard />}
      {route === "wizard" && <Wizard />}
      {route === "storyboard" && <Storyboard />}
      {route === "editor" && <Editor />}
      {route === "settings" && <SettingsView />}
      {route === "projects" && <ProjectsView />}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
