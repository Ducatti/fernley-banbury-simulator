# Simulador de misturador Banbury (No. 1 MIXER)

Simulador web interativo para treinar operadores do misturador interno de borracha (tipo Banbury) usado na fabricação de compostos para pneus. Ele roda inteiro no navegador, sem servidor e sem instalação.

## Como usar

O `index.html` publicado é **protegido por senha**. O simulador fica criptografado (AES-256-GCM) e só abre com a senha correta. A opção "Lembrar neste computador" evita digitar a senha toda vez naquele navegador.

Para testar localmente sem senha, rode `python3 build.py` e abra `dist/simulador.html`.

> A senha protege a página publicada. Os fontes em `src/` ficam visíveis enquanto o repositório for público. Para proteger tudo, deixe o repositório privado.

Para iniciar um batch automático:

1. No painel de comando, ligue o **Motor auxiliar**, o **Controle de temp.** e o **Motor principal**.
2. Deixe o seletor **Mixing** em Automático.
3. Pressione **Mixing operação auto**.

Use o seletor **Velocidade** no topo para acelerar a simulação (até 20×).

## Telas

- **Operação:** réplica da tela de operação. Tem nome do operador, grupo e turno, a programação de produção (composto e quantidade de batches), a faixa "Composto / BATCH", a matriz de passos (F.W UP/MIDDLE/DOWN/PRESS, air blow, carbono, óleo, RPM, tempo, temperatura) e os campos Carbono, Óleo, Tempo, PI e Temperatura. Logo abaixo ficam:
  - o sinótico da máquina (pistão, porta de alimentação, rotores, drop door e moinho), com as variáveis de processo;
  - o **painel de comando** com os botões iluminados e os seletores do painel real: rotação do motor com potenciômetro, Preparação, motores, controle de temperatura, parada temporária, peso confirmar, erro de ticket, timer do moinho, alimentação de borracha e de carbono, RAM, porta de alimentação, jato de ar e a chave da drop door (Aberto / Automático / Fechado).
- **Receitas:** ficha **Mixing Process** editável. Tem ingredientes, matriz de até 12 passos, carbono e óleo com o passo de carga, D/D time e D/D rotor, TCU (casing, rotor, drop door) e temperature guard. A receita **S337Y** vem como exemplo. As receitas ficam salvas no navegador e podem ser exportadas e importadas em JSON.
- **Gráficos:** réplica do supervisório, com as penas Temperatura borracha, Eletricidade, Posição Ram, Rotação do mixer, Peso do carbono e Peso óleo 1 e 2. Tem também a tabela "Informação do Chart" no cursor, janela de tempo ajustável e as teclas F5 a F11 para navegar entre batches.
- **Análise:** curvas detalhadas de um batch. Dá para comparar com o batch anterior ou com a previsão da receita (botão "Prever curvas" na ficha).
- **Alarmes:** lista de alarmes com reconhecimento. Inclui um **painel do instrutor** para simular falhas: água de refrigeração, termopar descalibrado e pressão de ar baixa.
- **Bateladas:** histórico com tempo, temperatura de descarga, PI (kWh), kWh/kg, pico de potência, fator de enchimento e uma avaliação automática do batch.

## Modelo de processo

O modelo é simplificado e serve para treinamento. Ele não é um modelo reológico rigoroso. Reproduz:

- o pico de potência na incorporação do negro de fumo;
- a queda de viscosidade com a temperatura;
- a flutuação do pistão enquanto há material solto;
- o atraso e a influência da parede no termopar;
- a troca de calor com a água do TCU;
- o risco de scorch com curativos;
- a dispersão.

Os parâmetros foram calibrados para que a S337Y dê cerca de 2 min por batch e descarga perto de 150 °C.

Premissas a confirmar com a fábrica:

- Câmara de aproximadamente 390 L.
- Condição "A" = o passo termina no primeiro critério atingido. Condição "B" = todos os critérios precisam ser atingidos.
- Unidade e escala da pena "Eletricidade".

## Estrutura

```
index.html        página publicada, criptografada com senha (gerada)
src/lock.html     tela de senha que descriptografa o simulador no navegador
build.py          gera index.html a partir de src/
src/model.js      modelo físico e sequenciador da receita
src/recipes.js    receitas de exemplo (S337Y, masterbatch e final)
src/ui.html       marcação e estilos
src/ui_*.js       interface: operação, ficha, gráficos, painel de comando
```

Depois de alterar os arquivos em `src/`, gere a página de novo com:

```
pip install cryptography
BANBURY_SENHA='sua senha' python3 build.py
```

Esse comando também serve para **trocar a senha**: gere com a senha nova e publique o `index.html`. A senha nunca é gravada no repositório. Quem marcou "Lembrar neste computador" vai precisar digitar a senha nova.
