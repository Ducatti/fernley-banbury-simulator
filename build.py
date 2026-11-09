"""Gera a página do simulador a partir dos fontes em src/.

  python3 build.py                      -> só gera dist/simulador.html (sem senha, uso local)
  BANBURY_SENHA='minha senha' python3 build.py
                                        -> gera também index.html criptografado com a senha

O index.html publicado só contém o simulador criptografado (AES-256-GCM, chave
derivada da senha com PBKDF2-SHA256). A senha nunca é gravada no repositório.
"""
import base64
import os
import sys
from pathlib import Path

root = Path(__file__).parent
src = root / 'src'
strip = lambda s: s.split('if (typeof module')[0]

page = (src / 'ui.html').read_text(encoding='utf-8')
ui = ''.join((src / f).read_text(encoding='utf-8') for f in ['ui_a.js', 'ui_analysis.js', 'ui_b.js', 'ui_panel.js', 'ui_c.js'])
page = (page.replace('/*MODEL*/', strip((src / 'model.js').read_text(encoding='utf-8')))
            .replace('/*RECIPES*/', strip((src / 'recipes.js').read_text(encoding='utf-8')))
            .replace('/*UI*/', ui))
head = '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
cut = page.index('</style>') + len('</style>')
html = head + page[:cut] + '\n</head>\n<body>\n' + page[cut:] + '\n</body>\n</html>\n'
(root / 'dist').mkdir(exist_ok=True)
(root / 'dist' / 'simulador.html').write_text(html, encoding='utf-8')
print('dist/simulador.html gerado (sem senha, não vai para o GitHub)')

senha = os.environ.get('BANBURY_SENHA')
if not senha:
    print('BANBURY_SENHA não definida: index.html não foi atualizado.')
    sys.exit(0)

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITER = 310000
salt, iv = os.urandom(16), os.urandom(12)
key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(senha.encode('utf-8'))
ct = AESGCM(key).encrypt(iv, html.encode('utf-8'), None)
b64 = lambda b: base64.b64encode(b).decode('ascii')
lock = (root / 'src' / 'lock.html').read_text(encoding='utf-8')
lock = (lock.replace('__SALT__', b64(salt)).replace('__IV__', b64(iv))
            .replace('__ITER__', str(ITER)).replace('__DATA__', b64(ct)))
(root / 'index.html').write_text(lock, encoding='utf-8')
print('index.html criptografado gerado,', len(lock), 'bytes')
