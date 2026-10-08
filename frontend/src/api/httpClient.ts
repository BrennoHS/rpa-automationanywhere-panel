/**
 * Cliente HTTP central. Toda chamada real a API passa por aqui.
 * Base URL vem do .env (VITE_API_BASE_URL).
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

/**
 * Sem timeout, um backend travado/fora do ar deixava a tela presa no
 * skeleton pra sempre, sem nenhum erro - o mesmo problema que já resolvemos
 * do lado do backend pras chamadas ao Control Room/ServiceNow, só que aqui
 * ninguém tinha corrigido pro salto navegador -> nosso próprio backend.
 */
const REQUEST_TIMEOUT_MS = 20_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
      signal: controller.signal,
    });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(`Timeout de ${REQUEST_TIMEOUT_MS / 1000}s chamando ${path} - o backend não respondeu. Verifique se ele está rodando.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // O backend sempre devolve {"message": "motivo real"} no erro - sem isso
    // a tela só mostrava "HTTP 500" genérico, escondendo a causa de verdade.
    const message = await res
      .json()
      .then((body: { message?: string }) => body?.message)
      .catch(() => undefined);
    throw new Error(message || `HTTP ${res.status} em ${path}`);
  }
  return res.json() as Promise<T>;
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** true = usa mocks locais; false = consome o backend. Controlado no .env */
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "false";
