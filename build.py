"""Gera index.html (arquivo único) a partir dos fontes em src/."""
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
title_end = page.index('</style>') + len('</style>')
html = head + page[:title_end] + '\n</head>\n<body>\n' + page[title_end:] + '\n</body>\n</html>\n'
(root / 'index.html').write_text(html, encoding='utf-8')
print('index.html gerado,', len(html), 'bytes')
