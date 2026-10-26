// Editor dos Blocos: visualizador com a oblíqua do jogo e câmera giratória,
// grade do chão, criação, esticamento, espessura, encaixes e arraste de grupos.
(function () {
  'use strict';
  const G = window.Geometria;

  const COR = {
    fundo: '#000',
    grade: 'rgba(255,255,255,0.32)',
    gradeOrigem: 'rgba(255,255,255,0.7)',
    topo: '#d4d4d4',
    baixo: '#8c8c8c',
    aresta: '#5a5a5a',
    vertice: '#7a7a7a',
    destaque: '#fff',
    marcada: 'rgba(70,150,255,0.22)', // a única cor das formas: a marcação
    regua: '#ffd54a',
    recorte: 'rgba(225,30,30,0.72)', // área a recortar, em vermelho
    azul: '#4696ff',
  };
  // Só o ícone de orientação tem cor, para distinguir os eixos.
  const COR_EIXO = { X: '#e5534b', Y: '#57ab5a', Z: '#539bf5' };
  const ZOOMS = [1, 2, 3, 4, 6, 8];
  const LIMITE_ENCAIXE = 8;   // px de tela
  const TRAVA_GRAUS = 5;      // distância em graus para travar em múltiplos de 45°
  const GRAUS_POR_PX = 0.4;
  const DURACAO = 220;        // ms das transições de vista
  const ALCA = 4;             // meia largura das alças, px de tela
  const CHAVE = 'esquadro';
  const CHAVE_OPCOES = 'esquadro-opcoes';
  const ISO = (Math.atan(1 / Math.SQRT2) * 180) / Math.PI; // 35,26°: vê as mesmas faces da oblíqua

  const canvas = document.getElementById('vista');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);

  // Arraste interno: o conteúdo vem do botão, nunca de JSON externo no dataTransfer.
  let insercaoArrastada = null;
  const dica = document.createElement('div');
  dica.id = 'dica-biblioteca';
  dica.setAttribute('role', 'tooltip');
  dica.hidden = true;
  document.body.append(dica);
  function esconderDica() { dica.hidden = true; }
  function mostrarDica(botao, texto) {
    if (insercaoArrastada) return;
    dica.textContent = texto;
    dica.hidden = false;
    botao.setAttribute('aria-describedby', dica.id);
    const r = botao.getBoundingClientRect();
    dica.style.left = Math.max(8, Math.min(r.right + 8, window.innerWidth - dica.offsetWidth - 8)) + 'px';
    dica.style.top = Math.max(8, Math.min(r.top, window.innerHeight - dica.offsetHeight - 8)) + 'px';
  }
  document.addEventListener('scroll', esconderDica, true);
  function fonteArrastavel(botao, obter) {
    botao.draggable = true;
    let terminou = -Infinity;
    botao.addEventListener('dragstart', ev => {
      insercaoArrastada = obter();
      if (!insercaoArrastada) { ev.preventDefault(); return; }
      esconderDica();
      ev.dataTransfer.effectAllowed = 'copy';
      ev.dataTransfer.setData('application/x-esquadro', 'inserir');
    });
    botao.addEventListener('dragend', () => { insercaoArrastada = null; terminou = performance.now(); canvas.classList.remove('recebendo-peca'); });
    botao.addEventListener('click', ev => { if (performance.now() - terminou < 250) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);
  }
  canvas.addEventListener('dragover', ev => {
    if (!insercaoArrastada) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'copy';
    canvas.classList.add('recebendo-peca');
  });
  canvas.addEventListener('dragleave', () => canvas.classList.remove('recebendo-peca'));
  canvas.addEventListener('drop', ev => {
    if (!insercaoArrastada) return;
    ev.preventDefault();
    const origem = insercaoArrastada;
    insercaoArrastada = null;
    canvas.classList.remove('recebendo-peca');
    const p = noPlano(...pos(ev));
    if (!p) { alert('O chão está de perfil. Use a vista Jogo, Topo ou Iso para posicionar a peça.'); return; }
    const ponto = { x: p[0], y: p[1], z: 0 };
    if (origem.item) colocarDaBiblioteca(origem.item, ponto);
    else criar(origem.lados, ponto);
  });

  let formas = [];
  let proximoId = 1;
  let marcadas = [];
  let vertSel = null;      // { forma, idx: Set } vértices marcados com Shift (índices de G.vertices)
  let selecionada = null;
  let desacoplada = false; // seleção só das peças marcadas, sem o grupo
  let area = null;          // cópias para colar
  const vista = { zoom: 2, ox: 0, oy: 0 };
  let arraste = null;
  let cursor = null;
  const historico = [];

  const opcoes = { travarAngulos: true, encaixeVertices: true, encaixeGrade: true, mostrarGrade: true, eixoGiro: 'z' };
  const camera = { modo: 'obliqua', giro: 45, inclinacao: ISO };
  let cam = G.OBLIQUA;   // câmera do quadro atual (pode estar em transição)
  let transicao = null;  // { de, t0 }
  let pivo = null;       // ponto do mundo mantido no centro ao girar
  let quadroPedido = false;

  // ---------- câmera e coordenadas ----------
  const camAlvo = () => (camera.modo === 'obliqua' ? G.OBLIQUA : G.cameraOrbita(camera.giro, camera.inclinacao));
  const tela = (x, y, z) => {
    const p = G.projetar({ x, y, z }, cam);
    return [p.x * vista.zoom + vista.ox, p.y * vista.zoom + vista.oy];
  };
  const paraProj = (sx, sy) => [(sx - vista.ox) / vista.zoom, (sy - vista.oy) / vista.zoom];
  const tamanho = () => canvas.getBoundingClientRect();

  // Ponto do plano horizontal de altura z sob o ponto de tela, ou null se o
  // plano está de perfil.
  function noPlano(sx, sy, z = 0) {
    const [px, py] = paraProj(sx, sy);
    const a = cam.ax, b = cam.ay;
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) < 0.05) return null;
    const u = px - a[2] * z, v = py - b[2] * z;
    return [(u * b[1] - a[1] * v) / det, (a[0] * v - b[0] * u) / det];
  }

  // Deslocamento de tela (px) convertido em deslocamento X/Y no mundo.
  function deltaChao(dsx, dsy) {
    const a = cam.ax, b = cam.ay;
    const u = dsx / vista.zoom, v = dsy / vista.zoom;
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) > 0.25) return [(u * b[1] - a[1] * v) / det, (a[0] * v - b[0] * u) / det];
    // Chão quase de perfil: anda só na direção horizontal da tela.
    const n = a[0] * a[0] + a[1] * a[1] || 1;
    return [(a[0] * u) / n, (a[1] * u) / n];
  }

  function pontoCentral() {
    const r = tamanho();
    const p = noPlano(r.width / 2, r.height / 2);
    if (p) return { x: p[0], y: p[1], z: 0 };
    const [px, py] = paraProj(r.width / 2, r.height / 2);
    const a = cam.ax, b = cam.ay;
    return { x: a[0] * px + b[0] * py, y: a[1] * px + b[1] * py, z: a[2] * px + b[2] * py };
  }

  function mudarVista(modo, giro, inclinacao) {
    pivo = pontoCentral();
    transicao = { de: cam, t0: performance.now() };
    camera.modo = modo;
    if (giro !== undefined) { camera.giro = giro; camera.inclinacao = inclinacao; }
    salvarOpcoes();
    desenhar();
  }

  function atualizarCamera() {
    const alvo = camAlvo();
    if (transicao) {
      const t = Math.min(1, (performance.now() - transicao.t0) / DURACAO);
      cam = t >= 1 ? alvo : G.misturarCameras(transicao.de, alvo, 1 - (1 - t) ** 3);
      if (t >= 1) transicao = null;
    } else {
      cam = alvo;
    }
    if (pivo) {
      const r = tamanho();
      const p = G.projetar(pivo, cam);
      vista.ox = r.width / 2 - p.x * vista.zoom;
      vista.oy = r.height / 2 - p.y * vista.zoom;
      if (!transicao && !(arraste && arraste.tipo === 'girar')) pivo = null;
    }
  }

  const travar = (a) => {
    const m = Math.round(a / 45) * 45;
    return opcoes.travarAngulos && Math.abs(a - m) <= TRAVA_GRAUS ? m : a;
  };

  function novoId() { return proximoId++; }
  const grupoDe = (f) => formas.filter((g) => g.grupo === f.grupo);
  // Formas marcadas (clicadas, em azul); `selecionada` é a última, a do painel.
  // A seleção abrange os grupos das marcadas ou, desacoplada, só as marcadas.
  const selecao = () => (desacoplada ? marcadas.slice() : formas.filter((g) => marcadas.some((m) => m.grupo === g.grupo)));
  function marcar(lista, soPeca = false) {
    marcadas = lista.filter(Boolean);
    if (vertSel && !marcadas.includes(vertSel.forma)) vertSel = null;
    selecionada = marcadas[marcadas.length - 1] || null;
    desacoplada = !!selecionada && soPeca;
  }
  const selecionar = (f, soPeca = false) => marcar([f], soPeca);
  // Ctrl+clique: põe ou tira a forma da marcação.
  function alternar(f) {
    marcar(marcadas.includes(f) ? marcadas.filter((g) => g !== f) : [...marcadas, f], desacoplada);
  }
  // Peças desacopladas que se movem saem do grupo, juntas (e podem entrar em outro ao encaixar).
  function desacoplar() {
    if (!desacoplada) return;
    const restaria = formas.some((g) => !marcadas.includes(g) && marcadas.some((m) => m.grupo === g.grupo));
    if (restaria) { const id = novoId(); for (const m of marcadas) m.grupo = id; }
  }

  // ---------- cena ----------
  function estadoTexto() { return JSON.stringify({ proximoId, formas }); }
  function carregarTexto(texto) {
    const dados = JSON.parse(texto);
    formas = (dados.formas || []).map((f) => ({ ...f }));
    proximoId = Math.max(dados.proximoId || 1, ...formas.map((f) => Math.max(f.id, f.grupo) + 1));
    selecionar(null);
  }
  function registrar() {
    historico.push(estadoTexto());
    if (historico.length > 200) historico.shift();
  }
  function desfazer() {
    if (!historico.length) return;
    const ids = marcadas.map((f) => f.id), solta = desacoplada;
    carregarTexto(historico.pop());
    marcar(formas.filter((f) => ids.includes(f.id)), solta);
    mudou();
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, estadoTexto()); } catch (e) { /* sem armazenamento */ }
  }
  function salvarOpcoes() {
    try { localStorage.setItem(CHAVE_OPCOES, JSON.stringify({ opcoes, camera })); } catch (e) { /* idem */ }
  }
  function mudou() { salvar(); atualizarPainel(); desenhar(); if (typeof mostrarCena === 'function') mostrarCena(); atualizarAmostra(); }

  // Com o encaixe na grade, medidas puxadas à mão param em múltiplos de meio tile.
  function alinhar(v) {
    if (!opcoes.encaixeGrade) return v;
    const passo = G.TILE / 2;
    const m = Math.round(v / passo) * passo;
    return Math.abs(v - m) <= LIMITE_ENCAIXE / vista.zoom ? m : v;
  }

  function criar(lados, ponto = null) {
    registrar();
    const c = ponto || pontoCentral();
    const f = G.criarForma(lados, 0, 0, novoId(), 0);
    f.grupo = f.id;
    f.x = Math.round(c.x - f.w / 2);
    f.y = Math.round(c.y - f.h / 2);
    if (opcoes.encaixeGrade && !ponto) {
      f.x = Math.round(f.x / G.TILE) * G.TILE;
      f.y = Math.round(f.y / G.TILE) * G.TILE;
    }
    formas.push(f);
    selecionar(f);
    mudou();
  }

  function moverSelecao(dx, dy, dz) {
    desacoplar();
    const g = selecao();
    dz = Math.max(dz, -Math.min(...g.map((h) => h.z)));
    for (const h of g) { h.x += dx; h.y += dy; h.z += dz; }
  }

  function unir(a, b) {
    if (a === b) return;
    for (const f of formas) if (f.grupo === b) f.grupo = a;
  }

  // ---------- desenho ----------
  // Luz fixa no mundo, vinda do noroeste: faces sul mais claras, leste mais escuras.
  const LUZ = (() => { const n = Math.hypot(0.3, 1); return [-0.3 / n, 1 / n]; })();
  // Sem cor definida, a forma é cinza-claro (o topo em #d4d4d4).
  const COR_PADRAO = '#d4d4d4';
  const rgbs = new Map();
  function rgbDe(hex) {
    if (!rgbs.has(hex)) rgbs.set(hex, [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
    return rgbs.get(hex);
  }

  function caminho(pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  // Tom de uma face pela normal e pela cor da forma: virada para cima é a cor cheia; para baixo,
  // mais escura; de lado, a luz fixa do noroeste (como os cinzas de antes, em proporção).
  function luz([nx, ny, nz]) {
    if (nz > 0.7) return 1;
    if (nz < -0.7) return 140 / 212;
    const l = Math.hypot(nx, ny) || 1;
    return (150 + 45 * (((nx / l) * LUZ[0] + (ny / l) * LUZ[1] + 1) / 2)) / 212;
  }
  function tom(n, cor) {
    const k = luz(n);
    const [r, g, b] = rgbDe(cor || COR_PADRAO);
    return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
  }

  // Desenha o prisma em qualquer eixo: laterais visíveis (da mais distante para
  // a mais próxima) e a tampa voltada para a câmera.
  // Forma livre em 3D (malha): faces visíveis da mais distante para a mais próxima.
  function desenharMalha(f) {
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    for (const face of G.facesVisiveis(f, cam)) {
      caminho(face.pts.map((p) => tela(p.x, p.y, p.z)));
      ctx.fillStyle = tom(face.n, f.cor);
      ctx.fill();
      ctx.strokeStyle = COR.aresta;
      ctx.stroke();
    }
  }

  function desenharForma(f) {
    if (f.malha) return desenharMalha(f);
    const P = G.prisma(f);
    const { a, b, e } = P;
    const n = a.length;
    const d = cam.d;
    const dot = (v, w) => v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
    const t = (p) => tela(p.x, p.y, p.z);
    const fimVisivel = dot(e, d) >= 0; // a tampa do fim do eixo olha para a câmera
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    if (P.comprimento > 0) {
      const visivel = P.normais.map((nv) => dot(nv, d) > 1e-9);
      // Laterais de fora e paredes dos vãos, da mais distante para a mais próxima.
      const lados = [];
      for (const laco of [P, ...P.furos]) {
        const m = laco.a.length;
        for (let i = 0; i < m; i++) {
          if (dot(laco.normais[i], d) <= 1e-9) continue;
          const p = laco.a[i], q = laco.a[(i + 1) % m];
          lados.push({ q: [p, q, laco.b[(i + 1) % m], laco.b[i]], n: laco.normais[i],
            prof: d[0] * (p.x + q.x) / 2 + d[1] * (p.y + q.y) / 2 + d[2] * (p.z + q.z) / 2 });
        }
      }
      lados.sort((x, y) => x.prof - y.prof);
      for (const lado of lados) {
        caminho(lado.q.map(t));
        const c = tom(lado.n, f.cor);
        ctx.fillStyle = c;
        ctx.fill();
        ctx.strokeStyle = P.circulo ? c : COR.aresta;
        ctx.stroke();
      }
      if (P.circulo) {
        // Contorno do cilindro: a borda da tampa escondida e as geratrizes da silhueta.
        const oculta = fimVisivel ? a : b;
        ctx.strokeStyle = COR.aresta;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          if (visivel[i]) { ctx.moveTo(...t(oculta[i])); ctx.lineTo(...t(oculta[j])); }
          if (visivel[i] !== visivel[(i + n - 1) % n]) { ctx.moveTo(...t(a[i])); ctx.lineTo(...t(b[i])); }
        }
        ctx.stroke();
      }
    }
    const qual = P.comprimento > 0 && !fimVisivel ? 'a' : 'b';
    const tampa = P.comprimento > 0 ? (fimVisivel ? b : a) : a;
    // A tampa leva os vãos como buracos (evenodd): pelo vão aparecem as paredes de dentro.
    ctx.beginPath();
    for (const laco of [tampa, ...P.furos.map((h) => (P.comprimento > 0 ? h[qual] : h.a))]) {
      laco.forEach((p, i) => { const [x, y] = t(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
    }
    ctx.fillStyle = tom(fimVisivel ? e : e.map((c) => -c), f.cor);
    ctx.fill('evenodd');
    ctx.strokeStyle = COR.aresta;
    ctx.stroke();
  }

  // Grade do chão (z = 0), com tiles de 64 px.
  function desenharGrade(w, h) {
    if (!opcoes.mostrarGrade) return;
    const T = G.TILE;
    if (T * vista.zoom < 8) return;
    const cantos = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => noPlano(x, y));
    const c = pontoCentral();
    let x0, x1, y0, y1;
    if (cantos.every(Boolean)) {
      x0 = Math.min(...cantos.map((p) => p[0])); x1 = Math.max(...cantos.map((p) => p[0]));
      y0 = Math.min(...cantos.map((p) => p[1])); y1 = Math.max(...cantos.map((p) => p[1]));
    } else {
      [x0, x1, y0, y1] = [c.x - 30 * T, c.x + 30 * T, c.y - 30 * T, c.y + 30 * T];
    }
    const max = 120 * T; // chão quase de perfil: limita a grade em volta do centro
    x0 = Math.max(x0, c.x - max); x1 = Math.min(x1, c.x + max);
    y0 = Math.max(y0, c.y - max); y1 = Math.min(y1, c.y + max);
    x0 = Math.floor(x0 / T) * T; x1 = Math.ceil(x1 / T) * T;
    y0 = Math.floor(y0 / T) * T; y1 = Math.ceil(y1 / T) * T;
    const linhas = (origem) => {
      ctx.beginPath();
      for (let x = x0; x <= x1; x += T) {
        if ((x === 0) !== origem) continue;
        ctx.moveTo(...tela(x, y0, 0)); ctx.lineTo(...tela(x, y1, 0));
      }
      for (let y = y0; y <= y1; y += T) {
        if ((y === 0) !== origem) continue;
        ctx.moveTo(...tela(x0, y, 0)); ctx.lineTo(...tela(x1, y, 0));
      }
      ctx.stroke();
    };
    ctx.lineWidth = 1 / (window.devicePixelRatio || 1); // um pixel físico
    ctx.strokeStyle = COR.grade;
    linhas(false);
    ctx.strokeStyle = COR.gradeOrigem;
    linhas(true);
  }

  function desenharVertices() {
    const sel = selecao();
    ctx.fillStyle = COR.vertice;
    for (const f of visiveis()) {
      if (sel.includes(f)) continue;
      for (const v of G.vertices(f)) {
        const [x, y] = tela(v.x, v.y, v.z);
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      }
    }
    if (!selecionada) return;
    ctx.fillStyle = COR.destaque;
    for (const f of sel) {
      for (const v of G.vertices(f)) {
        const [x, y] = tela(v.x, v.y, v.z);
        ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
      }
    }
  }

  const naTela = ([x, y]) => [x * vista.zoom + vista.ox, y * vista.zoom + vista.oy];

  // Preenche a área projetada de uma forma de uma vez só (sem somar a
  // transparência onde as faces se sobrepõem).
  function preencherArea(f, cor) {
    ctx.beginPath();
    const laco = (poli, positivo) => {
      const p = ((G.area(poli) < 0) === positivo ? poli.slice().reverse() : poli).map(naTela);
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    };
    for (const poli of G.faces(f, cam)) {
      laco(poli, true);
      for (const h of poli.furos || []) laco(h, false); // vão: sentido contrário, fica de fora
    }
    ctx.fillStyle = cor;
    ctx.fill('nonzero');
  }

  function convexo(pts) {
    let sinal = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], [cx, cy] = pts[(i + 2) % pts.length];
      const c = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
      if (Math.abs(c) < 1e-9) continue;
      if (sinal && Math.sign(c) !== sinal) return false;
      sinal = Math.sign(c);
    }
    return true;
  }

  // Contorno da forma: a envoltória, ou topo e base nas formas côncavas.
  function tracarContorno(f) {
    const comVao = !!(f.furos && f.furos.length);
    if (!comVao && (f.malha || !f.pontos || convexo(G.contornoUV(f)))) { caminho(G.silhueta(f, cam).map(naTela)); ctx.stroke(); return; }
    const fs = G.faces(f, cam);
    for (const poli of fs.slice(0, fs.length > 1 ? 2 : 1)) {
      caminho(poli.map(naTela)); ctx.stroke();
      for (const h of poli.furos || []) { caminho(h.map(naTela)); ctx.stroke(); }
    }
  }

  // Marcadas: preenchimento azul transparente e contorno cheio; o resto do
  // grupo, contorno tracejado.
  function contornoSelecao() {
    for (const f of selecao()) {
      const marcada = marcadas.includes(f);
      if (marcada) preencherArea(f, COR.marcada);
      ctx.strokeStyle = COR.destaque;
      ctx.lineWidth = marcada ? 2 : 1;
      ctx.setLineDash(marcada ? [] : [4, 3]);
      tracarContorno(f);
    }
    ctx.setLineDash([]);
  }

  // ---------- vértices marcados (Shift+clique) ----------
  function baseMarcada() {
    if (vertSel && !formas.includes(vertSel.forma)) vertSel = null;
    if (!vertSel) return [];
    const n = G.verticesBase(vertSel.forma).length;
    return [...new Set([...vertSel.idx].filter((i) => i < G.vertices(vertSel.forma).length).map((i) => i % n))];
  }

  // Vértice sob o cursor (a 7 px), preferindo os das formas marcadas.
  function verticeEm(sx, sy) {
    let melhor = null;
    const ordem = [...marcadas, ...visiveis().filter((f) => !marcadas.includes(f))];
    for (const f of ordem) {
      G.vertices(f).forEach((v, i) => {
        const [x, y] = tela(v.x, v.y, v.z);
        const d = Math.hypot(x - sx, y - sy) - (marcadas.includes(f) ? 0.5 : 0);
        if (d > 7) return;
        // Pontos que caem no mesmo lugar da tela (comum na isométrica): vence o mais perto da câmera.
        const prof = cam.d[0] * v.x + cam.d[1] * v.y + cam.d[2] * v.z;
        if (!melhor || d < melhor.d - 1 || (Math.abs(d - melhor.d) <= 1 && prof > melhor.prof)) melhor = { forma: f, i, d, prof };
      });
    }
    return melhor;
  }

  function alternarVertice(v) {
    if (!vertSel || vertSel.forma !== v.forma) {
      if (!marcadas.includes(v.forma)) selecionar(v.forma);
      vertSel = { forma: v.forma, idx: new Set() };
    }
    if (vertSel.idx.has(v.i)) vertSel.idx.delete(v.i); else vertSel.idx.add(v.i);
    if (!vertSel.idx.size) vertSel = null;
  }

  // A área entre os vértices marcados aparece preenchida no topo da forma.
  function desenharVerticesMarcados() {
    const base = baseMarcada();
    if (!vertSel) return;
    const f = vertSel.forma;
    const corte = base.length >= 3 ? G.areaRecorte(f, base) : null;
    if (corte) {
      const z1 = f.z + f.espessura;
      caminho(corte.map(([x, y]) => tela(x, y, z1)));
      ctx.fillStyle = COR.recorte;
      ctx.fill();
      ctx.setLineDash([5, 3]);
      ctx.strokeStyle = COR.destaque;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (f.espessura > 0) {
        caminho(corte.map(([x, y]) => tela(x, y, f.z)));
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    const vs = G.vertices(f);
    for (const i of vertSel.idx) {
      const v = vs[i];
      if (!v) continue;
      const [x, y] = tela(v.x, v.y, v.z);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = COR.azul;
      ctx.fill();
      ctx.strokeStyle = COR.destaque;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function recortarArea() {
    const base = baseMarcada();
    const f = vertSel && vertSel.forma;
    const pedacos = f && G.recortar(f, base);
    if (!pedacos) return;
    registrar();
    formas = formas.filter((g) => g !== f);
    const novas = pedacos.map((p) => ({ ...p, id: novoId(), grupo: f.grupo }));
    formas.push(...novas);
    vertSel = null;
    marcar(novas);
    mudou();
  }

  // Direção de +Z na tela (px por px de altura, antes do zoom).
  const direcaoZ = () => [cam.ax[2], cam.ay[2]];

  // Alças da forma selecionada: 8 de esticar no topo e 1 de espessura.
  function alcas() {
    const f = selecionada;
    if (!f || marcadas.length !== 1 || vertSel) return []; // com vértices marcados, sem alças
    const z1 = f.z + f.espessura;
    const xs = [f.x, f.x + f.w / 2, f.x + f.w], ys = [f.y, f.y + f.h / 2, f.y + f.h];
    const nomes = [['nw', 'n', 'ne'], ['w', null, 'e'], ['sw', 's', 'se']];
    const out = [];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      if (!nomes[j][i]) continue;
      const [x, y] = tela(xs[i], ys[j], z1);
      out.push({ tipo: nomes[j][i], x, y });
    }
    const [cx, cy] = tela(f.x + f.w / 2, f.y + f.h / 2, z1);
    const [zx, zy] = direcaoZ();
    const len = Math.hypot(zx, zy);
    const [ux, uy] = len > 0.2 ? [zx / len, zy / len] : [-Math.SQRT1_2, -Math.SQRT1_2];
    out.push({ tipo: 'z', x: cx + ux * 25, y: cy + uy * 25, de: [cx, cy] });
    return out;
  }

  function desenharAlcas() {
    for (const a of alcas()) {
      ctx.fillStyle = COR.destaque;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      if (a.tipo === 'z') {
        ctx.beginPath();
        ctx.moveTo(...a.de); ctx.lineTo(a.x, a.y);
        ctx.strokeStyle = COR.destaque; ctx.stroke();
        ctx.beginPath();
        ctx.arc(a.x, a.y, ALCA + 1, 0, Math.PI * 2);
        ctx.fill(); ctx.strokeStyle = '#000'; ctx.stroke();
      } else {
        ctx.fillRect(a.x - ALCA, a.y - ALCA, ALCA * 2, ALCA * 2);
        ctx.strokeRect(a.x - ALCA + 0.5, a.y - ALCA + 0.5, ALCA * 2 - 1, ALCA * 2 - 1);
      }
    }
  }

  function desenharEncaixe() {
    const e = arraste && arraste.encaixe;
    if (!e) return;
    const [x, y] = tela(e.destino.x, e.destino.y, e.destino.z);
    ctx.strokeStyle = COR.destaque;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (e.alvo) ctx.arc(x, y, 7, 0, Math.PI * 2);
    else { ctx.rect(x - 6, y - 6, 12, 12); } // quadrado: encaixe na grade
    ctx.stroke();
  }

  // Ícone de orientação no canto: os três eixos e o anel do chão na câmera atual.
  function desenharIcone(w) {
    const cx = w - 64, cy = 64, R = 34;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 52, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.strokeStyle = '#2c2c2c';
    ctx.lineWidth = 1;
    ctx.stroke();
    const proj = (x, y, z) => { const p = G.projetar({ x, y, z }, cam); return [cx + p.x * R, cy + p.y * R]; };
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2;
      const [x, y] = proj(Math.cos(a), Math.sin(a), 0);
      k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = '#555';
    ctx.stroke();
    const eixos = [['X', [1, 0, 0]], ['Y', [0, 1, 0]], ['Z', [0, 0, 1]]]
      .map(([nome, v]) => ({ nome, v, prof: v[0] * cam.d[0] + v[1] * cam.d[1] + v[2] * cam.d[2] }))
      .sort((a, b) => a.prof - b.prof);
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of eixos) {
      const [nx, ny] = proj(-e.v[0], -e.v[1], -e.v[2]);
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = COR_EIXO[e.nome];
      ctx.globalAlpha = 0.45;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      const [x, y] = proj(...e.v);
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      ctx.lineWidth = 1;
      const len = Math.hypot(x - cx, y - cy);
      if (len > 6) {
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = COR_EIXO[e.nome]; ctx.fill();
        const k = (len + 10) / len;
        ctx.fillText(e.nome, cx + (x - cx) * k, cy + (y - cy) * k);
      }
    }
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#ddd'; ctx.fill();
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#888';
    const texto = camera.modo === 'obliqua'
      ? 'oblíqua do jogo'
      : `giro ${Math.round(camera.giro)}° · inclinação ${Math.round(camera.inclinacao)}°`;
    ctx.fillText(texto, cx, cy + 66);
    ctx.restore();
  }

  function desenhar() {
    quadroPedido = false;
    atualizarCamera();
    const dpr = window.devicePixelRatio || 1;
    const r = tamanho();
    if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COR.fundo;
    ctx.fillRect(0, 0, r.width, r.height);
    // Vista de baixo do chão: a grade fica na frente das formas.
    const gradeNaFrente = cam.d[2] < 0;
    if (!gradeNaFrente) desenharGrade(r.width, r.height);
    for (const f of G.ordemDesenho(visiveis().concat(refs.map(caixaRef)), cam)) (f.ref ? desenharRef(f.ref) : desenharForma(f));
    if (gradeNaFrente) desenharGrade(r.width, r.height);
    desenharVertices();
    contornoSelecao();
    desenharVerticesMarcados();
    desenharAlcas();
    desenharEncaixe();
    desenharRegua();
    desenharVerticeAtivo();
    desenharIcone(r.width);
    marcarVista();
    const partes = [`zoom ${vista.zoom}×`, `${formas.length} forma(s)`, `tile ${G.TILE} px`];
    const p = cursor && noPlano(cursor[0], cursor[1]);
    if (p) partes.push(`chão x ${Math.round(p[0])} y ${Math.round(p[1])}`);
    if (arraste && arraste.tipo === 'vertice') partes.push('arrastando vértice: Shift sobe e desce · clique solta · Esc cancela');
    if (coresOcultas.size) partes.push(`${formas.length - visiveis().length} escondida(s) pelo filtro`);
    if (vertSel) partes.push(`${vertSel.idx.size} vértice(s) marcado(s)`);
    if (arraste && arraste.encaixe) partes.push(arraste.encaixe.alvo ? 'encaixe no vértice' : 'encaixe na grade');
    $('status').textContent = partes.join('  ·  ');
    if (transicao && !quadroPedido) { quadroPedido = true; requestAnimationFrame(desenhar); }
  }

  // ---------- painel ----------
  const campos = { x: 'p-x', y: 'p-y', z: 'p-z', w: 'p-w', h: 'p-h', espessura: 'p-e' };
  const arred = (v) => Math.round(v * 10) / 10;

  function atualizarPainel() {
    const f = selecionada;
    $('props').hidden = !f;
    $('sem-selecao').hidden = !!f;
    if (!f) return;
    const g = grupoDe(f).length;
    $('info').textContent = marcadas.length > 1 ? `${marcadas.length} formas marcadas` : nomeForma(f);
    const extra = [`${G.vertices(f).length} vértices`];
    if (f.furos && f.furos.length) extra.push(f.furos.length === 1 ? '1 vão' : `${f.furos.length} vãos`);
    if (marcadas.length > 1) extra.unshift(`editando: ${nomeForma(f).toLowerCase()}`);
    if (g > 1) extra.push(desacoplada ? 'desacoplada do grupo' : `grupo de ${g}`);
    $('info-extra').textContent = extra.join(' · ');
    for (const [k, id] of Object.entries(campos)) if (document.activeElement !== $(id)) $(id).value = arred(f[k]);
    $('separar').disabled = g < 2;
  }

  const NOMES_FORMA = { 3: 'Triângulo', 4: 'Quadrado', 5: 'Pentágono', 6: 'Hexágono', 8: 'Octógono' };
  function nomeForma(f) {
    if (f.malha) return 'Forma livre 3D'; // com vértices arrastados
    if (f.pontos && !f.regular) return 'Forma livre'; // mesclada ou recortada
    if (f.lados === 0) return 'Círculo';
    return NOMES_FORMA[f.lados] || `Polígono de ${f.lados} lados`;
  }

  for (const [k, id] of Object.entries(campos)) {
    $(id).addEventListener('change', () => {
      const f = selecionada;
      const v = parseFloat($(id).value);
      if (!f || !Number.isFinite(v)) return atualizarPainel();
      registrar();
      if (k === 'x') moverSelecao(v - f.x, 0, 0);
      else if (k === 'y') moverSelecao(0, v - f.y, 0);
      else if (k === 'z') moverSelecao(0, 0, Math.max(0, v) - f.z);
      else if (k === 'espessura') f.espessura = Math.max(0, v);
      else f[k] = Math.max(1, v);
      mudou();
    });
  }

  $('criar-poligono').addEventListener('click', () => {
    const n = Math.round(parseFloat($('lados').value));
    if (!(n >= G.MIN_LADOS && n <= G.MAX_LADOS)) { $('lados').value = 4; return; }
    criar(n);
  });
  $('lados').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('criar-poligono').click(); });
  for (const b of document.querySelectorAll('[data-lados]')) {
    b.addEventListener('click', () => criar(+b.dataset.lados));
    fonteArrastavel(b, () => ({ lados: +b.dataset.lados }));
  }
  fonteArrastavel($('criar-poligono'), () => {
    const lados = Math.round(Number($('lados').value));
    return lados >= G.MIN_LADOS && lados <= G.MAX_LADOS ? { lados } : null;
  });

  // Seções recolhíveis do painel: lembra quais ficaram abertas.
  for (const d of document.querySelectorAll('details[data-secao]')) {
    const chave = 'esquadro-secao-' + d.dataset.secao;
    try { const v = localStorage.getItem(chave); if (v !== null) d.open = v === '1'; } catch (e) { /* padrão */ }
    d.addEventListener('toggle', () => { try { localStorage.setItem(chave, d.open ? '1' : '0'); } catch (e) { /* idem */ } });
  }

  // Ajuda: atalhos e comandos.
  const abrirAjuda = () => { if (!$('ajuda').open) $('ajuda').showModal(); };
  $('abrir-ajuda').addEventListener('click', abrirAjuda);

  // Botão da vista atual em destaque.
  function marcarVista() {
    const giro = Math.round(camera.giro), incl = Math.round(camera.inclinacao);
    const atual = camera.modo === 'obliqua' ? 'vista-jogo'
      : incl === 90 && giro % 360 === 0 ? 'vista-topo'
      : giro === 45 && incl === Math.round(ISO) ? 'vista-iso' : null;
    for (const id of ['vista-jogo', 'vista-topo', 'vista-iso']) $(id).setAttribute('aria-pressed', String(id === atual));
  }

  function separar() {
    if (!selecionada || grupoDe(selecionada).length < 2) return;
    registrar();
    selecionada.grupo = novoId();
    mudou();
  }
  // Insere cópias deslocadas; quem era do mesmo grupo continua junto, num grupo novo.
  function inserirCopias(lista, dx, dy) {
    const grupos = new Map();
    const novas = lista.map((f) => {
      if (!grupos.has(f.grupo)) grupos.set(f.grupo, novoId());
      return { ...f, id: novoId(), grupo: grupos.get(f.grupo), x: f.x + dx, y: f.y + dy };
    });
    formas.push(...novas);
    marcar(novas);
  }
  function copiar() {
    if (selecionada) area = selecao().map((f) => ({ ...f }));
  }
  // Cola com o centro da cópia no ponto do chão sob (sx, sy).
  function colar(sx, sy) {
    if (!area) return;
    const p = (sx !== undefined && noPlano(sx, sy)) || (() => { const c = pontoCentral(); return [c.x, c.y]; })();
    const x0 = Math.min(...area.map((f) => f.x)), x1 = Math.max(...area.map((f) => f.x + f.w));
    const y0 = Math.min(...area.map((f) => f.y)), y1 = Math.max(...area.map((f) => f.y + f.h));
    let dx = Math.round(p[0] - (x0 + x1) / 2), dy = Math.round(p[1] - (y0 + y1) / 2);
    if (opcoes.encaixeGrade) {
      const passo = G.TILE / 2;
      dx = Math.round((x0 + dx) / passo) * passo - x0;
      dy = Math.round((y0 + dy) / passo) * passo - y0;
    }
    registrar();
    inserirCopias(area, dx, dy);
    mudou();
  }
  function duplicar() {
    if (!selecionada) return;
    registrar();
    inserirCopias(selecao(), G.TILE / 2, G.TILE / 2);
    mudou();
  }
  function excluir() {
    if (!selecionada) return;
    registrar();
    const sai = selecao();
    formas = formas.filter((f) => !sai.includes(f));
    selecionar(null);
    mudou();
  }
  // Centra a vista na cena (ou na origem, se vazia), sem mudar giro nem zoom.
  function recentralizar() {
    const r = tamanho();
    let cx = 0, cy = 0;
    if (formas.length) {
      const pts = formas.flatMap((f) => G.silhueta(f, cam));
      cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
      cy = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
    }
    vista.ox = Math.round(r.width / 2 - cx * vista.zoom);
    vista.oy = Math.round(r.height / 2 - cy * vista.zoom);
    desenhar();
  }

  // Gira a seleção 90°, 180° ou 270° no eixo escolhido na barra.
  function rotacionarSelecao(graus) {
    const lista = selecao();
    if (!lista.length) return;
    registrar();
    const novas = G.rotacionarGrupo(lista, opcoes.eixoGiro, graus);
    lista.forEach((f, i) => {
      for (const k of Object.keys(f)) if (!(k in novas[i]) || novas[i][k] === undefined) delete f[k];
      for (const [k, v] of Object.entries(novas[i])) if (v !== undefined) f[k] = v;
    });
    vertSel = null;
    mudou();
  }

  // Eixo de giro (barra do topo).
  // ---------- vértice sob o mouse e arraste de vértice ----------
  // O vértice sob o mouse fica destacado. Um duplo clique (botão esquerdo) num vértice o prende ao
  // cursor: ele anda no plano horizontal (com Shift, sobe e desce) e encaixa em vértices de qualquer
  // forma, mesmo em outra altura; um clique solta, Esc cancela. A forma vira uma malha 3D.
  let verticeSobMouse = null;
  let ultimoClique = null; // { t, forma, i } do último clique esquerdo num vértice

  function desenharVerticeAtivo() {
    let p = null, cheio = false;
    if (arraste && arraste.tipo === 'vertice') { p = arraste.atual; cheio = true; }
    else if (!arraste && verticeSobMouse && formas.includes(verticeSobMouse.forma)) p = G.vertices(verticeSobMouse.forma)[verticeSobMouse.i];
    if (!p) return;
    const [x, y] = tela(p.x, p.y, p.z);
    ctx.beginPath();
    ctx.arc(x, y, cheio ? 6 : 5, 0, Math.PI * 2);
    ctx.fillStyle = cheio ? COR.destaque : 'rgba(255,255,255,0.25)';
    ctx.fill();
    ctx.strokeStyle = COR.destaque;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function iniciarArrasteVertice(v, sx, sy) {
    const f = v.forma;
    if (f.lados === 0 && !f.pontos && !f.malha) { avisar('Os vértices do círculo ainda não podem ser arrastados.'); return; }
    if (f.furos && f.furos.length) { avisar('Os vértices de formas com vão ainda não podem ser arrastados.'); return; }
    registrar();
    if (!marcadas.includes(f)) selecionar(f);
    vertSel = null;
    const p = G.vertices(f)[v.i];
    arraste = { tipo: 'vertice', forma: f, i: v.i, original: JSON.parse(JSON.stringify(f)), ini: p, atual: p, sx, sy, solto: false };
    canvas.style.cursor = 'move';
    mudou();
  }

  function trocarForma(f, g) {
    for (const k of Object.keys(f)) if (!(k in g) || g[k] === undefined) delete f[k];
    for (const [k, v] of Object.entries(g)) if (v !== undefined) f[k] = v;
  }

  function moverVerticeArrastado(ev, sx, sy) {
    const A = arraste;
    const dsx = sx - A.sx, dsy = sy - A.sy;
    let alvo;
    if (ev.shiftKey) {
      const [zx, zy] = direcaoZ();
      const l2 = zx * zx + zy * zy;
      const dz = l2 > 0.04 ? (dsx * zx + dsy * zy) / l2 / vista.zoom : -dsy / vista.zoom;
      alvo = { x: A.ini.x, y: A.ini.y, z: Math.max(0, Math.round(A.ini.z + dz)) };
    } else {
      const [dx, dy] = deltaChao(dsx, dsy);
      alvo = { x: Math.round(A.ini.x + dx), y: Math.round(A.ini.y + dy), z: A.ini.z };
    }
    // Encaixe em qualquer vértice (de outras formas ou da mesma), pela distância na tela.
    let enc = null;
    if (opcoes.encaixeVertices) {
      const [ax, ay] = tela(alvo.x, alvo.y, alvo.z);
      let melhor = null;
      for (const g of visiveis()) {
        G.vertices(g === A.forma ? A.original : g).forEach((p, j) => {
          if (g === A.forma && j === A.i) return;
          const [x, y] = tela(p.x, p.y, p.z);
          const d = Math.hypot(x - ax, y - ay);
          if (d > LIMITE_ENCAIXE) return;
          const prof = cam.d[0] * p.x + cam.d[1] * p.y + cam.d[2] * p.z;
          if (!melhor || d < melhor.d - 1 || (Math.abs(d - melhor.d) <= 1 && prof > melhor.prof)) melhor = { d, prof, p };
        });
      }
      if (melhor) enc = { ...melhor.p };
    }
    if (!enc && opcoes.encaixeGrade && !ev.shiftKey) {
      const T = G.TILE, meio = T / 2, lim = LIMITE_ENCAIXE / vista.zoom;
      const perto = (val, d) => Math.round((val - d) / T) * T + d;
      const gx = perto(alvo.x, 0), gy = perto(alvo.y, 0);
      let melhor = null;
      for (const [x, y] of [[gx, gy], [perto(alvo.x, meio), gy], [gx, perto(alvo.y, meio)]]) {
        const d = Math.hypot(x - alvo.x, y - alvo.y);
        if (d <= lim && (!melhor || d < melhor.d)) melhor = { d, x, y };
      }
      if (melhor) { alvo.x = melhor.x; alvo.y = melhor.y; }
    }
    if (enc) alvo = enc;
    const g = G.moverVertice(A.original, A.i, alvo);
    if (g) trocarForma(A.forma, g);
    A.atual = alvo;
    A.encaixe = enc ? { destino: enc, alvo: true } : null;
    atualizarPainel();
  }

  function cancelarArrasteVertice() {
    trocarForma(arraste.forma, arraste.original);
    historico.pop();
    arraste = null;
    mudou();
  }

  // ---------- cor e filtro por cor ----------
  // A ferramenta de cor (barra ou "Definir cor…" no menu) pinta as formas marcadas com qualquer cor
  // hexadecimal; o filtro esconde e mostra as formas por cor (escondidas não aparecem, não
  // recebem clique e não servem de encaixe).
  const coresOcultas = new Set(); // cores em minúsculas; 'padrao' é a forma sem cor
  const chaveCor = (f) => (f.cor || 'padrao').toLowerCase();
  const oculta = (f) => coresOcultas.has(chaveCor(f));
  function visiveis() { return coresOcultas.size ? formas.filter((f) => !oculta(f)) : formas; }

  const popCor = $('pop-cor'), popFiltro = $('pop-filtro');
  let desfazerCor = false; // registrou o desfazer nesta abertura da paleta

  // Abre um popover embaixo do botão da barra, ou no ponto clicado.
  function abrirPopover(pop, ancora) {
    const base = canvas.parentElement.getBoundingClientRect();
    pop.hidden = false;
    let x, y;
    if (ancora instanceof Element) {
      const r = ancora.getBoundingClientRect();
      x = r.left - base.left; y = r.bottom - base.top + 6;
    } else { [x, y] = ancora; }
    pop.style.left = Math.max(8, Math.min(x, base.width - pop.offsetWidth - 8)) + 'px';
    pop.style.top = Math.max(8, Math.min(y, base.height - pop.offsetHeight - 8)) + 'px';
  }
  function fecharPopovers() { popCor.hidden = true; popFiltro.hidden = true; }

  const corDaSelecao = () => {
    const cores = [...new Set(marcadas.map((f) => (f.cor || COR_PADRAO).toLowerCase()))];
    return cores.length === 1 ? cores[0] : null;
  };
  function atualizarAmostra() {
    const c = corDaSelecao();
    $('amostra-cor').style.background = c || 'linear-gradient(135deg, #e5534b, #57ab5a 50%, #539bf5)';
  }

  function abrirPopCor(ancora) {
    fecharPopovers();
    desfazerCor = false;
    const n = marcadas.length;
    $('cor-alvo').textContent = n ? (n === 1 ? '1 forma' : `${n} formas`) : 'selecione formas para colorir';
    const c = corDaSelecao() || COR_PADRAO;
    $('cor-seletor').value = c;
    $('cor-hex').value = c;
    // Cores já usadas na cena, para repetir com um clique.
    const usadas = [...new Set(formas.map((f) => f.cor).filter(Boolean).map((x) => x.toLowerCase()))];
    $('cores-cena').replaceChildren(...usadas.map((cor) => {
      const b = document.createElement('button');
      b.className = 'amostra-botao';
      b.style.background = cor;
      b.title = cor;
      b.addEventListener('click', () => { $('cor-seletor').value = cor; $('cor-hex').value = cor; aplicarCor(cor); });
      return b;
    }));
    $('cores-cena-titulo').hidden = !usadas.length;
    abrirPopover(popCor, ancora);
  }

  // Pinta só as formas marcadas (as clicadas, em azul), não o grupo inteiro.
  function aplicarCor(cor) {
    const lista = marcadas;
    if (!lista.length) return;
    if (!desfazerCor) { registrar(); desfazerCor = true; }
    for (const f of lista) { if (cor) f.cor = cor.toLowerCase(); else delete f.cor; }
    mudou();
  }
  const hexValido = (t) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t.trim());
    if (!m) return null;
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return '#' + h.toLowerCase();
  };
  $('cor-seletor').addEventListener('input', () => { $('cor-hex').value = $('cor-seletor').value; aplicarCor($('cor-seletor').value); });
  const aplicarHex = () => {
    const h = hexValido($('cor-hex').value);
    $('cor-hex').classList.toggle('invalido', !h);
    if (h) { $('cor-seletor').value = h; aplicarCor(h); }
  };
  $('cor-hex').addEventListener('change', aplicarHex);
  $('cor-hex').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); aplicarHex(); } });
  $('cor-padrao').addEventListener('click', () => { $('cor-seletor').value = COR_PADRAO; $('cor-hex').value = COR_PADRAO; aplicarCor(null); });
  $('ferramenta-cor').addEventListener('click', () => (popCor.hidden ? abrirPopCor($('ferramenta-cor')) : fecharPopovers()));

  function abrirPopFiltro() {
    fecharPopovers();
    const contagem = new Map();
    for (const f of formas) contagem.set(chaveCor(f), (contagem.get(chaveCor(f)) || 0) + 1);
    for (const c of coresOcultas) if (!contagem.has(c)) coresOcultas.delete(c);
    const lista = $('lista-filtro');
    lista.replaceChildren(...(contagem.size ? [...contagem].map(([cor, n]) => {
      const linha = document.createElement('label');
      linha.className = 'linha-filtro';
      const caixa = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !coresOcultas.has(cor) });
      caixa.addEventListener('change', () => {
        if (caixa.checked) coresOcultas.delete(cor); else coresOcultas.add(cor);
        filtroMudou();
      });
      const amostra = document.createElement('span');
      amostra.className = 'amostra';
      amostra.style.background = cor === 'padrao' ? COR_PADRAO : cor;
      const nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = cor === 'padrao' ? 'Sem cor' : cor;
      const qt = Object.assign(document.createElement('span'), { className: 'qt', textContent: String(n) });
      linha.append(caixa, amostra, nome, qt);
      return linha;
    }) : [Object.assign(document.createElement('p'), { className: 'vazio', textContent: 'Nenhuma forma na cena.' })]));
    abrirPopover(popFiltro, $('ferramenta-filtro'));
  }
  function filtroMudou() {
    // Formas escondidas saem da seleção.
    if (marcadas.some(oculta)) marcar(marcadas.filter((f) => !oculta(f)), desacoplada);
    $('ferramenta-filtro').setAttribute('aria-pressed', String(coresOcultas.size > 0));
    mudou();
  }
  $('ferramenta-filtro').addEventListener('click', () => (popFiltro.hidden ? abrirPopFiltro() : fecharPopovers()));
  $('filtro-todas').addEventListener('click', () => { coresOcultas.clear(); filtroMudou(); abrirPopFiltro(); });

  window.addEventListener('pointerdown', (ev) => {
    const dentroDe = (el) => el.contains(ev.target);
    if (!popCor.hidden && !dentroDe(popCor) && !dentroDe($('ferramenta-cor'))) popCor.hidden = true;
    if (!popFiltro.hidden && !dentroDe(popFiltro) && !dentroDe($('ferramenta-filtro'))) popFiltro.hidden = true;
  }, true);

  // ---------- régua ----------
  // Com a régua ligada, clicar em dois vértices mostra a distância entre eles (em 3D) e as
  // diferenças em X, Y e Z. A medida acompanha as formas se elas mudarem; um terceiro clique
  // começa outra.
  const regua = { ativa: false, a: null, b: null }; // a, b: { forma, i } (vértice i de G.vertices)
  function ligarRegua(ativa) {
    regua.ativa = ativa;
    regua.a = regua.b = null;
    $('ferramenta-regua').setAttribute('aria-pressed', String(ativa));
    canvas.classList.toggle('medindo', ativa);
    desenhar();
  }
  $('ferramenta-regua').addEventListener('click', () => ligarRegua(!regua.ativa));

  const pontoDe = (v) => (v && formas.includes(v.forma) ? G.vertices(v.forma)[v.i] || null : null);
  const numero = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

  function desenharRegua() {
    if (!regua.ativa) return;
    const pa = pontoDe(regua.a);
    if (regua.a && !pa) regua.a = regua.b = null;
    let pb = pontoDe(regua.b);
    // Prévia: do primeiro vértice até o vértice sob o cursor (ou o próprio cursor).
    let previa = null;
    if (pa && !pb && cursor) {
      const v = verticeEm(cursor[0], cursor[1]);
      pb = v ? pontoDe(v) : null;
      if (!pb) previa = cursor;
    }
    const marcar = (x, y, cheio) => {
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = cheio ? COR.regua : '#000'; ctx.fill();
      ctx.strokeStyle = COR.regua; ctx.lineWidth = 2; ctx.stroke();
    };
    // Vértice sob o cursor, antes do primeiro clique.
    if (!pa && cursor) {
      const v = verticeEm(cursor[0], cursor[1]);
      const p = v && pontoDe(v);
      if (p) marcar(...tela(p.x, p.y, p.z), false);
      return;
    }
    if (!pa) return;
    const [ax, ay] = tela(pa.x, pa.y, pa.z);
    if (!pb && !previa) { marcar(ax, ay, true); return; } // cursor fora do visualizador
    const [bx, by] = pb ? tela(pb.x, pb.y, pb.z) : previa;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = COR.regua;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.setLineDash([]);
    marcar(ax, ay, true);
    if (pb) marcar(bx, by, !!regua.b);
    if (pb) {
      const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z;
      const d = Math.hypot(dx, dy, dz);
      const linha1 = `${numero(d)} px` + (d >= G.TILE / 4 ? ` · ${numero(d / G.TILE)} tile` : '');
      const linha2 = `ΔX ${numero(Math.abs(dx))}  ΔY ${numero(Math.abs(dy))}  ΔZ ${numero(Math.abs(dz))}`;
      ctx.font = '600 13px system-ui, sans-serif';
      const w1 = ctx.measureText(linha1).width;
      ctx.font = '11px ui-monospace, monospace';
      const w2 = ctx.measureText(linha2).width;
      const w = Math.max(w1, w2) + 16, h = 38;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const x = mx - w / 2, y = my - h - 10;
      ctx.fillStyle = 'rgba(15,15,15,0.92)';
      ctx.strokeStyle = COR.regua;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(linha1, mx, y + 16);
      ctx.fillStyle = '#bbb';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillText(linha2, mx, y + 31);
    }
    ctx.restore();
  }

  function escolherEixoGiro(eixo) {
    opcoes.eixoGiro = eixo;
    for (const e of ['x', 'y', 'z']) $('giro-' + e).setAttribute('aria-pressed', String(e === eixo));
    salvarOpcoes();
  }
  for (const e of ['x', 'y', 'z']) $('giro-' + e).addEventListener('click', () => escolherEixoGiro(e));

  // Funde as marcadas numa forma só; os grupos delas viram um.
  function mesclarMarcadas() {
    const m = G.mesclarVarias(marcadas);
    if (!m) return;
    registrar();
    const grupo = marcadas[0].grupo;
    const grupos = new Set(marcadas.map((f) => f.grupo));
    for (const f of formas) if (grupos.has(f.grupo)) f.grupo = grupo;
    formas = formas.filter((f) => !marcadas.includes(f));
    const nova = { ...m, id: novoId(), grupo };
    formas.push(nova);
    selecionar(nova);
    mudou();
  }

  // ---------- biblioteca ----------
  const CHAVE_BIBLIOTECA = 'esquadro-biblioteca';
  let biblioteca = [];
  try { biblioteca = JSON.parse(localStorage.getItem(CHAVE_BIBLIOTECA) || '[]'); } catch (e) { biblioteca = []; }
  // Num servidor com a rota abaixo (um aplicativo que hospede o editor), a biblioteca fica numa
  // pasta, um arquivo por peça; fora dele, só no navegador, com exportar e importar.
  const ROTA_PASTA = '/__estudio/blocos/biblioteca';
  let naPasta = false;
  let gravando = null;
  function gravarNaPasta() {
    clearTimeout(gravando);
    gravando = setTimeout(async () => {
      try {
        const r = await fetch(ROTA_PASTA, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(biblioteca) });
        if (!r.ok) throw new Error(r.status);
        const salvos = await r.json(); // devolve o nome do arquivo de cada peça
        salvos.forEach((s2, i) => { if (biblioteca[i]) { biblioteca[i].arquivo = s2.arquivo; biblioteca[i].criada = s2.criada; } });
        localStorage.setItem(CHAVE_BIBLIOTECA, JSON.stringify(biblioteca));
        mostrarOrigem();
      } catch (e) {
        mostrarOrigem('Não foi possível gravar na pasta; ficou salvo só neste navegador.');
      }
    }, 150);
  }
  async function carregarDaPasta() {
    if (!/^https?:$/.test(location.protocol)) return mostrarOrigem();
    try {
      const r = await fetch(ROTA_PASTA, { cache: 'no-store' });
      if (!r.ok) throw new Error(r.status);
      const daPasta = await r.json();
      naPasta = true;
      // Primeira vez no servidor: a pasta vazia recebe o que já estava no navegador.
      if (!daPasta.length && biblioteca.length) gravarNaPasta();
      else biblioteca = daPasta;
      desenharBiblioteca();
    } catch (e) { /* fora do servidor */ }
    mostrarOrigem();
  }
  function mostrarOrigem(aviso) {
    const el = $('origem-biblioteca');
    el.textContent = aviso || (naPasta ? 'Salva em blocos/biblioteca' : 'Salva neste navegador');
    el.title = naPasta ? 'Um arquivo .json por peça em blocos/biblioteca' : 'Use Exportar para guardar em arquivo';
    el.classList.toggle('aviso', !!aviso);
  }

  function exportarBiblioteca() {
    const itens = biblioteca.map(({ arquivo, ...item }) => item);
    const blob = new Blob([JSON.stringify({ formato: 'esquadro-biblioteca', versao: 1, itens }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'biblioteca-blocos.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // Importa somando à biblioteca; nomes repetidos ganham um número.
  async function importarBiblioteca(arq) {
    try {
      const dados = JSON.parse(await arq.text());
      const itens = Array.isArray(dados) ? dados : dados.itens;
      if (!Array.isArray(itens)) throw new Error('não é uma biblioteca do Esquadro');
      const nomes = new Set(biblioteca.map((i) => i.nome));
      let n = 0;
      for (const item of itens) {
        if (!item || typeof item.nome !== 'string' || !Array.isArray(item.formas)) continue;
        let nome = item.nome;
        for (let k = 2; nomes.has(nome); k++) nome = `${item.nome} (${k})`;
        nomes.add(nome);
        biblioteca.push({ nome, criada: Date.now() + n, formas: item.formas });
        n++;
      }
      salvarBiblioteca();
      desenharBiblioteca();
    } catch (e) { alert('Arquivo inválido: ' + e.message); }
  }
  // Enter na caixinha salva (o primeiro botão do formulário é o Cancelar).
  $('nome-salvo').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); $('dialogo-salvar').close('salvar'); }
  });
  $('exportar-biblioteca').addEventListener('click', exportarBiblioteca);
  $('importar-biblioteca').addEventListener('click', () => $('arquivo-biblioteca').click());
  $('arquivo-biblioteca').addEventListener('change', async () => {
    const arq = $('arquivo-biblioteca').files[0];
    if (arq) await importarBiblioteca(arq);
    $('arquivo-biblioteca').value = '';
  });

  function salvarBiblioteca() {
    try { localStorage.setItem(CHAVE_BIBLIOTECA, JSON.stringify(biblioteca)); } catch (e) { /* sem armazenamento */ }
    if (naPasta) gravarNaPasta();
  }

  // Pede o nome numa caixinha e guarda a seleção com origem no canto mínimo.
  // Caixinha de nome: devolve o nome digitado, ou null se cancelar.
  function pedirNome(titulo, sugestao) {
    const dialogo = $('dialogo-salvar'), campo = $('nome-salvo');
    $('titulo-nome').textContent = titulo;
    campo.value = sugestao;
    return new Promise((resolve) => {
      dialogo.onclose = () => resolve(dialogo.returnValue === 'salvar' && campo.value.trim() ? campo.value.trim() : null);
      dialogo.returnValue = '';
      dialogo.showModal();
      campo.select();
    });
  }

  async function salvarNaBiblioteca() {
    const lista = selecao();
    if (!lista.length) return;
    const nome = await pedirNome('Salvar na biblioteca', `Forma ${biblioteca.length + 1}`);
    if (!nome) return;
    const x0 = Math.min(...lista.map((f) => f.x)), y0 = Math.min(...lista.map((f) => f.y));
    const z0 = Math.min(...lista.map((f) => f.z));
    biblioteca.push({ nome, criada: Date.now(), formas: lista.map((f) => ({ ...f, x: f.x - x0, y: f.y - y0, z: f.z - z0 })) });
    salvarBiblioteca();
    desenharBiblioteca();
  }

  // Coloca uma cópia no centro da vista (alinhada à grade, se ligada).
  function colocarDaBiblioteca(item, ponto = null) {
    const c = ponto || pontoCentral();
    const vs = item.formas.flatMap(f => G.vertices(f));
    const x0 = Math.min(...vs.map(v => v.x)), x1 = Math.max(...vs.map(v => v.x));
    const y0 = Math.min(...vs.map(v => v.y)), y1 = Math.max(...vs.map(v => v.y));
    let dx = Math.round(c.x - (x0 + x1) / 2), dy = Math.round(c.y - (y0 + y1) / 2);
    if (opcoes.encaixeGrade && !ponto) { dx = Math.round(dx / G.TILE) * G.TILE; dy = Math.round(dy / G.TILE) * G.TILE; }
    registrar();
    inserirCopias(item.formas, dx, dy);
    mudou();
  }

  // Miniatura na oblíqua do jogo.
  function miniatura(item) {
    const tam = 32, dpr = window.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width = c.height = tam * dpr;
    c.className = 'miniatura';
    const g = c.getContext('2d');
    const todas = item.formas.flatMap((f) => G.faces(f, G.OBLIQUA).flat());
    const xs = todas.map((p) => p[0]), ys = todas.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const esc = (tam - 4) / Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1);
    const ox = (tam - (Math.max(...xs) - x0) * esc) / 2, oy = (tam - (Math.max(...ys) - y0) * esc) / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineWidth = 1;
    g.lineJoin = 'round';
    for (const f of G.ordemDesenho(item.formas, G.OBLIQUA)) {
      for (const face of G.facesVisiveis(f, G.OBLIQUA)) {
        g.beginPath();
        for (const laco of [face.pts, ...(face.furos || [])]) {
          laco.forEach((q, i) => {
            const p = G.projetar(q, G.OBLIQUA);
            const px = ox + (p.x - x0) * esc, py = oy + (p.y - y0) * esc;
            i ? g.lineTo(px, py) : g.moveTo(px, py);
          });
          g.closePath();
        }
        g.fillStyle = tom(face.n, f.cor);
        g.fill('evenodd');
        g.strokeStyle = COR.aresta;
        g.stroke();
      }
    }
    return c;
  }

  function desenharBiblioteca() {
    const lista = $('biblioteca');
    if (!biblioteca.length) {
      const p = document.createElement('p');
      p.className = 'vazio';
      p.textContent = 'Vazia. Para salvar, clique com o botão direito numa forma.';
      lista.replaceChildren(p);
      $('contador-biblioteca').textContent = '';
      return;
    }
    $('contador-biblioteca').textContent = String(biblioteca.length);
    lista.replaceChildren(...biblioteca.map((item, i) => {
      const linha = document.createElement('div');
      linha.className = 'item';
      const usar = document.createElement('button');
      usar.className = 'usar';
      const vertices = item.formas.flatMap(f => G.vertices(f));
      const dimensoes = ['x', 'y', 'z'].map(eixo => arred(Math.max(...vertices.map(v => v[eixo])) - Math.min(...vertices.map(v => v[eixo]))));
      const descricao = `${item.nome}\nX: ${dimensoes[0]} px · Y: ${dimensoes[1]} px · Z: ${dimensoes[2]} px`;
      usar.setAttribute('aria-label', descricao);
      usar.addEventListener('mouseenter', () => mostrarDica(usar, descricao));
      usar.addEventListener('mouseleave', esconderDica);
      usar.addEventListener('focus', () => mostrarDica(usar, descricao));
      usar.addEventListener('blur', esconderDica);
      fonteArrastavel(usar, () => ({ item }));
      const nome = document.createElement('span');
      nome.textContent = item.nome;
      usar.append(miniatura(item), nome);
      usar.addEventListener('click', () => colocarDaBiblioteca(item));
      const tirar = document.createElement('button');
      tirar.className = 'tirar';
      tirar.title = 'Remover da biblioteca';
      tirar.textContent = '×';
      tirar.addEventListener('click', () => {
        if (!confirm(`Remover "${item.nome}" da biblioteca?`)) return;
        biblioteca.splice(i, 1);
        salvarBiblioteca();
        desenharBiblioteca();
      });
      linha.append(usar, tirar);
      return linha;
    }));
  }

  $('separar').addEventListener('click', separar);
  $('duplicar').addEventListener('click', duplicar);
  $('excluir').addEventListener('click', excluir);

  $('vista-jogo').addEventListener('click', () => mudarVista('obliqua'));
  $('vista-topo').addEventListener('click', () => mudarVista('orbita', 0, 90));
  $('vista-iso').addEventListener('click', () => mudarVista('orbita', 45, ISO));

  const chaves = { travarAngulos: 'op-angulos', encaixeVertices: 'op-vertices', encaixeGrade: 'op-grade', mostrarGrade: 'op-mostrar-grade' };
  for (const [k, id] of Object.entries(chaves)) {
    $(id).addEventListener('change', () => { opcoes[k] = $(id).checked; salvarOpcoes(); desenhar(); });
  }

  // ---------- salvar e carregar cenas ----------
  // Num servidor com a rota abaixo, as cenas ficam numa pasta, uma por arquivo.
  // No navegador, num arquivo escolhido pelo usuário: com o seletor de arquivos do navegador,
  // Ctrl+S grava de novo no mesmo arquivo; sem ele, baixa uma cópia.
  const ROTA_CENAS = '/__estudio/blocos/cenas';
  const CHAVE_CENA = 'esquadro-cena';
  let cenaAtual = null;   // { nome, arquivo? (servidor), handle? (navegador) }
  let textoSalvo = null;  // estado da última vez que salvou ou carregou
  try {
    const c = JSON.parse(localStorage.getItem(CHAVE_CENA) || 'null');
    if (c) { cenaAtual = { nome: c.nome, arquivo: c.arquivo }; textoSalvo = c.texto; }
  } catch (e) { /* sem cena */ }

  const slugCena = (nome) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'cena';
  const conteudoCena = () => JSON.stringify({ formato: 'esquadro', versao: 1, nome: cenaAtual && cenaAtual.nome, proximoId, formas }, null, 2);
  const temMudancas = () => (textoSalvo === null ? formas.length > 0 : estadoTexto() !== textoSalvo);

  function lembrarCena() {
    try {
      localStorage.setItem(CHAVE_CENA, JSON.stringify(cenaAtual ? { nome: cenaAtual.nome, arquivo: cenaAtual.arquivo, texto: textoSalvo } : null));
    } catch (e) { /* idem */ }
  }
  function mostrarCena() {
    const nome = cenaAtual ? cenaAtual.nome : 'Sem título';
    const sujo = temMudancas();
    $('nome-cena').textContent = nome;
    $('nome-cena').title = sujo ? 'Há mudanças não salvas (Ctrl+S salva)' : (naPasta && cenaAtual ? `Salva em blocos/cenas/${cenaAtual.arquivo}` : 'Salva');
    $('cena-suja').hidden = !sujo;
    document.title = `${sujo ? '• ' : ''}${nome} · Esquadro`;
  }

  let avisoTempo = null;
  function avisar(texto) {
    const el = $('aviso');
    el.textContent = texto;
    el.hidden = false;
    clearTimeout(avisoTempo);
    avisoTempo = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function marcarSalva() {
    textoSalvo = estadoTexto();
    lembrarCena();
    mostrarCena();
  }

  async function salvarCena(comoNova = false) {
    if ($('dialogo-salvar').open || $('dialogo-cenas').open) return;
    try {
      if (naPasta) {
        if (!cenaAtual || !cenaAtual.arquivo || comoNova) {
          const nome = await pedirNome('Salvar cena', (cenaAtual && cenaAtual.nome) || 'Cena 1');
          if (!nome) return;
          const arquivo = slugCena(nome) + '.json';
          const existentes = await (await fetch(ROTA_CENAS, { cache: 'no-store' })).json();
          const outra = existentes.find((c) => c.arquivo === arquivo);
          if (outra && !(cenaAtual && cenaAtual.arquivo === arquivo) && !confirm(`Já existe a cena "${outra.nome}". Substituir?`)) return;
          cenaAtual = { nome, arquivo };
        }
        const r = await fetch(`${ROTA_CENAS}/${cenaAtual.arquivo}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: conteudoCena() });
        if (!r.ok) throw new Error((await r.json()).erro || r.status);
        marcarSalva();
        avisar(`Cena salva em blocos/cenas/${cenaAtual.arquivo}`);
      } else if (window.showSaveFilePicker) {
        if (!cenaAtual || !cenaAtual.handle || comoNova) {
          const handle = await window.showSaveFilePicker({
            suggestedName: slugCena((cenaAtual && cenaAtual.nome) || 'cena') + '.json',
            types: [{ description: 'Cena do Esquadro', accept: { 'application/json': ['.json'] } }],
          });
          cenaAtual = { nome: handle.name.replace(/\.json$/i, ''), handle };
        }
        const w = await cenaAtual.handle.createWritable();
        await w.write(conteudoCena());
        await w.close();
        marcarSalva();
        avisar(`Cena salva em ${cenaAtual.handle.name}`);
      } else {
        const nome = (cenaAtual && cenaAtual.nome) || await pedirNome('Salvar cena', 'Cena 1');
        if (!nome) return;
        cenaAtual = { nome };
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([conteudoCena()], { type: 'application/json' }));
        a.download = slugCena(nome) + '.json';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        marcarSalva();
        avisar('Cena baixada como ' + a.download);
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // fechou o seletor de arquivos
      alert('Não foi possível salvar: ' + (e && e.message ? e.message : e));
    }
  }

  function abrirTextoDeCena(texto, cena) {
    if (temMudancas() && !confirm('A cena atual tem mudanças não salvas. Descartar e abrir outra?')) return;
    registrar(); // Ctrl+Z volta para a cena anterior
    carregarTexto(texto);
    cenaAtual = cena;
    textoSalvo = estadoTexto();
    lembrarCena();
    recentralizar();
    mudou();
    avisar(`Cena "${cena.nome}" carregada`);
  }

  async function abrirArquivoDoComputador() {
    try {
      if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: 'Cena do Esquadro', accept: { 'application/json': ['.json'] } }] });
        const texto = await (await handle.getFile()).text();
        JSON.parse(texto);
        abrirTextoDeCena(texto, naPasta ? { nome: handle.name.replace(/\.json$/i, '') } : { nome: handle.name.replace(/\.json$/i, ''), handle });
      } else {
        $('arquivo').click();
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      alert('Arquivo inválido: ' + e.message);
    }
  }
  $('arquivo').addEventListener('change', async () => {
    const arq = $('arquivo').files[0];
    if (!arq) return;
    try { const texto = await arq.text(); JSON.parse(texto); abrirTextoDeCena(texto, { nome: arq.name.replace(/\.json$/i, '') }); }
    catch (e) { alert('Arquivo inválido: ' + e.message); }
    $('arquivo').value = '';
  });

  // Carregar: no servidor, a lista de blocos/cenas; no navegador, o seletor de arquivos.
  async function carregarCena() {
    if ($('dialogo-salvar').open || $('dialogo-cenas').open) return;
    if (!naPasta) return abrirArquivoDoComputador();
    let cenas = [];
    try { cenas = await (await fetch(ROTA_CENAS, { cache: 'no-store' })).json(); } catch (e) { /* lista vazia */ }
    const lista = $('lista-cenas');
    const data = (ms) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    lista.replaceChildren(...(cenas.length ? cenas.map((c) => {
      const b = document.createElement('button');
      b.className = 'cena';
      b.innerHTML = '<span class="nome"></span><span class="quando"></span>';
      b.querySelector('.nome').textContent = c.nome;
      b.querySelector('.quando').textContent = data(c.alterada);
      if (cenaAtual && cenaAtual.arquivo === c.arquivo) b.classList.add('atual');
      b.addEventListener('click', async () => {
        $('dialogo-cenas').close();
        try {
          const texto = await (await fetch(`${ROTA_CENAS}/${c.arquivo}`, { cache: 'no-store' })).text();
          abrirTextoDeCena(texto, { nome: c.nome, arquivo: c.arquivo });
        } catch (e) { alert('Não foi possível abrir: ' + e.message); }
      });
      return b;
    }) : [Object.assign(document.createElement('p'), { className: 'vazio', textContent: 'Nenhuma cena salva ainda em blocos/cenas.' })]));
    $('dialogo-cenas').showModal();
  }
  $('abrir-do-computador').addEventListener('click', () => { $('dialogo-cenas').close(); abrirArquivoDoComputador(); });

  $('salvar-cena').addEventListener('click', () => salvarCena());
  $('carregar-cena').addEventListener('click', carregarCena);
  $('limpar').addEventListener('click', () => {
    if (!formas.length && !cenaAtual) return;
    if (temMudancas() && formas.length && !confirm('Começar uma cena nova? As mudanças não salvas ficam só no Ctrl+Z.')) return;
    registrar();
    formas = [];
    selecionar(null);
    cenaAtual = null;
    textoSalvo = null;
    lembrarCena();
    mudou();
  });

  // Ctrl+S salva (Ctrl+Shift+S salva como), Ctrl+O carrega, em qualquer lugar da página.
  window.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
    const k = ev.key.toLowerCase();
    if (k === 's') { ev.preventDefault(); salvarCena(ev.shiftKey); }
    else if (k === 'o') { ev.preventDefault(); carregarCena(); }
  }, true);

  // ---------- mouse ----------
  function pos(ev) {
    const r = tamanho();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  function formaEm(sx, sy) {
    const ordem = G.ordemDesenho(visiveis(), cam);
    const p = paraProj(sx, sy);
    for (let i = ordem.length - 1; i >= 0; i--) if (G.dentroForma(p, ordem[i], cam)) return ordem[i];
    return null;
  }

  function alcaEm(sx, sy) {
    return alcas().find((a) => Math.abs(a.x - sx) <= ALCA + 3 && Math.abs(a.y - sy) <= ALCA + 3) || null;
  }

  // ---------- personagens de referência (opcional) ----------
  // Sprites de personagens, só para comparar proporções; só aparecem se a página carregar uma
  // biblioteca de sprites (window.MOONVEIL_BIBLIOTECA). Ficam
  // fora do encaixe, dos grupos, do desfazer, da exportação e da biblioteca.
  const BIB = window.MOONVEIL_BIBLIOTECA; // biblioteca de sprites, opcional
  const DIRECOES = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE']; // giro horário na tela
  const NOMES_DIRECAO = ['de frente (S)', 'sudoeste', 'oeste', 'noroeste', 'de costas (N)', 'nordeste', 'leste', 'sudeste'];
  const ALTURA_PERSONAGEM = 80; // só para a ordem de desenho
  const CHAVE_REFS = 'esquadro-referencias';
  let refs = [];          // { id, conjunto, dir (0–7, no mundo), x, y } — pés no chão
  let refMarcada = null;
  try { refs = JSON.parse(localStorage.getItem(CHAVE_REFS) || '[]'); } catch (e) { refs = []; }
  const salvarRefs = () => { try { localStorage.setItem(CHAVE_REFS, JSON.stringify(refs)); } catch (e) { /* idem */ } };
  const conjuntos = BIB
    ? [...new Set(Object.keys(BIB.sprites).filter((k) => k.startsWith('personagem/')).map((k) => k.split('/')[1]))]
    : [];
  const nomeConjunto = (c) => (BIB.sprites[`personagem/${c}/S`] || { meta: { nome: c } }).meta.nome.split(' · ')[0];

  // A direção é guardada no mundo; ao girar a câmera, troca-se o sprite para
  // que o personagem continue virado para o mesmo lado do mapa.
  function spriteDaRef(r) {
    const giro = camera.modo === 'obliqua' ? 0 : camera.giro;
    const i = (((r.dir + Math.round(giro / 45)) % 8) + 8) % 8;
    return BIB && BIB.sprites[`personagem/${r.conjunto}/${DIRECOES[i]}`];
  }

  // Recorte dos pixels visíveis do sprite (a célula costuma ter muita
  // margem transparente), para a seleção e o contorno. Sem acesso aos pixels
  // (página aberta do disco), usa a célula inteira.
  function recorte(img) {
    if (img.recorte !== undefined) return img.recorte;
    img.recorte = null;
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (d[(y * c.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
      if (x1 >= 0) img.recorte = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    } catch (e) { /* canvas contaminado */ }
    return img.recorte;
  }

  const imagens = new Map();
  function imagem(src) {
    if (!imagens.has(src)) {
      const img = new Image();
      img.onload = () => desenhar();
      img.src = '../' + src; // caminhos relativos à pasta acima do editor
      imagens.set(src, img);
    }
    return imagens.get(src);
  }

  // Retângulo do sprite na tela. O sprite fica de pé, de frente para a câmera;
  // a altura acompanha a escala vertical da câmera para Z (1 na oblíqua,
  // cos da inclinação nas outras), como as paredes, e some na vista de topo.
  function telaRef(r) {
    const s = spriteDaRef(r);
    if (!s) return null;
    const [fx, fy] = tela(r.x, r.y, 0);
    const k = Math.max(0, -cam.ay[2]);
    const meio = BIB.tile / 2; // px/py da biblioteca vêm somados de meio tile (âncora do editor antigo)
    const z = vista.zoom;
    const t = { s, k, fx, fy, x: fx - (s.px - meio) * z, y: fy - (s.py - meio) * z * k, w: s.w * z, h: s.h * z * k };
    const img = imagem(s.src);
    const rc = img.complete && img.naturalWidth ? recorte(img) : null;
    t.vis = rc ? { x: t.x + rc.x * z, y: t.y + rc.y * z * k, w: rc.w * z, h: rc.h * z * k } : t;
    return t;
  }

  const caixaRef = (r) => ({ x: r.x - 16, y: r.y - 16, w: 32, h: 32, z: 0, espessura: ALTURA_PERSONAGEM, ref: r });

  function desenharRef(r) {
    const t = telaRef(r);
    if (!t) return;
    if (t.k > 0.12) {
      const img = imagem(t.s.src);
      if (img.complete && img.naturalWidth) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, t.x, t.y, t.w, t.h);
      }
    }
    // Marca dos pés: sempre visível, inclusive de topo.
    ctx.beginPath();
    for (let a = 0; a <= 32; a++) {
      const [x, y] = tela(r.x + 12 * Math.cos((a / 32) * Math.PI * 2), r.y + 12 * Math.sin((a / 32) * Math.PI * 2), 0);
      a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = r === refMarcada ? COR.destaque : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (r === refMarcada) {
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(t.vis.x - 2.5, t.vis.y - 2.5, t.vis.w + 5, Math.max(t.vis.h, 1) + 5);
      ctx.setLineDash([]);
    }
  }

  function refEm(sx, sy) {
    for (let i = refs.length - 1; i >= 0; i--) {
      const t = telaRef(refs[i]);
      if (!t) continue;
      const pe = Math.hypot(sx - t.fx, sy - t.fy) <= 12 * vista.zoom;
      const v = t.vis;
      if (pe || (t.k > 0.12 && sx >= v.x && sx <= v.x + v.w && sy >= v.y && sy <= v.y + v.h)) return refs[i];
    }
    return null;
  }

  // Pés no meio da célula, como no jogo, se o encaixe na grade estiver ligado.
  function centroCelula(x, y, sempre = false) {
    if (!opcoes.encaixeGrade) return [x, y];
    const T = G.TILE;
    const cx = Math.floor(x / T) * T + T / 2, cy = Math.floor(y / T) * T + T / 2;
    return sempre || Math.hypot(cx - x, cy - y) <= LIMITE_ENCAIXE / vista.zoom ? [cx, cy] : [x, y];
  }

  function inserirRef() {
    if (!BIB) return;
    const c = pontoCentral();
    const [x, y] = centroCelula(Math.round(c.x), Math.round(c.y), true);
    const r = { id: Date.now(), conjunto: $('ref-conjunto').value, dir: dirEscolhida, x, y };
    refs.push(r);
    refMarcada = r;
    selecionar(null);
    salvarRefs();
    mudou();
  }
  function removerRef(r) {
    refs = refs.filter((q) => q !== r);
    if (refMarcada === r) refMarcada = null;
    salvarRefs();
    desenhar();
  }
  function girarRef(r, passo) {
    r.dir = (((r.dir + passo) % 8) + 8) % 8;
    salvarRefs();
    desenhar();
  }

  let dirEscolhida = 0;
  function escolherDirecao(i) {
    dirEscolhida = i;
    [...$('ref-dir').querySelectorAll('button')].forEach((b) => {
      const marcado = b.title === NOMES_DIRECAO[i];
      b.setAttribute('aria-pressed', String(marcado));
      b.setAttribute('aria-checked', String(marcado));
    });
    $('ref-dir-nome').textContent = 'Virado para ' + NOMES_DIRECAO[i];
  }

  function montarPainelRefs() {
    if (!BIB || !conjuntos.length) {
      $('refs').replaceChildren(Object.assign(document.createElement('p'), {
        className: 'vazio',
        textContent: 'Biblioteca de sprites não encontrada.',
      }));
      return;
    }
    $('ref-conjunto').replaceChildren(...conjuntos.map((c) => new Option(nomeConjunto(c), c)));
    // Rosa dos ventos: as 8 direções na posição em que aparecem no mapa.
    const posicoes = { N: 1, NE: 2, E: 5, SE: 8, S: 7, SW: 6, W: 3, NW: 0 };
    const setas = { N: '↑', NE: '↗', E: '→', SE: '↘', S: '↓', SW: '↙', W: '←', NW: '↖' };
    const celulas = Array.from({ length: 9 }, () => null);
    DIRECOES.forEach((d, i) => {
      const b = document.createElement('button');
      b.textContent = setas[d];
      b.title = NOMES_DIRECAO[i];
      b.setAttribute('role', 'radio');
      b.addEventListener('click', () => escolherDirecao(i));
      celulas[posicoes[d]] = b;
    });
    celulas[4] = Object.assign(document.createElement('span'), { className: 'centro', textContent: 'olha' });
    $('ref-dir').replaceChildren(...celulas);
    escolherDirecao(0);
    $('ref-inserir').addEventListener('click', inserirRef);
    $('ref-limpar').addEventListener('click', () => { refs = []; refMarcada = null; salvarRefs(); desenhar(); });
  }

  // ---------- menu do botão direito ----------
  const menu = $('menu');
  function fecharMenu() { menu.hidden = true; }
  function abrirMenu(sx, sy) {
    const ref = refEm(sx, sy);
    const f = ref ? null : formaEm(sx, sy);
    let itens;
    if (ref) {
      refMarcada = ref;
      itens = [
        ['Girar para a esquerda', () => girarRef(ref, -1)],
        ['Girar para a direita', () => girarRef(ref, 1)],
        ['Remover referência', () => removerRef(ref)],
      ];
      desenhar();
    } else if (f) {
      if (!marcadas.includes(f)) selecionar(f);
      const emGrupo = marcadas.some((m) => grupoDe(m).length > 1);
      itens = [
        ['Copiar', copiar],
        ['Duplicar', duplicar],
        ['Selecionar desacoplado', () => { marcar(marcadas, true); mudou(); }, !emGrupo || desacoplada],
        ['Salvar na biblioteca…', salvarNaBiblioteca],
      ];
      // Mesclar só aparece com duas ou mais formas marcadas e conectadas.
      // Mesclar aparece com duas ou mais formas marcadas; se não der, fica apagado com o motivo.
      if (marcadas.length > 1) {
        if (G.mesclarVarias(marcadas)) itens.push(['Mesclar', mesclarMarcadas]);
        else itens.push(['Mesclar', null, true], ['dica', 'Para mesclar, as formas precisam se encostar por uma face inteira, sem entrar uma na outra: os mesmos cantos no mesmo lugar, ou a mesma medida na direção em que se juntam (por exemplo, a mesma profundidade).']);
      }
      // Recortar só aparece com 3+ vértices marcados que formam uma área dentro da forma.
      const base = baseMarcada();
      if (base.length >= 3 && G.recortar(vertSel.forma, base)) itens.push(['Recortar área', recortarArea]);
      const eixo = opcoes.eixoGiro.toUpperCase();
      itens.push(['Rotacionar', null, false, [90, 180, 270].map((g) => [`${g}°`, () => rotacionarSelecao(g)]), `Eixo ${eixo}`]);
      itens.push(['Definir cor…', () => abrirPopCor([sx, sy])]);
      itens.push(['Excluir', excluir]);
      mudou();
    } else {
      itens = [['Colar', () => colar(sx, sy), !area], ['Recentralizar', recentralizar]];
    }
    const botao = ([nome, acao, desligado]) => {
      const b = document.createElement('button');
      b.textContent = nome;
      b.disabled = !!desligado;
      b.addEventListener('click', () => { fecharMenu(); acao(); });
      return b;
    };
    // Item com submenu: abre ao passar o mouse ou ao clicar.
    const comFilhos = ([nome, , , filhos, titulo]) => {
      const grupo = document.createElement('div');
      grupo.className = 'grupo-sub';
      const b = document.createElement('button');
      b.className = 'abre-sub';
      b.innerHTML = `<span>${nome}</span><span class="seta">›</span>`;
      b.addEventListener('click', () => grupo.classList.toggle('aberto'));
      const sub = document.createElement('div');
      sub.className = 'submenu';
      if (titulo) sub.append(Object.assign(document.createElement('div'), { className: 'titulo-sub', textContent: titulo }));
      sub.append(...filhos.map(botao));
      grupo.append(b, sub);
      return grupo;
    };
    const dica = ([, texto]) => Object.assign(document.createElement('div'), { className: 'dica-menu', textContent: texto });
    menu.replaceChildren(...itens.map((it) => (it[0] === 'dica' ? dica(it) : it[3] ? comFilhos(it) : botao(it))));
    menu.hidden = false;
    const r = tamanho();
    const x = Math.min(sx, r.width - menu.offsetWidth - 4);
    menu.style.left = x + 'px';
    menu.style.top = Math.min(sy, r.height - menu.offsetHeight - 4) + 'px';
    menu.classList.toggle('sub-esquerda', x + menu.offsetWidth * 2 > r.width); // submenu cabe à esquerda
  }
  window.addEventListener('pointerdown', (ev) => { if (!menu.contains(ev.target)) fecharMenu(); }, true);
  window.addEventListener('blur', fecharMenu);

  canvas.addEventListener('pointerdown', (ev) => {
    const [sx, sy] = pos(ev);
    if (arraste && arraste.tipo === 'vertice') { // um clique solta o vértice arrastado
      arraste = null;
      return mudou();
    }
    try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ponteiro sintético */ }
    if (ev.button === 1) {
      // Botão da roda: girar a vista. Saindo da oblíqua, parte da isométrica,
      // que mostra as mesmas faces (topo, sul e leste).
      ev.preventDefault();
      if (camera.modo === 'obliqua') mudarVista('orbita', 45, ISO);
      pivo = pontoCentral();
      arraste = { tipo: 'girar', sx, sy, giro: camera.giro, inclinacao: camera.inclinacao };
      return;
    }
    if (ev.button === 2) {
      // Botão direito: clique abre o menu; arrastar move a vista.
      arraste = { tipo: 'vista', sx, sy, ox: vista.ox, oy: vista.oy, menu: true };
      return;
    }
    // Régua: cliques em vértices marcam as pontas; no fundo, arrastar move a vista.
    if (regua.ativa) {
      const v = verticeEm(sx, sy);
      if (v) {
        if (!regua.a || regua.b) { regua.a = v; regua.b = null; } else { regua.b = v; }
        return desenhar();
      }
      arraste = { tipo: 'vista', sx, sy, ox: vista.ox, oy: vista.oy };
      return;
    }
    // Duplo clique num vértice: arrastar o vértice.
    if (!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
      const v = verticeEm(sx, sy);
      const agora = performance.now();
      if (v && ultimoClique && agora - ultimoClique.t < 450 && ultimoClique.forma === v.forma && ultimoClique.i === v.i) {
        ultimoClique = null;
        return iniciarArrasteVertice(v, sx, sy);
      }
      ultimoClique = v ? { t: agora, forma: v.forma, i: v.i } : null;
    }
    // Shift+clique num vértice: marca ou desmarca (para recortar).
    const vert = ev.shiftKey ? verticeEm(sx, sy) : null;
    if (vert) {
      alternarVertice(vert);
      return mudou();
    }
    const alca = alcaEm(sx, sy);
    if (alca) {
      registrar();
      arraste = { tipo: alca.tipo === 'z' ? 'espessura' : 'esticar', alca: alca.tipo, sx, sy, f: selecionada, ini: { ...selecionada } };
      return;
    }
    const r = refEm(sx, sy);
    refMarcada = r;
    if (r) {
      selecionar(null);
      arraste = { tipo: 'ref', r, sx, sy, ini: [r.x, r.y] };
      return mudou();
    }
    const f = formaEm(sx, sy);
    if (f && (ev.ctrlKey || ev.metaKey)) {
      alternar(f);
    } else if (f) {
      registrar();
      // Clicar numa forma já marcada mantém a marcação (para arrastar todas);
      // sem arrastar, fica só ela.
      const reduzir = marcadas.includes(f) && marcadas.length > 1 ? f : null;
      if (!marcadas.includes(f)) selecionar(f);
      const grupo = selecao();
      arraste = { tipo: 'mover', sx, sy, grupo, ini: grupo.map((g) => ({ x: g.x, y: g.y, z: g.z })), mexeu: false, reduzir };
    } else {
      if (!(ev.ctrlKey || ev.metaKey)) selecionar(null);
      arraste = { tipo: 'vista', sx, sy, ox: vista.ox, oy: vista.oy };
    }
    mudou();
  });
  canvas.addEventListener('mousedown', (ev) => { if (ev.button === 1) ev.preventDefault(); });

  canvas.addEventListener('pointermove', (ev) => {
    const [sx, sy] = pos(ev);
    cursor = [sx, sy];
    if (arraste && arraste.tipo === 'vertice') {
      moverVerticeArrastado(ev, sx, sy);
      return desenhar();
    }
    if (!arraste) {
      verticeSobMouse = verticeEm(sx, sy);
      const a = alcaEm(sx, sy);
      canvas.style.cursor = regua.ativa ? 'crosshair' : a ? (a.tipo === 'z' ? 'ns-resize' : 'crosshair') : formaEm(sx, sy) ? 'move' : 'default';
      return desenhar();
    }
    const dsx = sx - arraste.sx, dsy = sy - arraste.sy;
    const limite = LIMITE_ENCAIXE / vista.zoom;
    if (arraste.tipo === 'vista') {
      if (arraste.menu && Math.hypot(dsx, dsy) < 4) return; // ainda é um clique
      arraste.menu = false;
      vista.ox = arraste.ox + dsx;
      vista.oy = arraste.oy + dsy;
    } else if (arraste.tipo === 'girar') {
      const giro = travar(arraste.giro - dsx * GRAUS_POR_PX);
      camera.giro = ((giro % 360) + 360) % 360;
      camera.inclinacao = travar(Math.max(-90, Math.min(90, arraste.inclinacao + dsy * GRAUS_POR_PX)));
    } else if (arraste.tipo === 'mover') {
      const [dx, dy] = deltaChao(dsx, dsy);
      const mx = Math.round(dx), my = Math.round(dy);
      if ((mx || my) && !arraste.mexeu) { arraste.mexeu = true; desacoplar(); }
      arraste.grupo.forEach((g, i) => { g.x = arraste.ini[i].x + mx; g.y = arraste.ini[i].y + my; g.z = arraste.ini[i].z; });
      let e = null;
      if (arraste.mexeu && opcoes.encaixeVertices) {
        const fixas = visiveis().filter((g) => !arraste.grupo.includes(g));
        e = G.buscarEncaixe(arraste.grupo, fixas, limite, ev.shiftKey, cam);
      }
      if (!e && arraste.mexeu && opcoes.encaixeGrade) e = G.encaixeGrade(arraste.grupo, limite, cam);
      if (e) for (const g of arraste.grupo) { g.x += e.dx; g.y += e.dy; g.z += e.dz; }
      arraste.encaixe = e;
      atualizarPainel();
    } else if (arraste.tipo === 'esticar') {
      const f = arraste.f, ini = arraste.ini, a = arraste.alca;
      const [dx, dy] = deltaChao(dsx, dsy);
      const mx = Math.round(dx), my = Math.round(dy);
      if (a.includes('e')) f.w = Math.max(1, alinhar(ini.x + ini.w + mx) - ini.x);
      if (a.includes('w')) { const x0 = Math.min(alinhar(ini.x + mx), ini.x + ini.w - 1); f.x = x0; f.w = ini.x + ini.w - x0; }
      if (a.includes('s')) f.h = Math.max(1, alinhar(ini.y + ini.h + my) - ini.y);
      if (a.includes('n')) { const y0 = Math.min(alinhar(ini.y + my), ini.y + ini.h - 1); f.y = y0; f.h = ini.y + ini.h - y0; }
      atualizarPainel();
    } else if (arraste.tipo === 'ref') {
      const [dx, dy] = deltaChao(dsx, dsy);
      [arraste.r.x, arraste.r.y] = centroCelula(Math.round(arraste.ini[0] + dx), Math.round(arraste.ini[1] + dy));
    } else if (arraste.tipo === 'espessura') {
      // A espessura cresce na direção em que +Z aparece na tela.
      const [zx, zy] = direcaoZ();
      const l2 = zx * zx + zy * zy;
      const dz = l2 > 0.04 ? (dsx * zx + dsy * zy) / l2 / vista.zoom : -dsy / vista.zoom;
      const f = arraste.f;
      f.espessura = Math.max(0, alinhar(f.z + Math.round(arraste.ini.espessura + dz)) - f.z);
      atualizarPainel();
    }
    desenhar();
  });

  function soltar() {
    if (!arraste) return;
    if (arraste.tipo === 'vertice') return; // o vértice fica preso ao cursor até o próximo clique
    if (arraste.tipo === 'mover') {
      if (arraste.encaixe && arraste.encaixe.alvo) {
        for (const g of new Set(arraste.grupo.map((h) => h.grupo))) unir(arraste.encaixe.alvo.grupo, g);
      }
      if (!arraste.mexeu) {
        historico.pop();
        if (arraste.reduzir) selecionar(arraste.reduzir, desacoplada);
      }
    }
    if (arraste.tipo === 'girar') salvarOpcoes();
    if (arraste.tipo === 'ref') salvarRefs();
    const menuEm = arraste.menu ? [arraste.sx, arraste.sy] : null;
    arraste = null;
    mudou();
    if (menuEm) abrirMenu(...menuEm);
  }
  canvas.addEventListener('pointerup', soltar);
  canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('pointerleave', () => { cursor = null; verticeSobMouse = null; desenhar(); });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    fecharMenu();
    if (arraste && arraste.tipo === 'girar') return;
    const [sx, sy] = pos(ev);
    const i = ZOOMS.indexOf(vista.zoom);
    const novo = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + (ev.deltaY < 0 ? 1 : -1)))];
    if (novo === vista.zoom) return;
    const [px, py] = paraProj(sx, sy);
    vista.zoom = novo;
    vista.ox = sx - px * novo;
    vista.oy = sy - py * novo;
    desenhar();
  }, { passive: false });

  // ---------- teclado ----------
  const teclasVista = new Set();
  let quadroVista = null, tempoVista = 0;
  const editandoTexto = el => el instanceof Element && (el.matches('input, textarea, select') || el.isContentEditable);
  function pararTeclasVista() {
    teclasVista.clear();
    if (quadroVista !== null) cancelAnimationFrame(quadroVista);
    quadroVista = null;
  }
  function moverVistaTeclado(agora) {
    if (!teclasVista.size || editandoTexto(document.activeElement) || document.querySelector('dialog[open]')) return pararTeclasVista();
    const dt = Math.min((agora - tempoVista) / 1000, 0.05);
    tempoVista = agora;
    if (!arraste && !transicao) {
      let dx = Number(teclasVista.has('a')) - Number(teclasVista.has('d'));
      let dy = Number(teclasVista.has('w')) - Number(teclasVista.has('s'));
      const n = Math.hypot(dx, dy) || 1;
      vista.ox += dx / n * 480 * dt;
      vista.oy += dy / n * 480 * dt;
      pivo = null;
      desenhar();
    }
    quadroVista = requestAnimationFrame(moverVistaTeclado);
  }
  window.addEventListener('keyup', ev => {
    teclasVista.delete(ev.key.toLowerCase());
    if (!teclasVista.size) pararTeclasVista();
  });
  window.addEventListener('blur', pararTeclasVista);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pararTeclasVista(); });
  document.addEventListener('focusin', ev => { if (editandoTexto(ev.target)) pararTeclasVista(); });
  window.addEventListener('keydown', (ev) => {
    if (editandoTexto(ev.target) || document.querySelector('dialog[open]')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) pararTeclasVista();
    if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && ['w', 'a', 's', 'd'].includes(ev.key.toLowerCase())) {
      ev.preventDefault();
      teclasVista.add(ev.key.toLowerCase());
      if (quadroVista === null) { tempoVista = performance.now(); quadroVista = requestAnimationFrame(moverVistaTeclado); }
      return;
    }
    const passo = ev.shiftKey ? 8 : 1;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); return desfazer(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'd') { ev.preventDefault(); return duplicar(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'c') { ev.preventDefault(); return copiar(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'v') { ev.preventDefault(); return cursor ? colar(...cursor) : colar(); }
    if (ev.key === '?') { ev.preventDefault(); return abrirAjuda(); }
    if (!ev.ctrlKey && !ev.metaKey && ev.key.toLowerCase() === 'r' && selecionada) { ev.preventDefault(); return rotacionarSelecao(ev.shiftKey ? 270 : 90); }
    if (!ev.ctrlKey && !ev.metaKey && ev.key.toLowerCase() === 'm') { ev.preventDefault(); return ligarRegua(!regua.ativa); }
    if (ev.key === 'Escape' && (!popCor.hidden || !popFiltro.hidden)) return fecharPopovers();
    if (ev.key === 'Escape' && arraste && arraste.tipo === 'vertice') return cancelarArrasteVertice();
    if (ev.key === 'Escape' && regua.ativa) { if (regua.a) { regua.a = regua.b = null; return desenhar(); } return ligarRegua(false); }
    if (ev.key === 'Escape') { if (!$('menu').hidden) return fecharMenu(); if (vertSel) { vertSel = null; return desenhar(); } selecionar(null); return mudou(); }
    if (refMarcada && (ev.key === 'Delete' || ev.key === 'Backspace')) { ev.preventDefault(); return removerRef(refMarcada); }
    if (!selecionada) return;
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); return excluir(); }
    const mov = { ArrowLeft: [-passo, 0, 0], ArrowRight: [passo, 0, 0], ArrowUp: [0, -passo, 0], ArrowDown: [0, passo, 0],
      PageUp: [0, 0, passo], PageDown: [0, 0, -passo] }[ev.key];
    if (mov) { ev.preventDefault(); registrar(); moverSelecao(...mov); mudou(); }
  });

  window.addEventListener('resize', desenhar);

  // Largura do painel esquerdo: arrastar a borda; duplo clique volta ao padrão.
  const LARGURA_PADRAO = 264;
  function largura(px) {
    const w = Math.round(Math.max(220, Math.min(560, px)));
    document.documentElement.style.setProperty('--largura-painel', w + 'px');
    try { localStorage.setItem('esquadro-largura', String(w)); } catch (e) { /* idem */ }
    desenhar();
  }
  try { const w = +localStorage.getItem('esquadro-largura'); if (w) largura(w); } catch (e) { /* padrão */ }
  const borda = $('borda-painel');
  borda.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    borda.setPointerCapture(ev.pointerId);
    borda.classList.add('arrastando');
    const mover = (e) => largura(e.clientX);
    const parar = () => { borda.classList.remove('arrastando'); borda.removeEventListener('pointermove', mover); borda.removeEventListener('pointerup', parar); };
    borda.addEventListener('pointermove', mover);
    borda.addEventListener('pointerup', parar);
  });
  borda.addEventListener('dblclick', () => largura(LARGURA_PADRAO));
  borda.addEventListener('keydown', (ev) => {
    const atual = $('painel').getBoundingClientRect().width;
    if (ev.key === 'ArrowLeft') largura(atual - 16);
    if (ev.key === 'ArrowRight') largura(atual + 16);
  });

  // ---------- início ----------
  function iniciar() {
    try {
      const salvas = JSON.parse(localStorage.getItem(CHAVE_OPCOES) || 'null');
      if (salvas) { Object.assign(opcoes, salvas.opcoes); Object.assign(camera, salvas.camera); }
    } catch (e) { /* padrões */ }
    for (const [k, id] of Object.entries(chaves)) $(id).checked = opcoes[k];
    escolherEixoGiro(['x', 'y', 'z'].includes(opcoes.eixoGiro) ? opcoes.eixoGiro : 'z');
    cam = camAlvo();
    const r = tamanho();
    vista.ox = Math.round(r.width / 2);
    vista.oy = Math.round(r.height / 2);
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) carregarTexto(salvo);
    } catch (e) { formas = []; }
    if (formas.length) {
      // Abre centrado na cena salva.
      const pts = formas.flatMap((f) => G.silhueta(f, cam));
      const cx = (Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2;
      const cy = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
      vista.ox = Math.round(r.width / 2 - cx * vista.zoom);
      vista.oy = Math.round(r.height / 2 - cy * vista.zoom);
    }
    mudou();
  }
  desenharBiblioteca();
  void carregarDaPasta().then(() => mostrarCena());
  montarPainelRefs();
  window.Blocos = { get refs() { return refs; }, telaRef, get formas() { return formas; }, get selecao() { return selecao(); }, get marcadas() { return marcadas; }, get biblioteca() { return biblioteca; }, vista, camera, opcoes, tela, desenhar, mudarVista };
  iniciar();
})();
