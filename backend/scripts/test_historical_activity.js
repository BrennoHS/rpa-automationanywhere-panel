// Teste avulso: ve o formato de /v3/activity/list?historical=true
// Roda de dentro de backend/: node scripts/test_historical_activity.js
process.loadEnvFile(".env");

const CR_URL = process.env.CR_URL;
const CR_USERNAME = process.env.CR_USERNAME;
const CR_API_KEY = process.env.CR_API_KEY;

async function main() {
  const authResp = await fetch(`${CR_URL}/v2/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: CR_USERNAME, apiKey: CR_API_KEY }),
  });
  const { token } = await authResp.json();
  console.log("Autenticado.\n");

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const resp = await fetch(`${CR_URL}/v3/activity/list?historical=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Authorization": token },
    body: JSON.stringify({
      filter: {
        operator: "and",
        operands: [
          { operator: "eq", field: "status", value: "RUN_FAILED" },
          { operator: "ge", field: "startDateTime", value: startOfDay.toISOString() },
        ],
      },
      sort: [{ field: "startDateTime", direction: "desc" }],
      page: { offset: 0, length: 5 },
    }),
  });

  console.log("Status:", resp.status);
  const text = await resp.text();
  console.log(text);
}

main().catch(console.error);
