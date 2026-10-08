import { env } from "../config/env";
import { logCall } from "./callLog";

/**
 * Cliente de baixo nivel para o Control Room (Automation Anywhere).
 *
 * Paths confirmados contra um Control Room de producao (Automation Anywhere):
 *   - POST /v2/authentication            (username em formato DOMINIO\usuario)
 *   - POST /v2/devices/list
 *   - POST /v2/repository/file/list
 *   - POST /v3/activity/list
 *
 * O formato de filtro (FilterRequest/Filter) e o mesmo padrao usado em varias
 * list APIs do Control Room v2/v3: { filter: { operator, operands|field/value }, sort, page }.
 */

export interface Filter {
  operator: "NONE" | "lt" | "le" | "eq" | "ne" | "ge" | "gt" | "substring" | "and" | "or" | "not";
  field?: string;
  value?: unknown;
  operands?: Filter[];
}

export interface FilterRequest {
  filter?: Filter;
  sort?: { field: string; direction: "asc" | "desc" }[];
  page: { offset: number; length: number };
}

export interface PageResponse<T> {
  page: { offset: number; total: number; totalFilter: number };
  list: T[];
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * fetch() do Node nao tem timeout por padrao - se a rede nao alcancar o
 * Control Room (VPN errada, URL errada, firewall derrubando o pacote sem
 * responder), a requisicao fica pendurada PRA SEMPRE em vez de falhar. Isso
 * trava a tela inteira (todo card fica em 0, toda chamada do frontend fica
 * "Pendente" sem nunca dar erro). Com o AbortController, depois de 20s a
 * gente desiste e mostra um erro claro em vez de travar silenciosamente.
 */
const REQUEST_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `Timeout de ${REQUEST_TIMEOUT_MS / 1000}s chamando ${url} - Control Room nao respondeu. ` +
          `Verifique se essa maquina consegue alcancar essa URL (rede/VPN) e se CR_URL esta correta no .env.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Single-flight do login: com o token vencido/ausente, duas buscas paralelas
 * (ex.: agendamentos + execucoes, que rodam juntas na 1a carga) chamavam
 * /v2/authentication DUAS vezes ao mesmo tempo (visto no calls.log, 2026-09-24).
 * Como o Control Room parece aceitar so uma sessao por usuario, o 2o login
 * pode invalidar o token do 1o - quem chega depois espera o login ja em andamento.
 */
let authInFlight: Promise<string> | null = null;

async function authenticate(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }
  if (authInFlight) return authInFlight;
  authInFlight = requestToken().finally(() => {
    authInFlight = null;
  });
  return authInFlight;
}

async function requestToken(): Promise<string> {
  const now = Date.now();

  const startedAt = Date.now();
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${env.controlRoom.url}/v2/authentication`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: env.controlRoom.username,
        apiKey: env.controlRoom.apiKey,
      }),
    });
  } catch (err) {
    logCall({ target: "CR", method: "POST", path: "/v2/authentication", status: "ERR", ms: Date.now() - startedAt, bytes: null, note: "falha de rede/timeout" });
    throw err;
  }

  const authText = await resp.text();
  logCall({ target: "CR", method: "POST", path: "/v2/authentication", status: resp.status, ms: Date.now() - startedAt, bytes: Buffer.byteLength(authText) });

  if (!resp.ok) {
    throw new Error(`Falha ao autenticar no Control Room: HTTP ${resp.status} - ${authText}`);
  }

  const data = JSON.parse(authText) as { token: string };
  cachedToken = data.token;
  // Token do Control Room normalmente dura horas; renova a cada 30min por seguranca.
  tokenExpiresAt = now + 30 * 60 * 1000;
  return cachedToken;
}

/**
 * O Control Room parece permitir so uma sessao ativa por usuario - se alguem
 * loga na tela web ou roda outro script com o mesmo usuario, o token que
 * guardamos em cache vira invalido na hora (401 "You have been logged out"),
 * antes mesmo do cache expirar pelo relogio. Por isso, em qualquer 401,
 * descarta o token e tenta autenticar de novo UMA vez antes de desistir.
 */
export async function crPost<T>(path: string, body: FilterRequest): Promise<PageResponse<T>> {
  return crPostAttempt<T>(path, body, true);
}

async function crPostAttempt<T>(path: string, body: FilterRequest, allowRetry: boolean): Promise<PageResponse<T>> {
  const token = await authenticate();
  const label = `${path} offset=${body.page.offset} len=${body.page.length}`;
  const startedAt = Date.now();
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${env.controlRoom.url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Authorization": token,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    logCall({ target: "CR", method: "POST", path: label, status: "ERR", ms: Date.now() - startedAt, bytes: null, note: "falha de rede/timeout" });
    throw err;
  }

  const text = await resp.text();
  const bytes = Buffer.byteLength(text);

  if (resp.status === 401 && allowRetry) {
    logCall({ target: "CR", method: "POST", path: label, status: 401, ms: Date.now() - startedAt, bytes, note: "token invalido, reautenticando" });
    cachedToken = null;
    tokenExpiresAt = 0;
    return crPostAttempt<T>(path, body, false);
  }

  if (!resp.ok) {
    logCall({ target: "CR", method: "POST", path: label, status: resp.status, ms: Date.now() - startedAt, bytes });
    throw new Error(`Control Room ${path} -> HTTP ${resp.status}: ${text}`);
  }

  const parsed = JSON.parse(text) as PageResponse<T>;
  logCall({ target: "CR", method: "POST", path: label, status: resp.status, ms: Date.now() - startedAt, bytes, records: parsed.list?.length ?? null, note: parsed.page ? `total=${parsed.page.total} filtrado=${parsed.page.totalFilter}` : undefined });
  return parsed;
}

const PAGE_SIZE = 500;

/**
 * Busca TODAS as paginas de uma list API, nao so a primeira. Usar sempre que
 * o volume de dados puder variar por ambiente (ex.: dev tem 15 agendamentos,
 * producao pode ter centenas) - evita perder itens silenciosamente por causa
 * de um limite de pagina fixo demais.
 */
export async function crPostAll<T>(path: string, body: Omit<FilterRequest, "page">): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;

  while (true) {
    const resp = await crPost<T>(path, { ...body, page: { offset, length: PAGE_SIZE } });
    all.push(...resp.list);
    offset += resp.list.length;
    if (resp.list.length === 0 || offset >= resp.page.total) break;
  }

  return all;
}
