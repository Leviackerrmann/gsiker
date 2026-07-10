import { useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: number;
}

export default function Modal({ isOpen, title, children, onClose, maxWidth = 520 }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.5)",
  backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, padding: 20, animation: "fadeIn 0.15s ease",
};

const modalCard: React.CSSProperties = {
  background: "var(--surface)", padding: "28px", borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-lg)", width: "100%",
  maxHeight: "85vh", overflow: "auto",
};

const closeBtn: React.CSSProperties = {
  background: "none", border: "none", fontSize: 18, color: "var(--text-muted)",
  cursor: "pointer", padding: "6px 10px", borderRadius: "var(--radius-sm)",
  lineHeight: 1, transition: "var(--transition)",
};
