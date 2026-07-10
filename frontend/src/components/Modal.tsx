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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1a1d23" }}>{title}</h3>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 1000, padding: 20,
};

const modalCard: React.CSSProperties = {
  background: "#fff", padding: "24px", borderRadius: 12,
  boxShadow: "0 25px 80px rgba(0,0,0,0.25)", width: "100%",
  maxHeight: "85vh", overflow: "auto", animation: "fadeIn 0.15s ease",
};

const closeBtn: React.CSSProperties = {
  background: "none", border: "none", fontSize: 18, color: "#9ca3af",
  cursor: "pointer", padding: "4px 8px", borderRadius: 4,
};
