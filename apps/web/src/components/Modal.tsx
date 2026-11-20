import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={wide ? { width: "min(920px, 100%)" } : undefined}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <h3>{title}</h3>
          {onClose && (
            <button className="btn small" onClick={onClose}>
              إغلاق ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
