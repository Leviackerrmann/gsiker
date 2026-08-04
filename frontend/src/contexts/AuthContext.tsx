import { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";
import type { Empresa, RegistroEmpresa, User } from "../types";

interface AuthContextType {
  user: User | null;
  empresa: Empresa | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  registerEmpresa: (datos: RegistroEmpresa) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

/** Carga el usuario y, si pertenece a una empresa, sus datos (moneda, régimen...). */
async function cargarSesion(): Promise<{ user: User; empresa: Empresa | null }> {
  const me = await api.get("/auth/me");
  const user: User = me.data;
  let empresa: Empresa | null = null;
  if (user.empresa_id) {
    try {
      empresa = (await api.get("/empresas/mi-empresa")).data;
    } catch {
      empresa = null;
    }
  }
  return { user, empresa };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      cargarSesion()
        .then(({ user, empresa }) => {
          setUser(user);
          setEmpresa(empresa);
        })
        .catch(() => localStorage.removeItem("token"))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const finalizarLogin = async (token: string) => {
    localStorage.setItem("token", token);
    const { user, empresa } = await cargarSesion();
    setUser(user);
    setEmpresa(empresa);
  };

  const login = async (username: string, password: string) => {
    const res = await api.post("/auth/login", { username, password });
    await finalizarLogin(res.data.access_token);
  };

  const registerEmpresa = async (datos: RegistroEmpresa) => {
    const res = await api.post("/auth/register-empresa", datos);
    await finalizarLogin(res.data.access_token);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setEmpresa(null);
  };

  return (
    <AuthContext.Provider value={{ user, empresa, loading, login, registerEmpresa, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
