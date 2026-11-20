import { useEffect, useRef } from "react";
import type { ProjectDoc } from "@msaipro/core";
import { renderThumbnail } from "@msaipro/core";

export function SceneThumb({
  doc,
  sceneIndex,
  width = 172,
}: {
  doc: ProjectDoc;
  sceneIndex: number;
  width?: number;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !doc.scenes.length) return;
    canvas.width = width;
    canvas.height = Math.round((width / doc.canvas.width) * doc.canvas.height);
    renderThumbnail(doc, canvas, sceneIndex);
  }, [doc, sceneIndex, width]);
  return <canvas ref={ref} />;
}
