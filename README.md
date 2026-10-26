# Esquadro — editor com blocos

Editor de arquitetura para jogos em grade: monte casas, muros e construções empilhando formas geométricas que se encaixam pelos vértices. Roda no navegador, sem instalação, sem build e sem dependências.

![Formas encaixadas na vista oblíqua](previa.png)

![A mesma ideia na vista isométrica](previa-isometrica.png)

## Como abrir

Baixe a pasta e abra `index.html` no navegador (duplo clique basta). Tudo é HTML, CSS e JavaScript puro, com Canvas 2D.

## O que dá para fazer

- **Formas:** polígonos regulares de 3 a 48 lados (32 px por lado) e círculos (32 px de diâmetro). Um clique no painel cria.
- **Esticar e dar espessura:** as alças esticam em X e Y; a alça redonda dá espessura em Z e transforma a forma num volume.
- **Encaixe:** vértices próximos se encaixam e as peças encaixadas passam a se mover juntas. Também há encaixe na grade (tiles de 64 px), com vértices e meio dos lados. Cada assistente pode ser desligado.
- **Vistas:** a oblíqua de jogo em grade (a altura sobe na diagonal), topo, isométrica e giro livre segurando o botão da roda, com um ícone que mostra a orientação e trava opcional em múltiplos de 45°.
- **Seleção:** clique marca a forma (em azul), `Ctrl`+clique marca várias; o grupo inteiro vem junto, ou só as peças, com "Selecionar desacoplado".
- **Mesclar:** formas que se encostam viram uma só, e os vértices entre elas somem. Peças que fecham uma volta (paredes em torno de uma janela) viram uma parede com vão.
- **Recortar área:** com `Shift`, marque vértices de uma forma; a área entre eles (em vermelho) pode ser recortada.
- **Rotacionar:** 90°, 180° e 270° em X, Y ou Z; um prisma deitado de lado vira rampa ou telhado.
- **Formas livres em 3D:** duplo clique num vértice o prende ao cursor; ele pode ir a qualquer ponto, inclusive a um vértice de outra altura, e a forma se deforma (pirâmides, telhados inclinados).
- **Cor e filtro:** pinte as formas com qualquer cor (paleta do sistema ou hexadecimal) e esconda ou mostre formas por cor.
- **Régua:** clique em dois vértices para medir a distância em 3D, em px e em tiles.
- **Biblioteca:** salve peças com nome e coloque cópias no desenho; exporte e importe a biblioteca como JSON.
- **Cenas:** `Ctrl+S` salva e `Ctrl+O` carrega (no Chrome e no Edge, `Ctrl+S` grava de novo no mesmo arquivo).

A tecla `?` mostra todos os atalhos.

## Arquivos

- `index.html`: página e painel.
- `geometria.js`: formas, vértices, câmeras, encaixes, mescla, recorte, giro e malhas 3D. Sem acesso ao DOM; também roda no Node.
- `editor.js`: visualizador e interação.
- `testes.cjs`: testes da geometria, com `node testes.cjs`.

## Licença

MIT. Veja `LICENSE`.
