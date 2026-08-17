import axios from "axios";

// Cliente SEPARADO para la plataforma (superadmin): su propio token y base
// (/api/platform). El token de plataforma no se mezcla con el del tenant.
const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

const platformApi = axios.create({
  baseURL: `${base}/platform`,
  headers: { "Content-Type": "application/json" },
});

export const PLATFORM_TOKEN_KEY = "platform_token";

platformApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(PLATFORM_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformApi.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(PLATFORM_TOKEN_KEY);
      if (!window.location.pathname.startsWith("/plataforma/login")) {
        window.location.href = "/plataforma/login";
      }
    }
    return Promise.reject(error);
  }
);

export default platformApi;
