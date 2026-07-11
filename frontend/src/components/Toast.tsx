import { createContext, useContext, useCallback, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  success: (msg: string) => void;
  error: (msg: string) => void;
  info: (msg: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((message: string, type: "success" | "error" | "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const bgMap = { success: "var(--success-bg)", error: "var(--danger-bg)", info: "var(--info-bg)" };
  const brdMap = { success: "var(--success)", error: "var(--danger)", info: "var(--info)" };
  const colorMap = { success: "var(--success-text)", error: "var(--danger-text)", info: "var(--info)" };
  const iconMap = { success: "✓", error: "✕", info: "ℹ" };

  return (
    <ToastContext.Provider value={{ success: (m) => add(m, "success"), error: (m) => add(m, "error"), info: (m) => add(m, "info") }}>
      {children}
      <div style={{ position: "fixed", top: 20, right: 20, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            background: bgMap[t.type], color: colorMap[t.type], padding: "12px 18px",
            borderRadius: "var(--radius)", boxShadow: "var(--shadow-lg)", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", gap: 10, animation: "toastIn 0.2s ease",
            minWidth: 280, border: `1px solid ${brdMap[t.type]}`,
          }}>
            <span style={{ fontSize: 16 }}>{iconMap[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx;
}
