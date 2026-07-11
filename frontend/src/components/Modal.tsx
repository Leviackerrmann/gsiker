import { useEffect } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  icon?: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: number;
}

export default function Modal({ isOpen, title, subtitle, icon, children, onClose, maxWidth = 560 }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
      document.addEventListener("keydown", handler);
      return () => {
        document.body.style.overflow = prev;
        document.removeEventListener("keydown", handler);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div style={overlay} onClick={onClose}>
      <div style={{ ...modalCard, maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div style={glowDeco} />
        <div style={modalHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {icon && (
              <div style={headIcon}>
                <i className={`fas ${icon}`} style={{ fontSize: 17 }} />
              </div>
            )}
            <div>
              <div style={modalTitle}>{title}</div>
              {subtitle && <div style={modalSub}>{subtitle}</div>}
            </div>
          </div>
          <button onClick={onClose} style={closeBtn} aria-label="Cerrar">
            <i className="fas fa-xmark" style={{ fontSize: 14 }} />
          </button>
        </div>
        <div style={modalBody}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 900,
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  padding: 20, animation: "fadeIn 0.25s ease",
};

const modalCard: React.CSSProperties = {
  position: "relative", zIndex: 1,
  background: "var(--m-bg)", border: "1px solid var(--m-border)", borderRadius: 16,
  width: "100%", maxHeight: "90vh",
  boxShadow: "0 32px 100px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset",
  display: "flex", flexDirection: "column",
  animation: "fadeIn 0.3s ease",
};

const glowDeco: React.CSSProperties = {
  position: "absolute", top: -80, right: -80,
  width: 200, height: 200, borderRadius: "50%",
  background: "var(--m-glow)", filter: "blur(60px)", pointerEvents: "none", zIndex: 0,
};

const modalHead: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "22px 28px 18px", background: "var(--m-head-bg)",
  borderBottom: "1px solid var(--m-divider)", position: "relative", zIndex: 1,
};

const headIcon: React.CSSProperties = {
  width: 42, height: 42, borderRadius: 12,
  background: "linear-gradient(135deg, var(--accent-grad-start), var(--accent-grad-end))",
  display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
  boxShadow: "0 4px 14px var(--accent-glow)", flexShrink: 0,
};

const modalTitle: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif", fontSize: 17, fontWeight: 700,
  color: "var(--text-primary)", transition: "color .35s",
};

const modalSub: React.CSSProperties = {
  fontSize: 12, color: "var(--text-muted)", marginTop: 2, transition: "color .35s",
};

const closeBtn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, border: "1px solid var(--m-input-border)",
  background: "transparent", color: "var(--text-muted)", display: "flex",
  alignItems: "center", justifyContent: "center", cursor: "pointer",
  transition: "all .2s", flexShrink: 0,
};

const modalBody: React.CSSProperties = {
  padding: "24px 28px 24px", position: "relative", zIndex: 1,
  overflow: "auto", flex: 1,
};
