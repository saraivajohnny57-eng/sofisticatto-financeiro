#!/usr/bin/env bash
# Provisiona o validador XSD (Python) em .tools/pylibs, sem instalar nada no sistema.
# Uso: bash scripts/gnre-instalar-validador-xsd.sh
# Requer: python3 e acesso ao PyPI. Não usa certificado, Supabase ou rede fiscal.
set -euo pipefail

DESTINO="${1:-.tools/pylibs}"
WHEELS=".tools/wheels"
mkdir -p "$DESTINO" "$WHEELS"

pacotes=("xmlschema" "elementpath")

for pacote in "${pacotes[@]}"; do
  echo "Obtendo metadados de ${pacote}…"
  curl -sS "https://pypi.org/pypi/${pacote}/json" -o "${WHEELS}/${pacote}.json"
  url=$(python3 - "$pacote" <<'PY'
import json, sys
from pathlib import Path
pacote = sys.argv[1]
dados = json.loads(Path(f".tools/wheels/{pacote}.json").read_text())
wheels = [u for u in dados["urls"] if u["filename"].endswith("py3-none-any.whl")]
if not wheels:
    raise SystemExit(f"sem wheel puro para {pacote}")
print(wheels[0]["url"])
PY
)
  echo "Baixando ${pacote}…"
  curl -sS -L -o "${WHEELS}/${pacote}.whl" "$url"
  python3 - "$pacote" "$DESTINO" <<'PY'
import sys, zipfile
pacote, destino = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(f".tools/wheels/{pacote}.whl") as z:
    z.extractall(destino)
PY
done

echo "Validando instalação isolada…"
PYTHONPATH="$PWD/$DESTINO" python3 -c "import xmlschema; print('xmlschema', xmlschema.__version__)"
echo "Pronto. Exporte GNRE_PYLIBS=$PWD/$DESTINO ou use PYTHONPATH=$DESTINO."
