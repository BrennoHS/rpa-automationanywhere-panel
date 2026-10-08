/**
 * Extrai um "codigo curto" a partir do nome do robo (ex.: "R052_RevisaoPerfilTransacao"
 * -> "R052", "R045 - Monitores..." -> "R045") pra exibir em vez do ID numerico cru que
 * vem do Control Room (ex.: "288256") - esse ID interno continua sendo usado normalmente
 * pra tudo (rotas, toggle de monitorar, chave de lista), essa funcao e so pra exibicao.
 *
 * Nem todo robo real segue esse padrao de nome (bots utilitarios/export/teste, tipo
 * "TestePython" ou "ServiceNow", nao tem prefixo) - nesses casos cai pro proprio ID,
 * cortado se for muito longo.
 */
export function robotShortCode(name: string, id: string): string {
  const match = name.match(/^[A-Za-z]{1,4}\d{2,6}/);
  if (match) return match[0];
  return id.length > 8 ? `${id.slice(0, 6)}…` : id;
}
