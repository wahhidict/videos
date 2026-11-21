import { formatTime, totalDuration } from "@msaipro/core";
import { useApp } from "../store/appState";

export function Timeline() {
  const { doc, sceneIndex, setSceneIndex, setSelectedLayerId, updateDoc, playhead, setPlayhead } = useApp();
  if (!doc || !doc.scenes.length) return null;
  const total = totalDuration(doc);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="panel-title" style={{ marginBottom: 0 }}>خط الزمن</span>
        <span className="muted" style={{ fontSize: 12 }}>
          {doc.scenes.length} مشاهد — المدة الكلية {formatTime(total)} — اسحب المشاهد لإعادة ترتيبها
        </span>
      </div>

      <div className="tl-track">
        {doc.scenes.map((scene, i) => (
          <div
            key={scene.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = Number(e.dataTransfer.getData("text/plain"));
              if (!Number.isNaN(from)) updateDoc((draft) => {
                const [moved] = draft.scenes.splice(from, 1);
                draft.scenes.splice(i, 0, moved);
              });
            }}
            className={`tl-clip ${i === sceneIndex ? "selected" : ""}`}
            style={{ flexGrow: scene.duration, flexBasis: 0 }}
            onClick={() => { setSceneIndex(i); setSelectedLayerId(null); setPlayhead(doc.scenes.slice(0, i).reduce((a, s) => a + s.duration, 0) + 0.05); }}
          >
            <b>مشهد {i + 1}</b>
            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--muted)" }}>{scene.title}</div>
            <span className="dur">{scene.duration.toFixed(1)} ث</span>
          </div>
        ))}
      </div>

      {doc.audio.length > 0 && (
        <div className="tl-track" style={{ minHeight: 34, opacity: 0.9 }}>
          {doc.audio.map((track) => {
            const leftPad = (track.startAt / total) * 100;
            const width = Math.max(
              4,
              ((track.outPoint ?? Math.max(2, total - track.startAt)) - track.inPoint) / total * 100,
            );
            return (
              <div
                key={track.id}
                className="tl-clip"
                style={{
                  flexGrow: 0,
                  flexBasis: "auto",
                  width: `calc(${width}% - ${doc.audio.length * 6}px)`,
                  marginInlineStart: `${leftPad}%`,
                  minWidth: 60,
                  background: track.role === "voice" ? "linear-gradient(160deg,#1d4a38,#16382a)" : track.role === "music" ? "linear-gradient(160deg,#4a3a1d,#382a16)" : "linear-gradient(160deg,#3d2548,#2b1834)",
                  borderColor: "#4b6b58",
                }}
                title={track.name}
              >
                🎧 {track.name} ({track.volume.toFixed(1)}×)
              </div>
            );
          })}
        </div>
      )}

      <input
        type="range"
        aria-label="مؤشر الزمن"
        min={0}
        max={Math.max(0.1, total)}
        step={0.033}
        value={Math.min(playhead, total)}
        onChange={(e) => setPlayhead(Number(e.target.value))}
        style={{ width: "100%", marginTop: 10, accentColor: "var(--gold)" }}
      />
    </div>
  );
}
