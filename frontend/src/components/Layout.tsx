import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BackgroundGlows from "./BackgroundGlows";

export default function Layout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "28px 32px", marginLeft: 248, position: "relative", background: "var(--bg-body)", overflow: "auto", minWidth: 0, transition: "var(--transition)" }}>
        <BackgroundGlows />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
