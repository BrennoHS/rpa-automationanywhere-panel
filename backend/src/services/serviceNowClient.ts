import { env } from "../config/env";
import { logCall } from "./callLog";

/**
 * Cliente de baixo nivel para o ServiceNow.
 *
 * Autenticacao: duas opcoes, controladas por SERVICENOW_AUTH_MODE.
 *  - "oauth" (default): POST /oauth_token.do com client_id/client_secret
 *    (+ username/password se grantType="password"). Falhou nos testes contra
 *    o client "ServiceNow_API" do Locker "Sistemas" (erro generico
 *    access_denied/server_error, mesmo de dentro do servidor do Control
 *    Room) - parece ser um problema na configuracao desse client OAuth
 *    especifico, ainda pendente com o time do ServiceNow.
 *  - "basic": Basic Auth direto (usuario/senha) em cada chamada - CONFIRMADO
 *    funcionando contra a API real (testado manualmente em 2026-09-11).
 *    Mais simples (sem token pra gerenciar), usa a mesma conta de servico.
 *
 * Leitura: duas funcoes.
 *  - snCount: Stats API (/api/now/stats/{table}?sysparm_count=true), so a
 *    CONTAGEM, nunca baixa registro nenhum - usar sempre que so precisar de
 *    um numero.
 *  - snList: Table API (/api/now/table/{table}), busca os registros de
 *    verdade mas SO com os campos pedidos (sysparm_fields) e com um teto de
 *    linhas (sysparm_limit, sem paginar) - usar so quando precisar do
 *    conteudo (ex.: descricao pra categorizar por produto).
 * As duas seguem o mesmo principio aplicado no Control Room: nunca puxar
 * mais dado do que o necessario.
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
        `Timeout de ${REQUEST_TIMEOUT_MS / 1000}s chamando ${url} - ServiceNow nao respondeu. ` +
          `Verifique rede/VPN e se SERVICENOW_URL esta correto no .env.`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function authenticateOAuth(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const params: Record<string, string> = {
    grant_type: env.serviceNow.grantType,
    client_id: env.serviceNow.clientId,
    client_secret: env.serviceNow.clientSecret,
  };
  if (env.serviceNow.grantType === "password") {
    params.username = env.serviceNow.username;
    params.password = env.serviceNow.password;
  }

  const authStartedAt = Date.now();
  const resp = await fetchWithTimeout(`${env.serviceNow.url}/oauth_token.do`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  const authText = await resp.text();
  logCall({ target: "SN", method: "POST", path: "/oauth_token.do", status: resp.status, ms: Date.now() - authStartedAt, bytes: Buffer.byteLength(authText) });

  if (!resp.ok) {
    throw new Error(`Falha ao autenticar no ServiceNow: HTTP ${resp.status} - ${authText}`);
  }

  const data = JSON.parse(authText) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  // Renova 1min antes do prazo real, pra nunca usar um token vencido por pouco.
  tokenExpiresAt = now + Math.max(0, data.expires_in - 60) * 1000;
  return cachedToken;
}

/** "Basic base64(usuario:senha)" - sem token, sem expiracao, uma linha so. */
function basicAuthHeader(): string {
  const pair = `${env.serviceNow.username}:${env.serviceNow.password}`;
  return `Basic ${Buffer.from(pair, "utf-8").toString("base64")}`;
}

async function authorizationHeader(forceFresh: boolean): Promise<string> {
  if (env.serviceNow.authMode === "basic") {
    return basicAuthHeader();
  }
  if (forceFresh) {
    cachedToken = null;
    tokenExpiresAt = 0;
  }
  return `Bearer ${await authenticateOAuth()}`;
}

/** GET autenticado generico, com o mesmo retry-uma-vez-em-401 usado por snCount/snList. */
async function snGet(url: string, allowRetry: boolean): Promise<Response> {
  const authorization = await authorizationHeader(false);
  const startedAt = Date.now();
  // so o caminho (sem host) e um trecho da query no log - a query do ServiceNow
  // e' so filtro de chamado, nunca credencial.
  const shortPath = decodeURIComponent(url.replace(env.serviceNow.url, ""));
  let raw: Response;
  try {
    raw = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Authorization: authorization, Accept: "application/json" },
    });
  } catch (err) {
    logCall({ target: "SN", method: "GET", path: shortPath, status: "ERR", ms: Date.now() - startedAt, bytes: null, note: "falha de rede/timeout" });
    throw err;
  }

  // le o corpo aqui so pra medir o tamanho e devolve uma Response equivalente
  // pro resto do codigo (que continua chamando .json()/.text() como antes).
  const text = await raw.text();
  logCall({ target: "SN", method: "GET", path: shortPath, status: raw.status, ms: Date.now() - startedAt, bytes: Buffer.byteLength(text) });
  const resp = new Response(text, { status: raw.status, statusText: raw.statusText });

  if (resp.status === 401 && allowRetry && env.serviceNow.authMode === "oauth") {
    return snGet(url, false);
  }
  return resp;
}

/**
 * Conta quantos registros de uma tabela batem com uma encoded query do
 * ServiceNow (sysparm_query), via Stats API - nunca baixa os registros.
 */
export async function snCount(table: string, encodedQuery: string): Promise<number> {
  const url = `${env.serviceNow.url}/api/now/stats/${table}?sysparm_query=${encodeURIComponent(encodedQuery)}&sysparm_count=true`;
  const resp = await snGet(url, true);

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ServiceNow ${table} -> HTTP ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as { result: { stats: { count: string } } };
  return Number(data.result?.stats?.count ?? 0);
}

/**
 * Busca os registros (so os campos pedidos) que batem com uma encoded query,
 * via Table API - usar so quando precisar do CONTEUDO do chamado (ex.:
 * descricao pra categorizar por produto), nao so a contagem. "limit" e um
 * teto de seguranca (nunca busca mais que isso numa chamada so, sem paginar) -
 * pro volume atual (dezenas de chamados/mes) nunca deve ser atingido.
 */
export async function snList<T>(
  table: string,
  encodedQuery: string,
  fields: string[],
  limit: number,
  /** true = campos de referencia/choice voltam com o valor legivel (nome da pessoa, label do estado) em vez de sys_id/codigo cru. */
  displayValue = false
): Promise<T[]> {
  const url =
    `${env.serviceNow.url}/api/now/table/${table}?sysparm_query=${encodeURIComponent(encodedQuery)}` +
    `&sysparm_fields=${encodeURIComponent(fields.join(","))}&sysparm_limit=${limit}` +
    (displayValue ? "&sysparm_display_value=true" : "");
  const resp = await snGet(url, true);

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ServiceNow ${table} -> HTTP ${resp.status}: ${body}`);
  }

  const data = (await resp.json()) as { result: T[] };
  return data.result ?? [];
}
