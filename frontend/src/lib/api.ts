import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Un 401 del propio intento de login/registro significa "credenciales
      // inválidas": lo maneja el formulario (muestra el aviso). Recargar aquí
      // borraría ese mensaje y devolvería al usuario a la pantalla inicial.
      // El redirect global es solo para sesiones ya iniciadas que expiran.
      const url: string = error.config?.url ?? "";
      const esIntentoAuth = url.includes("/auth/login") || url.includes("/auth/register");
      if (!esIntentoAuth) {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
