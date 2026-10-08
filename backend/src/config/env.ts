import path from "path";

try {
  // Le backend/.env sem depender de nenhuma lib externa (Node 20.6+).
  // Se o arquivo nao existir (ex.: variaveis setadas direto no ambiente), so ignora.
  process.loadEnvFile();
} catch {
  // sem .env, segue com o que ja estiver em process.env / os defaults abaixo.
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  /**
   * Log de chamadas (Control Room / ServiceNow / requisicoes do navegador pro
   * backend) - console + backend/logs/calls.log + GET /api/debug/calls.
   * Ligado por padrao; LOG_CALLS=false desliga. So registra metadados, nunca
   * corpo/token/senha - ver services/callLog.ts.
   */
  logCalls: process.env.LOG_CALLS !== "false",
  dataSource: (process.env.DATA_SOURCE ?? "json") as "json" | "sqlite" | "sqlserver",
  dataDir: path.resolve(process.cwd(), process.env.DATA_DIR ?? "src/data"),
  controlRoom: {
    // "mock": usa o repositorio JSON local (default, funciona sem rede/credencial).
    // "live": chama o Control Room de verdade (precisa estar na rede/VPN da sua empresa).
    mode: (process.env.CR_MODE ?? "mock") as "mock" | "live",
    /**
     * true (padrao): a busca de 7 dias manda o filtro de data (startDateTime >= 7 dias
     * atras) pro proprio Control Room, em vez de ler o historico inteiro do mais
     * novo pro mais antigo e cortar aqui. CR_ACTIVITY_FILTER=false volta ao
     * comportamento antigo (sem filtro no servidor).
     */
    activityServerFilter: process.env.CR_ACTIVITY_FILTER !== "false",
    url: process.env.CR_URL ?? "",
    username: process.env.CR_USERNAME ?? "",
    apiKey: process.env.CR_API_KEY ?? "",
  },
  /**
   * URL do webhook do Power Automate ("Quando uma solicitacao de webhook do
   * Teams e recebida") usado pra notificar o grupo de sustentacao quando um
   * robo MONITORADO falha. E um segredo (tem assinatura na URL) - nunca deve
   * ir pro codigo, so pro .env. Enquanto NOTIFY_TEAMS_LIVE != "true", o envio
   * fica mockado (so loga, nao dispara de verdade) - ver teamsNotifier.ts.
   */
  teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL ?? "",
  notifyTeamsLive: process.env.NOTIFY_TEAMS_LIVE === "true",
  /**
   * Segundo webhook do Teams, SEPARADO do de falha de robô acima - fluxo
   * proprio no Power Automate, gatilho tipo "TeamsWebhook" (template
   * "Publicar num canal quando uma solicitacao de webhook e recebida"), pra
   * notificar quando um chamado NOVO abre numa das duas filas do ServiceNow
   * (ver teamsServiceNowNotifier.ts / checkNewTickets() em
   * serviceNowService.ts). Mesmo padrao mock-por-padrao do outro webhook.
   */
  teamsServiceNowWebhookUrl: process.env.TEAMS_SERVICENOW_WEBHOOK_URL ?? "",
  notifyTeamsServiceNowLive: process.env.NOTIFY_TEAMS_SERVICENOW_LIVE === "true",
  /**
   * ServiceNow (chamados das filas monitoradas pelo time de sustentacao).
   * Mesmo padrao do Control Room: "mock" e o default (funciona sem rede/credencial),
   * "live" chama a API de verdade. Ideal e uma credencial dedicada so-leitura;
   * uma conta de servico ja usada por outro bot tambem funciona, mas reduz o
   * isolamento (ver nota de single-session em controlRoomClient.ts, que vale
   * tambem pro ServiceNow dependendo do tipo de credencial).
   */
  serviceNow: {
    mode: (process.env.SERVICENOW_MODE ?? "mock") as "mock" | "live",
    url: process.env.SERVICENOW_URL ?? "",
    clientId: process.env.SERVICENOW_CLIENT_ID ?? "",
    clientSecret: process.env.SERVICENOW_CLIENT_SECRET ?? "",
    username: process.env.SERVICENOW_USERNAME ?? "",
    password: process.env.SERVICENOW_PASSWORD ?? "",
    /**
     * sys_id dos assignment_group das filas que o painel deve enxergar,
     * separados por virgula - ex.: "8ecc1...,010317...". Pegue na URL do
     * registro do grupo no ServiceNow (Assignment groups > abrir o grupo >
     * sys_id na URL). Sem isso configurado, o modo "live" do ServiceNow nao
     * tem o que consultar.
     */
    assignmentGroups: (process.env.SERVICENOW_ASSIGNMENT_GROUPS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    /**
     * "password": manda client_id+client_secret+username+password (o que a
     * acao "ServiceNow: Start Session" do bot usa). "client_credentials": so
     * client_id+client_secret, sem usuario - alguns registros OAuth do
     * ServiceNow so aceitam um dos dois. So usado quando authMode="oauth".
     */
    grantType: (process.env.SERVICENOW_GRANT_TYPE ?? "password") as "password" | "client_credentials",
    /**
     * "oauth" (default): fluxo OAuth padrao via /oauth_token.do. "basic":
     * Basic Auth direto com username/password, sem token - confirmado
     * funcionando contra o client OAuth "ServiceNow_API" (que estava dando
     * access_denied/server_error em todo cenario testado, mesmo de dentro do
     * servidor do Control Room). Usar "basic" ate o time do ServiceNow
     * confirmar o que ha de errado na configuracao do client OAuth.
     */
    authMode: (process.env.SERVICENOW_AUTH_MODE ?? "oauth") as "oauth" | "basic",
  },
};
