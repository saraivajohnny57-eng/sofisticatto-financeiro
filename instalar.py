"""Execute na pasta raiz do projeto: python instalar.py"""
from pathlib import Path
import shutil
root = Path.cwd()
index = root / 'index.html'
patch = Path(__file__).with_name('etiquetas-preview-pdf.js')
if not index.is_file() or not (root/'financeiro.js').is_file():
    raise SystemExit('ERRO: Execute na pasta do projeto, onde ficam index.html e financeiro.js')
s = index.read_text(encoding='utf-8')
if 'etiquetas-preview-pdf.js' in s:
    print('Atualização já instalada.'); raise SystemExit(0)
import re
pattern = r'(<script\s+src="financeiro\.js[^\"]*"\s*></script>)'
if not re.search(pattern,s):
    raise SystemExit('ERRO: Não foi encontrado o carregamento de financeiro.js no index.html')
shutil.copy2(index,root/'index.html.bak-etiquetas')
shutil.copy2(patch,root/patch.name)
s = re.sub(pattern,lambda m:m.group(1)+'\n<script src="etiquetas-preview-pdf.js?v=1"></script>',s,count=1)
index.write_text(s,encoding='utf-8')
print('OK: patch instalado. Arquivo original salvo como index.html.bak-etiquetas')
