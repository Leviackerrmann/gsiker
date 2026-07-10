import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

export default function Layout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />
      <main style={{ flex: 1, padding: "28px 32px", background: "var(--bg)", overflow: "auto", minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
