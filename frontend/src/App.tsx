import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import BodegasPage from "./pages/inventario/Bodegas";
import StockPage from "./pages/inventario/Stock";
import MovimientosPage from "./pages/inventario/Movimientos";
import TransferenciasPage from "./pages/inventario/Transferencias";
import ConteosPage from "./pages/inventario/Conteos";
import KardexPage from "./pages/inventario/Kardex";
import AlertasStockPage from "./pages/inventario/AlertasStock";
import ReservasPage from "./pages/inventario/Reservas";
import LotesPage from "./pages/inventario/Lotes";
import UbicacionesPage from "./pages/inventario/Ubicaciones";
import SKUsPage from "./pages/SKUs";
import ProveedoresPage from "./pages/compras/Proveedores";
import OrdenesCompraPage from "./pages/compras/OrdenesCompra";
import SolicitudesPage from "./pages/compras/Solicitudes";
import CotizacionesPage from "./pages/compras/Cotizaciones";
import UsuariosPage from "./pages/Usuarios";
import ClientesPage from "./pages/ventas/Clientes";
import CotizacionesVentaPage from "./pages/ventas/CotizacionesVenta";
import PedidosVentaPage from "./pages/ventas/PedidosVenta";
import FacturasPage from "./pages/ventas/Facturas";
import ReportesPage from "./pages/inventario/Reportes";
import POSPage from "./pages/pos/POS";
import CobranzaPage from "./pages/ventas/Cobranza";
import AsistentePage from "./pages/Asistente";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-secondary)" }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "var(--text-secondary)" }}>Cargando...</div>;
  if (user) return <Navigate to="/dashboard" />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pos" element={<POSPage />} />
        <Route path="/asistente" element={<AsistentePage />} />
        <Route path="/inventario/bodegas" element={<BodegasPage />} />
        <Route path="/inventario/stock" element={<StockPage />} />
        <Route path="/inventario/movimientos" element={<MovimientosPage />} />
        <Route path="/inventario/transferencias" element={<TransferenciasPage />} />
        <Route path="/inventario/conteos" element={<ConteosPage />} />
        <Route path="/inventario/kardex" element={<KardexPage />} />
        <Route path="/inventario/alertas" element={<AlertasStockPage />} />
        <Route path="/inventario/reservas" element={<ReservasPage />} />
        <Route path="/inventario/lotes" element={<LotesPage />} />
        <Route path="/inventario/ubicaciones" element={<UbicacionesPage />} />
        <Route path="/inventario/reportes" element={<ReportesPage />} />
        <Route path="/catalogo/skus" element={<SKUsPage />} />
        <Route path="/compras/proveedores" element={<ProveedoresPage />} />
        <Route path="/compras/ordenes" element={<OrdenesCompraPage />} />
        <Route path="/compras/solicitudes" element={<SolicitudesPage />} />
        <Route path="/compras/cotizaciones" element={<CotizacionesPage />} />
        <Route path="/ventas/clientes" element={<ClientesPage />} />
        <Route path="/ventas/cotizaciones" element={<CotizacionesVentaPage />} />
        <Route path="/ventas/pedidos" element={<PedidosVentaPage />} />
        <Route path="/ventas/facturas" element={<FacturasPage />} />
        <Route path="/ventas/cobranza" element={<CobranzaPage />} />
        <Route path="/admin/usuarios" element={<UsuariosPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
