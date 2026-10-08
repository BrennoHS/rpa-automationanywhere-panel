"""
Coleta payloads de exemplo do Control Room (Automation Anywhere) para uso
como referencia ao implementar backend/src/services/automationAnywhereService.ts.

Roda DENTRO da rede/VPN da sua empresa, na maquina que tem acesso ao Control Room.
Nao commitar os arquivos gerados em samples/ se tiverem dados sensiveis reais
(nomes de maquina, processos de negocio, usuarios) -- so trazer a estrutura.

Uso:
    set CR_URL=https://seu-control-room.automationanywhere.digital
    set CR_USERNAME=seu.usuario
    set CR_API_KEY=sua-api-key
    python fetch_control_room_samples.py

(No PowerShell use $env:CR_URL = "..." em vez de set)

NUNCA hardcode usuario/senha/api key neste arquivo. Sempre via variavel de ambiente.
"""
import json
import os
import sys
from pathlib import Path
from urllib import request, error

CR_URL = os.environ.get("CR_URL", "").rstrip("/")
CR_USERNAME = os.environ.get("CR_USERNAME", "")
CR_API_KEY = os.environ.get("CR_API_KEY", "")

OUT_DIR = Path(__file__).parent / "samples"

# Quantos itens pedir de cada lista (mantem os arquivos pequenos e faceis de revisar)
SAMPLE_SIZE = 3


def require_env():
    missing = [k for k, v in {
        "CR_URL": CR_URL,
        "CR_USERNAME": CR_USERNAME,
        "CR_API_KEY": CR_API_KEY,
    }.items() if not v]
    if missing:
        print(f"Faltando variavel(is) de ambiente: {', '.join(missing)}")
        sys.exit(1)


def call(method: str, path: str, token: str | None = None, body: dict | None = None) -> dict:
    url = f"{CR_URL}{path}"
    data = json.dumps(body or {}).encode("utf-8")
    req = request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("X-Authorization", token)
    with request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def authenticate() -> str:
    resp = call("POST", "/v1/authentication", body={
        "username": CR_USERNAME,
        "apiKey": CR_API_KEY,
    })
    token = resp.get("token")
    if not token:
        raise RuntimeError(f"Login nao retornou token. Resposta: {resp}")
    return token


def save(name: str, payload):
    OUT_DIR.mkdir(exist_ok=True)
    path = OUT_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  -> salvo em {path}")


def try_fetch(label: str, fn):
    print(f"\n[{label}]")
    try:
        result = fn()
        save(label, result)
        return result
    except error.HTTPError as e:
        print(f"  ERRO HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:500]}")
    except Exception as e:
        print(f"  ERRO: {e}")
    return None


def main():
    require_env()
    print(f"Conectando em {CR_URL} ...")
    token = authenticate()
    print("Autenticado com sucesso.\n")
    save("_auth_response_shape", {"token": "***redacted***", "outras_chaves": "veja resposta real, so nao commitar o token"})

    try_fetch("devices_list", lambda: call(
        "POST", "/v2/devices/list", token,
        {"page": {"offset": 0, "length": SAMPLE_SIZE}},
    ))

    try_fetch("bots_list", lambda: call(
        "POST", "/v2/repository/workspaces/private/interface/list", token,
        {"page": {"offset": 0, "length": SAMPLE_SIZE}},
    ))

    try_fetch("schedule_list", lambda: call(
        "POST", "/v2/schedule/list", token,
        {"page": {"offset": 0, "length": SAMPLE_SIZE}},
    ))

    try_fetch("activity_list", lambda: call(
        "POST", "/v3/activity/list", token,
        {
            "sort": [{"field": "startDateTime", "direction": "desc"}],
            "page": {"offset": 0, "length": SAMPLE_SIZE},
        },
    ))

    print(f"\nPronto. Arquivos em {OUT_DIR}")
    print("Revise o conteudo (remova/edite dados sensiveis se quiser) antes de trazer para a analise.")


if __name__ == "__main__":
    main()
