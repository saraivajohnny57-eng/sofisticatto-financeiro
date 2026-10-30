#!/usr/bin/env python3
"""Valida um XML contra um XSD oficial GNRE.

Uso:
  python3 scripts/gnre-validar-xsd.py --schema docs/gnre-xsd/lote_gnre_consulta_v1.00.xsd --xml arquivo.xml

Saída: JSON com ok/erros. Códigos: 0 válido, 1 inválido, 2 erro de uso, 3 dependência ausente.
Não acessa rede, banco ou certificado.
"""
import argparse
import json
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", required=True)
    parser.add_argument("--xml", required=True)
    args = parser.parse_args()

    try:
        import xmlschema
    except ImportError:
        print(json.dumps({
            "ok": False,
            "erro": "xmlschema indisponivel; instale com pip install xmlschema",
        }))
        return 3

    try:
        schema = xmlschema.XMLSchema(args.schema)
        errors = list(schema.iter_errors(args.xml))
        mensagens = [str(e)[:300] for e in errors[:20]]
        print(json.dumps({"ok": not errors, "total_erros": len(errors), "erros": mensagens}))
        return 0 if not errors else 1
    except Exception as exc:
        print(json.dumps({"ok": False, "erro": str(exc)[:300]}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
