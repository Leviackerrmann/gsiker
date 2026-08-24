import { createContext, useContext } from "react";

/** Controla el "chrome" del Layout (sidebar). El POS lo usa para colapsar el
 * panel izquierdo y ganar espacio, con un botón para volver a expandirlo. */
export interface ChromeCtx {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}

export const ChromeContext = createContext<ChromeCtx>({ collapsed: false, setCollapsed: () => {} });
export const useChrome = () => useContext(ChromeContext);
