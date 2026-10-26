// Geometria dos Blocos: formas regulares, prismas, vértices, câmeras (oblíqua
// do jogo e ortográfica giratória), encaixe por vértice e na grade, e ordem de
// desenho. Sem dependências; roda no navegador
// (global `Geometria`) e no Node (`require`), para os testes.
(function (raiz) {
  'use strict';

  const LADO = 32;           // px por lado de todo polígono novo
  const DIAMETRO = 32;       // px de diâmetro do círculo novo
  const SEGMENTOS_CIRCULO = 64;
  const MIN_LADOS = 3;
  const MAX_LADOS = 48;
  const EPS = 1e-6;
  // Arredonda ruído de ponto flutuante (vértices exatos para o encaixe).
  const limpa = (v) => Math.round(v * 1e6) / 1e6;

  const TILE = 64;           // px por tile da grade do chão

  // ---------- câmeras ----------
  // Uma câmera é uma projeção paralela: tela = (ax·p, ay·p), em px, com y para
  // baixo; `d` aponta da cena para o observador (decide faces e profundidade).
  // Mundo: X para leste, Y para sul, Z para cima.
  const unit = (v) => { const n = Math.hypot(...v) || 1; return v.map((c) => c / n); };
  const dot = (a, p) => a[0] * p.x + a[1] * p.y + a[2] * p.z;

  // Projeção oblíqua de jogo em grade: X=(1,0), Y=(0,1), Z=(-1,-1) em px de tela.
  const OBLIQUA = { ax: [1, 0, -1], ay: [0, 1, -1], d: unit([1, 1, 1]) };

  // Câmera ortográfica orbitando: `giro` em torno de Z (0 = olhando do sul) e
  // `inclinacao` acima do chão (90 = vista de topo, como a planta), em graus.
  function cameraOrbita(giro, inclinacao) {
    const t = (giro * Math.PI) / 180, f = (inclinacao * Math.PI) / 180;
    const st = Math.sin(t), ct = Math.cos(t), sf = Math.sin(f), cf = Math.cos(f);
    return {
      ax: [ct, -st, 0],
      ay: [sf * st, sf * ct, -cf],
      d: [cf * st, cf * ct, sf],
    };
  }

  function misturarCameras(a, b, t) {
    const mix = (u, v) => u.map((c, i) => c + (v[i] - c) * t);
    return { ax: mix(a.ax, b.ax), ay: mix(a.ay, b.ay), d: unit(mix(a.d, b.d)) };
  }

  function projetar(p, cam = OBLIQUA) {
    return { x: dot(cam.ax, p), y: dot(cam.ay, p) };
  }

  // Molde de um polígono regular com 32 px de lado e aresta inferior
  // horizontal, normalizado para a caixa [0,1]², com o tamanho natural.
  const moldes = new Map();
  function molde(lados) {
    if (lados === 0) return { u: null, w: DIAMETRO, h: DIAMETRO };
    if (moldes.has(lados)) return moldes.get(lados);
    const r = LADO / (2 * Math.sin(Math.PI / lados));
    const a0 = Math.PI / 2 + Math.PI / lados;
    const pts = [];
    for (let k = 0; k < lados; k++) {
      const a = a0 + (2 * Math.PI * k) / lados;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
    const m = { u: pts.map(([x, y]) => [(x - x0) / w, (y - y0) / h]), w, h };
    moldes.set(lados, m);
    return m;
  }

  // lados = 0 é o círculo. (x, y, z) é o canto mínimo da caixa da forma.
  function criarForma(lados, x, y, id, grupo) {
    if (lados !== 0) {
      lados = Math.round(lados);
      if (!(lados >= MIN_LADOS && lados <= MAX_LADOS)) throw new Error('lados fora de ' + MIN_LADOS + '–' + MAX_LADOS);
    }
    const m = molde(lados);
    return { id, grupo, lados, x, y, z: 0, w: limpa(m.w), h: limpa(m.h), espessura: 0 };
  }

  // Contorno da base, em coordenadas de mundo (z da forma). Formas mescladas
  // guardam o próprio contorno em `pontos`, normalizado para a caixa [0,1]².
  // ---------- prisma em qualquer eixo ----------
  // Toda forma é um prisma: uma seção (o contorno) estendida ao longo de um
  // eixo do mundo, `eixo` ('z' por padrão, deitada no chão; 'x' ou 'y' depois
  // de girada). x, y, z, w, h e espessura são sempre a caixa da forma no mundo
  // (tamanhos em X, Y e Z); o contorno fica normalizado em [0,1]² na seção.
  const eixoDe = (f) => f.eixo || 'z';
  const comprimento = (f) => ({ x: f.w, y: f.h, z: f.espessura })[eixoDe(f)];

  function contornoUV(f) {
    if (f.pontos) return f.pontos;
    if (f.lados === 0) {
      const pts = [];
      for (let k = 0; k < SEGMENTOS_CIRCULO; k++) {
        const a = (2 * Math.PI * k) / SEGMENTOS_CIRCULO;
        pts.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
      }
      return pts;
    }
    return molde(f.lados).u;
  }

  // O círculo não tem cantos; seus vértices são os quatro extremos, que
  // acompanham o esticamento.
  const verticesUV = (f) => (f.lados === 0 && !f.pontos ? [[1, 0.5], [0.5, 1], [0, 0.5], [0.5, 0]] : contornoUV(f));

  // Ponto (u, v) da seção na tampa t (0 = início do eixo, 1 = fim), no mundo.
  function noMundo(f, u, v, t) {
    switch (eixoDe(f)) {
      case 'x': return { x: limpa(f.x + t * f.w), y: limpa(f.y + u * f.h), z: limpa(f.z + v * f.espessura) };
      case 'y': return { x: limpa(f.x + u * f.w), y: limpa(f.y + t * f.h), z: limpa(f.z + v * f.espessura) };
      default: return { x: limpa(f.x + u * f.w), y: limpa(f.y + v * f.h), z: limpa(f.z + t * f.espessura) };
    }
  }

  // Tampas, eixo e normais externas das laterais, em 3D.
  function prisma(f) {
    const uv = contornoUV(f);
    const a = uv.map(([u, v]) => noMundo(f, u, v, 0));
    const b = uv.map(([u, v]) => noMundo(f, u, v, 1));
    const e = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[eixoDe(f)];
    // Plano da seção em coordenadas do mundo, para achar as normais.
    const plano = { x: (p) => [p.y, p.z], y: (p) => [p.x, p.z], z: (p) => [p.x, p.y] }[eixoDe(f)];
    const subir = { x: ([m, n]) => [0, m, n], y: ([m, n]) => [m, 0, n], z: ([m, n]) => [m, n, 0] }[eixoDe(f)];
    const p2 = a.map(plano);
    const sinal = area(p2);
    const normais = p2.map((_, i) => subir(normalExterna(p2, i, sinal)));
    // Vãos (furos na seção): as paredes de dentro olham para o meio do vão.
    const furos = furosUV(f).map((laco) => {
      const fa = laco.map(([u, v]) => noMundo(f, u, v, 0));
      const fb = laco.map(([u, v]) => noMundo(f, u, v, 1));
      const q2 = fa.map(plano), sq = area(q2);
      return { a: fa, b: fb, normais: q2.map((_, i) => subir(normalExterna(q2, i, sq)).map((c) => -c)) };
    });
    return { a, b, e, normais, furos, comprimento: comprimento(f), circulo: f.lados === 0 && !f.pontos };
  }

  // Vãos da seção (como `pontos`, normalizados na caixa da seção). Só formas prismáticas.
  const furosUV = (f) => (!f.malha && f.furos) || [];

  // Contorno no chão (XY), para as formas deitadas (eixo z): mesclar e recortar.
  function contorno(f) {
    return contornoUV(f).map(([u, v]) => [limpa(f.x + u * f.w), limpa(f.y + v * f.h)]);
  }

  function verticesBase(f) {
    if (f.malha) return vertices(f).map((p) => [p.x, p.y]);
    return verticesUV(f).concat(...furosUV(f)).map(([u, v]) => [limpa(f.x + u * f.w), limpa(f.y + v * f.h)]);
  }

  // Sem espessura: só os vértices da seção. Com espessura: o dobro.
  function vertices(f) {
    if (f.malha) return f.malha.v.map((p) => noMundoMalha(f, p));
    const uv = verticesUV(f).concat(...furosUV(f)); // os cantos dos vãos também são vértices
    const out = uv.map(([u, v]) => noMundo(f, u, v, 0));
    if (comprimento(f) > 0) for (const [u, v] of uv) out.push(noMundo(f, u, v, 1));
    return out;
  }

  function caixa(f) {
    return { x0: f.x, x1: f.x + f.w, y0: f.y, y1: f.y + f.h, z0: f.z, z1: f.z + f.espessura };
  }

  // Procura o par de vértices (um das formas móveis, outro das fixas) mais
  // próximo na tela. `limite` é em px de mundo projetado. Devolve o deslocamento
  // 3D que leva o vértice móvel ao fixo, ou null. Nunca afunda abaixo de z = 0.
  // Sem `subir`, prefere ficar na mesma altura.
  function buscarEncaixe(moveis, fixas, limite, subir = false, cam = OBLIQUA) {
    if (!moveis.length || !fixas.length) return null;
    const zMin = Math.min(...moveis.map((f) => f.z));
    const fixos = [];
    for (const f of fixas) for (const v of vertices(f)) fixos.push({ v, p: projetar(v, cam), forma: f });
    let melhor = null;
    for (const m of moveis) {
      for (const vm of vertices(m)) {
        const pm = projetar(vm, cam);
        for (const alvo of fixos) {
          const d = Math.hypot(alvo.p.x - pm.x, alvo.p.y - pm.y);
          if (d > limite) continue;
          const dx = alvo.v.x - vm.x, dy = alvo.v.y - vm.y, dz = alvo.v.z - vm.z;
          if (zMin + dz < -EPS) continue;
          // Mais perto na tela vence; no empate, o que menos se desloca em 3D.
          // Na projeção, "em cima" e "atrás" caem no mesmo ponto: com
          // `subir`, vence o encaixe que eleva a forma.
          let nota = d + 0.01 * Math.hypot(dx, dy, dz);
          if (subir && dz > EPS) nota -= 1000;
          if (!melhor || nota < melhor.nota) {
            melhor = { nota, dx, dy, dz, origem: vm, destino: alvo.v, forma: m, alvo: alvo.forma };
          }
        }
      }
    }
    return melhor;
  }

  // Encaixe na grade do chão: leva o vértice móvel mais próximo (na tela) a um
  // vértice da grade ou ao meio de um lado de célula, na altura do próprio
  // vértice. Só desloca em X e Y.
  function encaixeGrade(moveis, limite, cam = OBLIQUA, tile = TILE) {
    const meio = tile / 2;
    const perto = (v, desloc) => Math.round((v - desloc) / tile) * tile + desloc;
    let melhor = null;
    for (const m of moveis) {
      for (const v of vertices(m)) {
        const pv = projetar(v, cam);
        const gx = perto(v.x, 0), gy = perto(v.y, 0);
        for (const [x, y] of [[gx, gy], [perto(v.x, meio), gy], [gx, perto(v.y, meio)]]) {
          const alvo = { x, y, z: v.z };
          const pa = projetar(alvo, cam);
          const d = Math.hypot(pa.x - pv.x, pa.y - pv.y);
          if (d > limite || (melhor && d >= melhor.nota)) continue;
          melhor = { nota: d, dx: x - v.x, dy: y - v.y, dz: 0, origem: v, destino: alvo, forma: m, alvo: null };
        }
      }
    }
    return melhor;
  }

  // Ordem de desenho (pintor): quando as caixas se sobrepõem na tela, vem
  // antes a que está do lado oposto ao observador num eixo que as separa.
  function ordemDesenho(formas, cam = OBLIQUA) {
    const n = formas.length;
    const cx = formas.map(caixa);
    const tela = cx.map((c) => {
      const xs = [], ys = [];
      for (const x of [c.x0, c.x1]) for (const y of [c.y0, c.y1]) for (const z of [c.z0, c.z1]) {
        const p = projetar({ x, y, z }, cam);
        xs.push(p.x); ys.push(p.y);
      }
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
    const antes = (a, b) => {
      for (const [k, lo, hi] of [[0, 'x0', 'x1'], [1, 'y0', 'y1'], [2, 'z0', 'z1']]) {
        const s = cam.d[k];
        if (Math.abs(s) < 1e-3) continue; // eixo de perfil: não decide
        if (cx[a][hi] <= cx[b][lo] + EPS) return s > 0; // a abaixo de b no eixo
        if (cx[b][hi] <= cx[a][lo] + EPS) return s < 0; // a acima de b no eixo
      }
      return null;
    };
    const prof = (i) => dot(cam.d, { x: (cx[i].x0 + cx[i].x1) / 2, y: (cx[i].y0 + cx[i].y1) / 2, z: (cx[i].z0 + cx[i].z1) / 2 });
    const chave = (i) => [prof(i), i];
    const menor = (a, b) => {
      const ka = chave(a), kb = chave(b);
      for (let k = 0; k < ka.length; k++) if (ka[k] !== kb[k]) return ka[k] < kb[k];
      return false;
    };
    const saidas = Array.from({ length: n }, () => []);
    const grau = new Array(n).fill(0);
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const ta = tela[a], tb = tela[b];
        if (ta.x1 <= tb.x0 || tb.x1 <= ta.x0 || ta.y1 <= tb.y0 || tb.y1 <= ta.y0) continue;
        let r = antes(a, b);
        if (r === null) r = menor(a, b);
        const [de, para] = r ? [a, b] : [b, a];
        saidas[de].push(para);
        grau[para]++;
      }
    }
    const feitos = new Array(n).fill(false);
    const out = [];
    while (out.length < n) {
      let escolha = -1;
      for (let i = 0; i < n; i++) if (!feitos[i] && grau[i] === 0 && (escolha < 0 || menor(i, escolha))) escolha = i;
      if (escolha < 0) { // ciclo: quebra pela chave
        for (let i = 0; i < n; i++) if (!feitos[i] && (escolha < 0 || menor(i, escolha))) escolha = i;
      }
      feitos[escolha] = true;
      out.push(formas[escolha]);
      for (const j of saidas[escolha]) grau[j]--;
    }
    return out;
  }

  // Envoltória convexa (cadeia monótona), para seleção e contorno.
  function envoltoria(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (p.length < 3) return p;
    const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const baixo = [], cima = [];
    for (const q of p) {
      while (baixo.length >= 2 && cruz(baixo[baixo.length - 2], baixo[baixo.length - 1], q) <= 0) baixo.pop();
      baixo.push(q);
    }
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      while (cima.length >= 2 && cruz(cima[cima.length - 2], cima[cima.length - 1], q) <= 0) cima.pop();
      cima.push(q);
    }
    return baixo.slice(0, -1).concat(cima.slice(0, -1));
  }

  // Silhueta projetada de uma forma (o prisma é convexo).
  function silhueta(f, cam = OBLIQUA) {
    if (f.malha) return envoltoria(vertices(f).map((q) => { const p = projetar(q, cam); return [p.x, p.y]; }));
    const { a, b } = prisma(f);
    return envoltoria(a.concat(b).map((q) => { const p = projetar(q, cam); return [p.x, p.y]; }));
  }

  function dentro(pt, poli) {
    let d = false;
    for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
      const [xi, yi] = poli[i], [xj, yj] = poli[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) d = !d;
    }
    return d;
  }

  // Área com sinal (positiva no sentido da forma regular criada aqui).
  function area(pts) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
      s += x1 * y2 - x2 * y1;
    }
    return s / 2;
  }

  // Normal externa (unitária) da aresta i de um contorno com área `sinal`.
  function normalExterna(pts, i, sinal) {
    const [px, py] = pts[i], [qx, qy] = pts[(i + 1) % pts.length];
    const len = Math.hypot(qx - px, qy - py) || 1;
    const s = sinal > 0 ? 1 : -1;
    return [(s * (qy - py)) / len, (s * -(qx - px)) / len];
  }

  // Faces projetadas de uma forma (topo, base e laterais), para seleção e
  // preenchimento; funciona também para contornos côncavos.
  // A primeira é a tampa do fim do eixo (o topo, nas formas deitadas); a segunda, a do início.
  function faces(f, cam = OBLIQUA) {
    if (f.malha) {
      const vs = vertices(f);
      return f.malha.faces.map((face) => face.map((i) => { const r = projetar(vs[i], cam); return [r.x, r.y]; }));
    }
    const { a, b, furos, comprimento: c } = prisma(f);
    const p = (q) => { const r = projetar(q, cam); return [r.x, r.y]; };
    // As tampas levam os vãos em `.furos` (o clique dentro de um vão não pega a tampa).
    const tampa = (pts, qual) => Object.assign(pts.map(p), furos.length ? { furos: furos.map((h) => h[qual].map(p)) } : {});
    const out = [tampa(b, 'b')];
    if (c > 0) {
      out.push(tampa(a, 'a'));
      for (const laco of [{ a, b }, ...furos]) {
        for (let i = 0; i < laco.a.length; i++) {
          const j = (i + 1) % laco.a.length;
          out.push([p(laco.a[i]), p(laco.a[j]), p(laco.b[j]), p(laco.b[i])]);
        }
      }
    }
    return out;
  }

  function dentroForma(pt, f, cam = OBLIQUA) {
    return faces(f, cam).some((poli) => Math.abs(area(poli)) > 1e-9 && dentro(pt, poli) && !(poli.furos || []).some((h) => dentro(pt, h)));
  }

  // ---------- mesclar ----------
  const chaveP = ([x, y]) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const iguais = (a, b) => Math.abs(a - b) < 1e-4;

  // Parte as arestas de `poli` nos vértices de `outro` que caem sobre elas.
  function arestasDivididas(poli, outro) {
    const out = [];
    for (let i = 0; i < poli.length; i++) {
      const a = poli[i], b = poli[(i + 1) % poli.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const meio = [];
      for (const q of outro) {
        const t = ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2;
        const cruz = ((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / Math.sqrt(l2);
        if (t > 1e-6 && t < 1 - 1e-6 && Math.abs(cruz) < 1e-3) meio.push([t, q]);
      }
      meio.sort((m, n) => m[0] - n[0]);
      let p = a;
      for (const [, q] of meio) { out.push([p, q]); p = q; }
      out.push([p, b]);
    }
    return out;
  }

  // União de dois contornos que se tocam por pelo menos um trecho de aresta,
  // sem se sobrepor: as arestas em comum se cancelam e os vértices alinhados
  // somem. Devolve null se não houver aresta em comum, se houver sobreposição
  // ou se o resultado não for um contorno único (sem buracos).
  function uniaoContornos(A, B) {
    const u = uniaoSecoes([A], [B]);
    return u && !u.furos.length ? u.contorno : null;
  }

  // União de duas seções, cada uma uma lista de laços [contorno, ...vãos]: as arestas em comum
  // se cancelam e o que sobra forma um contorno e, se fechar um buraco, vãos (como uma moldura
  // de janela). Devolve { contorno, furos } ou null se não houver aresta em comum, se houver
  // sobreposição ou se sobrarem duas partes separadas.
  function uniaoSecoes(LA, LB) {
    const orientar = (p, fora) => ((area(p) < 0) === fora ? p.slice().reverse() : p);
    LA = LA.map((p, i) => orientar(p, i === 0)); // contorno anti-horário, vãos horários
    LB = LB.map((p, i) => orientar(p, i === 0));
    const pa = LA.flat(), pb = LB.flat();
    const todas = LA.flatMap((p) => arestasDivididas(p, pb)).concat(LB.flatMap((p) => arestasDivididas(p, pa)));
    const chave = (p, q) => chaveP(p) + '|' + chaveP(q);
    const contagem = new Map();
    for (const [p, q] of todas) {
      const k = chave(p, q);
      if (contagem.has(k)) return null; // mesma aresta no mesmo sentido: sobreposição
      contagem.set(k, true);
    }
    const restantes = todas.filter(([p, q]) => !contagem.has(chave(q, p)));
    if (restantes.length === todas.length || !restantes.length) return null;
    const saida = new Map();
    for (const e of restantes) {
      const k = chaveP(e[0]);
      if (saida.has(k)) return null; // contornos só encostam num ponto
      saida.set(k, e);
    }
    // Junta as arestas em laços fechados.
    const usadas = new Set(), lacos = [];
    for (const ini of restantes) {
      if (usadas.has(ini)) continue;
      const pts = [];
      let e = ini;
      while (!usadas.has(e)) {
        usadas.add(e);
        pts.push(e[0]);
        e = saida.get(chaveP(e[1]));
        if (!e) return null;
      }
      if (e !== ini) return null;
      // Remove vértices alinhados (o trecho em que as formas se juntavam).
      const limpo = semAlinhados(pts);
      if (limpo.length >= 3) lacos.push(limpo);
    }
    const fora = lacos.filter((l) => area(l) > 0), dentro2 = lacos.filter((l) => area(l) < 0);
    if (fora.length !== 1) return null; // duas partes separadas
    const soma = (L) => L.reduce((s2, l) => s2 + area(l), 0);
    const total = soma(LA) + soma(LB);
    if (Math.abs(soma(lacos) - total) > 1e-3 * Math.abs(total) + 0.01) return null;
    return { contorno: fora[0], furos: dentro2 };
  }

  function semAlinhados(pts) {
    return pts.filter((q, i) => {
      const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
      const cruz = (q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0]);
      return Math.abs(cruz) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1) > 1e-3;
    });
  }

  // Forma com o contorno livre `u` (em coordenadas de mundo), herdando o resto de `f`.
  function formaDeContorno(f, u) {
    const xs = u.map((p) => p[0]), ys = u.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    const w = Math.max(...xs) - x, h = Math.max(...ys) - y;
    return { ...f, lados: u.length, regular: undefined, furos: undefined, x, y, w, h, pontos: u.map(([px, py]) => [(px - x) / w, (py - y) / h]) };
  }

  // Uma caixa (seção retangular que enche a caixa) é prisma em qualquer eixo.
  function ehCaixa(f) {
    if (f.malha || furosUV(f).length) return false;
    const uv = contornoUV(f);
    if (uv.length !== 4) return false;
    const cantos = new Set(uv.map(([u, v]) => `${Math.round(u * 1e4)},${Math.round(v * 1e4)}`));
    return ['0,0', '10000,0', '10000,10000', '0,10000'].every((c) => cantos.has(c));
  }

  // Extensão da forma ao longo do eixo e coordenadas do plano perpendicular.
  const AO_LONGO = { x: ['x', 'w'], y: ['y', 'h'], z: ['z', 'espessura'] };
  const PLANO = { x: [['y', 'h'], ['z', 'espessura']], y: [['x', 'w'], ['z', 'espessura']], z: [['x', 'w'], ['y', 'h']] };

  // Seção da forma no plano perpendicular ao eixo A (em coordenadas do mundo), como lista de
  // laços [contorno, ...vãos], ou null se ela não for um prisma ao longo de A.
  function secaoEm(f, A) {
    const [[pu, du], [pv, dv]] = PLANO[A];
    const mundo = (laco) => laco.map(([u, v]) => [limpa(f[pu] + u * f[du]), limpa(f[pv] + v * f[dv])]);
    if (eixoDe(f) === A) return [mundo(contornoUV(f)), ...furosUV(f).map(mundo)];
    if (!ehCaixa(f)) return null;
    const u0 = f[pu], u1 = f[pu] + f[du], v0 = f[pv], v1 = f[pv] + f[dv];
    return [[[u0, v0], [u1, v0], [u1, v1], [u0, v1]]];
  }

  function formaNoEixo(base, A, { contorno: secao, furos = [] }, inicio, comp) {
    const [[pu, du], [pv, dv]] = PLANO[A];
    const [pa, da] = AO_LONGO[A];
    const us = secao.map((p) => p[0]), vs = secao.map((p) => p[1]);
    const u0 = Math.min(...us), v0 = Math.min(...vs);
    const lu = Math.max(...us) - u0, lv = Math.max(...vs) - v0;
    const norm = (laco) => laco.map(([u, v]) => [(u - u0) / (lu || 1), (v - v0) / (lv || 1)]);
    return {
      ...base, eixo: A, regular: undefined, lados: secao.length,
      [pu]: u0, [du]: limpa(lu), [pv]: v0, [dv]: limpa(lv), [pa]: inicio, [da]: comp,
      pontos: norm(secao), furos: furos.length ? furos.map(norm) : undefined,
    };
  }

  // Mescla duas formas conectadas numa só, ou null se não der. Procura um eixo
  // em que as duas sejam prismas (caixas valem em qualquer eixo) e:
  // - tenham a mesma extensão nesse eixo e seções que se encostam por uma
  //   aresta, sem se sobrepor (a seção vira a união: L, U, um portal...);
  // - ou tenham a mesma seção e fiquem uma na ponta da outra (somam o comprimento).
  // Se nada disso servir (formas livres em 3D, por exemplo), tenta a mescla por face em comum.
  function mesclar(a, b) {
    if (a.malha || b.malha) return mesclarPorFace(a, b);
    const eixos = [...new Set([eixoDe(a), eixoDe(b), 'z', 'x', 'y'])];
    for (const A of eixos) {
      const sa = secaoEm(a, A), sb = secaoEm(b, A);
      if (!sa || !sb || Math.abs(area(sa[0])) < 1e-6 || Math.abs(area(sb[0])) < 1e-6) continue; // seção achatada
      const [pa, da] = AO_LONGO[A];
      const ia = a[pa], ib = b[pa], ca = a[da], cb = b[da];
      const chave = (sec) => sec.flat().map(chaveP).sort().join(' ');
      if (chave(sa) === chave(sb) && ca > 0 && cb > 0) {
        const mesma = { contorno: sa[0], furos: sa.slice(1) };
        if (iguais(ia + ca, ib)) return formaNoEixo(a, A, mesma, ia, limpa(ca + cb));
        if (iguais(ib + cb, ia)) return formaNoEixo(a, A, mesma, ib, limpa(ca + cb));
      }
      if (!iguais(ia, ib) || !iguais(ca, cb)) continue;
      const u = uniaoSecoes(sa, sb);
      if (u) return formaNoEixo(a, A, u, ia, ca);
    }
    return mesclarPorFace(a, b);
  }

  // Vão passante a partir da face de contato de outro sólido. A parede deve ser um
  // prisma no eixo normal à face (caixas valem nos três eixos). Não usa a projeção
  // da câmera: o contato e o contorno são verificados em coordenadas do mundo.
  function vazarPelaFace(molde, alvo) {
    if (molde === alvo || alvo.malha) return null;
    const m = molde.malha ? malhaMundo(molde) : malhaDoPrisma(molde);
    if (m.aberta || (!molde.malha && furosUV(molde).length)) return null;
    const tolerancia = 1e-4;
    const sobreAresta = (p, a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]) <= tolerancia;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy) <= tolerancia;
    };
    const toca = (a, b) => a.some((p, i) => b.some((q, j) =>
      sobreAresta(p, q, b[(j + 1) % b.length]) || sobreAresta(q, p, a[(i + 1) % a.length]) ||
      seCruzam(p, a[(i + 1) % a.length], q, b[(j + 1) % b.length])));
    for (const A of ['x', 'y', 'z']) {
      const sec = secaoEm(alvo, A);
      const [pa, da] = AO_LONGO[A];
      if (!sec || alvo[da] <= tolerancia) continue;
      const [[u], [v]] = PLANO[A];
      const min = Math.min(...m.v.map(p => p[pa])), max = Math.max(...m.v.map(p => p[pa]));
      // O molde fica do lado de fora; simples sobreposição na tela ou penetração não basta.
      const planos = [];
      if (iguais(max, alvo[pa]) && min < max - tolerancia) planos.push(alvo[pa]);
      if (iguais(min, alvo[pa] + alvo[da]) && max > min + tolerancia) planos.push(alvo[pa] + alvo[da]);
      for (const plano of planos) for (const face of m.faces) {
        const pontos = face.map(i => m.v[i]);
        if (!pontos.every(p => iguais(p[pa], plano))) continue;
        const corte = semAlinhados(pontos.map(p => [p[u], p[v]]));
        if (corte.length < 3 || Math.abs(area(corte)) <= tolerancia || !simples(corte)) continue;
        // Vão estritamente interno: não produz laços abertos ou interseções inválidas.
        if (!corte.every(p => dentro(p, sec[0])) || toca(corte, sec[0])) continue;
        if (sec.slice(1).some(h => toca(corte, h) || corte.some(p => dentro(p, h)) || h.some(p => dentro(p, corte)))) continue;
        return formaNoEixo(alvo, A, { contorno: sec[0], furos: [...sec.slice(1), corte] }, alvo[pa], alvo[da]);
      }
    }
    return null;
  }

  // ---------- recortar ----------
  // Índices no contorno dos vértices de base escolhidos (sem repetir), na
  // ordem do contorno. No círculo, os 4 extremos caem em pontos do contorno.
  function indicesNoContorno(f, base) {
    const c = contorno(f), vb = verticesBase(f);
    const idx = new Set();
    for (const i of base) {
      const v = vb[i];
      const k = v ? c.findIndex((p) => iguais(p[0], v[0]) && iguais(p[1], v[1])) : -1;
      if (k >= 0) idx.add(k);
    }
    return [...idx].sort((a, b) => a - b);
  }

  // Polígono da área entre os vértices escolhidos, ou null se não houver área.
  function areaRecorte(f, base) {
    if (f.malha || furosUV(f).length) return null; // formas livres 3D e com vão ainda não recortam
    if (eixoDe(f) !== 'z') return null; // só formas deitadas
    const c = contorno(f);
    const idx = indicesNoContorno(f, base);
    if (idx.length < 3) return null;
    const corte = idx.map((i) => c[i]);
    return Math.abs(area(corte)) > 1e-6 ? corte : null;
  }

  function seCruzam(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }
  function simples(pts) {
    const n = pts.length;
    for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (seCruzam(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
    return true;
  }

  // Tira da forma a área entre os vértices escolhidos (pela espessura toda).
  // O que sobra são os pedaços do contorno entre dois vértices escolhidos
  // seguidos, fechados pela corda entre eles. Devolve a lista de formas que
  // ficam (vazia se a área era a forma inteira) ou null se o recorte não
  // couber dentro da forma (corda passando por fora numa forma côncava).
  function recortar(f, base) {
    const c = contorno(f);
    const corte = areaRecorte(f, base);
    if (!corte) return null;
    const idx = indicesNoContorno(f, base);
    const pedacos = [];
    for (let k = 0; k < idx.length; k++) {
      const a = idx[k], b = idx[(k + 1) % idx.length];
      const pts = [];
      for (let i = a; ; i = (i + 1) % c.length) { pts.push(c[i]); if (i === b) break; }
      if (pts.length < 3 || Math.abs(area(pts)) < 1e-6) continue; // vizinhos: só a aresta
      if (!simples(pts)) return null;
      pedacos.push(semAlinhados(pts));
    }
    const total = Math.abs(area(c));
    const soma = pedacos.reduce((s, p) => s + Math.abs(area(p)), 0) + Math.abs(area(corte));
    if (Math.abs(soma - total) > 1e-3 * total + 0.01) return null;
    return pedacos.map((p) => formaDeContorno(f, p));
  }

  // Mescla uma lista inteira, par a par, enquanto houver par conectado.
  function mesclarVarias(lista) {
    let resto = lista.slice();
    while (resto.length > 1) {
      let feito = false;
      for (let i = 0; i < resto.length && !feito; i++) {
        for (let j = i + 1; j < resto.length && !feito; j++) {
          const m = mesclar(resto[i], resto[j]);
          if (m) { resto = resto.filter((_, k) => k !== i && k !== j).concat([m]); feito = true; }
        }
      }
      if (!feito) return null;
    }
    return resto[0] || null;
  }

  // ---------- rotacionar ----------
  // Gira um ponto k × 90° em torno do eixo, pelo centro c. No eixo Z, visto de
  // cima, o giro vai de leste para sul (sentido horário no mapa).
  function girarPonto(p, c, eixo, k) {
    let x = p.x - c.x, y = p.y - c.y, z = p.z - c.z;
    for (let i = 0; i < k; i++) {
      if (eixo === 'z') [x, y] = [-y, x];
      else if (eixo === 'x') [y, z] = [-z, y];
      else [z, x] = [-x, z];
    }
    return { x: limpa(x + c.x), y: limpa(y + c.y), z: limpa(z + c.z) };
  }

  // Forma girada 90°, 180° ou 270° em torno do eixo X, Y ou Z, pelo centro c.
  // Girar em X ou Y deita a forma de lado: o eixo da extrusão muda.
  function rotacionar(f, eixoGiro, graus, c) {
    const k = ((Math.round(graus / 90) % 4) + 4) % 4;
    if (!k) return { ...f };
    if (f.malha) {
      const m = malhaMundo(f);
      return formaDeMalha(f, { ...m, v: m.v.map((p) => girarPonto(p, c, eixoGiro, k)) });
    }
    const { a, b } = prisma(f);
    const ga = a.map((p) => girarPonto(p, c, eixoGiro, k));
    const gb = b.map((p) => girarPonto(p, c, eixoGiro, k));
    const ev = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[eixoDe(f)];
    const r = girarPonto({ x: ev[0], y: ev[1], z: ev[2] }, { x: 0, y: 0, z: 0 }, eixoGiro, k);
    const eixo = Math.abs(r.x) > 0.5 ? 'x' : Math.abs(r.y) > 0.5 ? 'y' : 'z';
    const todos = ga.concat(gb);
    const lim = (k2) => [Math.min(...todos.map((p) => p[k2])), Math.max(...todos.map((p) => p[k2]))];
    const [x0, x1] = lim('x'), [y0, y1] = lim('y'), [z0, z1] = lim('z');
    const g = { ...f, eixo, x: x0, y: y0, z: z0, w: limpa(x1 - x0), h: limpa(y1 - y0), espessura: limpa(z1 - z0) };
    if (f.lados === 0 && !f.pontos) return g; // círculo: a elipse segue a caixa
    const d = (v) => v || 1;
    const uv = {
      z: (p) => [(p.x - x0) / d(g.w), (p.y - y0) / d(g.h)],
      x: (p) => [(p.y - y0) / d(g.h), (p.z - z0) / d(g.espessura)],
      y: (p) => [(p.x - x0) / d(g.w), (p.z - z0) / d(g.espessura)],
    }[eixo];
    g.pontos = ga.map(uv);
    g.lados = ga.length;
    if (furosUV(f).length) {
      g.furos = prisma(f).furos.map((h) => h.a.map((p) => uv(girarPonto(p, c, eixoGiro, k))));
    }
    if (!f.pontos) g.regular = true; // continua sendo o mesmo polígono regular
    return g;
  }

  // Gira várias formas juntas, em torno do centro da caixa delas, mantendo a
  // altura da base (nada afunda abaixo de onde estava).
  function rotacionarGrupo(lista, eixoGiro, graus) {
    const x0 = Math.min(...lista.map((f) => f.x)), x1 = Math.max(...lista.map((f) => f.x + f.w));
    const y0 = Math.min(...lista.map((f) => f.y)), y1 = Math.max(...lista.map((f) => f.y + f.h));
    const z0 = Math.min(...lista.map((f) => f.z)), z1 = Math.max(...lista.map((f) => f.z + f.espessura));
    const c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2 };
    const novas = lista.map((f) => rotacionar(f, eixoGiro, graus, c));
    const dz = z0 - Math.min(...novas.map((g) => g.z));
    return novas.map((g) => ({ ...g, z: limpa(g.z + dz) }));
  }

  // ---------- malha: formas livres em 3D ----------
  // Arrastar um vértice transforma a forma numa malha: vértices 3D (normalizados na caixa, como
  // `pontos`, para mover e esticar continuarem iguais) e faces, cada uma uma lista de índices no
  // sentido em que a normal aponta para fora. `aberta` marca a placa sem espessura (duas caras).
  function noMundoMalha(f, [u, v, t]) {
    return { x: limpa(f.x + u * f.w), y: limpa(f.y + v * f.h), z: limpa(f.z + t * f.espessura) };
  }

  function malhaMundo(f) {
    return { v: f.malha.v.map((p) => noMundoMalha(f, p)), faces: f.malha.faces, aberta: !!f.malha.aberta };
  }

  const sub3 = (p, q) => [p.x - q.x, p.y - q.y, p.z - q.z];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // Normal de um polígono 3D (método de Newell; serve também para faces que não são planas).
  function normal3(pts) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      x += (p.y - q.y) * (p.z + q.z);
      y += (p.z - q.z) * (p.x + q.x);
      z += (p.x - q.x) * (p.y + q.y);
    }
    const n = Math.hypot(x, y, z) || 1;
    return [x / n, y / n, z / n];
  }

  // A malha de um prisma, em coordenadas do mundo, na mesma ordem de vertices(f).
  function malhaDoPrisma(f) {
    const P = prisma(f);
    const n = P.a.length;
    if (P.comprimento <= 0) return { v: P.a, faces: [P.a.map((_, i) => i)], aberta: true };
    const v = P.a.concat(P.b);
    const orientar = (face, fora) => (dot3(normal3(face.map((i) => v[i])), fora) < 0 ? face.slice().reverse() : face);
    const faces = [orientar(P.a.map((_, i) => i), P.e.map((c) => -c)), orientar(P.b.map((_, i) => n + i), P.e)];
    for (let i = 0; i < n; i++) faces.push(orientar([i, (i + 1) % n, n + (i + 1) % n, n + i], P.normais[i]));
    return { v, faces, aberta: false };
  }

  // Junta vértices no mesmo ponto, tira das faces os repetidos e apaga as faces que sobram com
  // menos de 3 cantos (ex.: arrastar um vértice até o vizinho).
  function simplificarMalha(m) {
    const chave = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`;
    const indice = new Map(), v = [], novo = [];
    m.v.forEach((p) => {
      const k = chave(p);
      if (!indice.has(k)) { indice.set(k, v.length); v.push(p); }
      novo.push(indice.get(k));
    });
    const faces = [];
    for (const face of m.faces) {
      const f2 = face.map((i) => novo[i]).filter((i, j, arr) => i !== arr[(j + arr.length - 1) % arr.length]);
      if (new Set(f2).size >= 3) faces.push(f2);
    }
    const usados = [...new Set(faces.flat())].sort((a, b) => a - b);
    const re = new Map(usados.map((i, j) => [i, j]));
    return { v: usados.map((i) => v[i]), faces: faces.map((f2) => f2.map((i) => re.get(i))), aberta: m.aberta };
  }

  // Forma a partir de uma malha no mundo: a caixa passa a ser a dos vértices.
  function formaDeMalha(f, m) {
    const s2 = simplificarMalha(m);
    const lim = (k) => [Math.min(...s2.v.map((p) => p[k])), Math.max(...s2.v.map((p) => p[k]))];
    const [x0, x1] = lim('x'), [y0, y1] = lim('y'), [z0, z1] = lim('z');
    const w = limpa(x1 - x0), h = limpa(y1 - y0), e = limpa(z1 - z0);
    const n = (val, o, d) => (d ? (val - o) / d : 0);
    return {
      ...f, pontos: undefined, regular: undefined, eixo: undefined, furos: undefined,
      lados: s2.v.length, x: x0, y: y0, z: z0, w, h, espessura: e,
      malha: { v: s2.v.map((p) => [n(p.x, x0, w), n(p.y, y0, h), n(p.z, z0, e)]), faces: s2.faces, aberta: s2.aberta },
    };
  }

  // Move o vértice i (índice de vertices(f)) até o ponto alvo; a forma vira (ou continua) malha.
  // Os vértices do círculo são só os 4 extremos de um contorno de 64 pontos: ainda não se movem.
  function moverVertice(f, i, alvo) {
    if (f.lados === 0 && !f.pontos && !f.malha) return null;
    if (furosUV(f).length) return null; // forma com vão: os vértices ainda não se movem
    const m = f.malha ? malhaMundo(f) : malhaDoPrisma(f);
    if (!m.v[i]) return null;
    const v = m.v.slice();
    v[i] = { x: limpa(alvo.x), y: limpa(alvo.y), z: limpa(alvo.z) };
    return formaDeMalha(f, { ...m, v });
  }

  // ---------- mescla por face ----------
  // Duas formas fechadas que se encostam por uma face inteira (os mesmos cantos, no mesmo lugar)
  // viram uma malha só: as duas faces em comum somem, os vértices se juntam, faces vizinhas no
  // mesmo plano se fundem e os vértices que ficam no meio de arestas retas desaparecem.
  function mesclarPorFace(a, b) {
    if (furosUV(a).length || furosUV(b).length) return null;
    const ma = a.malha ? malhaMundo(a) : malhaDoPrisma(a);
    const mb = b.malha ? malhaMundo(b) : malhaDoPrisma(b);
    if (ma.aberta || mb.aberta) return null; // placas sem espessura não fecham um volume
    const todos = ma.v.concat(mb.v);
    const chave = (p) => `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`;
    const indice = new Map(), v = [], novo = todos.map((p) => {
      const k = chave(p);
      if (!indice.has(k)) { indice.set(k, v.length); v.push(p); }
      return indice.get(k);
    });
    const fa = ma.faces.map((f) => f.map((i) => novo[i]));
    const fb = mb.faces.map((f) => f.map((i) => novo[i + ma.v.length]));
    const conj = (f) => [...f].sort((x, y) => x - y).join(',');
    const deB = new Map(fb.map((f, i) => [conj(f), i]));
    const tirarA = new Set(), tirarB = new Set();
    const nf = (f) => normal3(f.map((i) => v[i]));
    fa.forEach((f, i) => {
      const j = deB.get(conj(f));
      // A face em comum aparece virada para lados opostos; no mesmo sentido, os volumes se sobrepõem.
      if (j !== undefined && new Set(f).size === f.length && dot3(nf(f), nf(fb[j])) < -0.99) { tirarA.add(i); tirarB.add(j); }
    });
    if (!tirarA.size) return null;
    const faces = fundirCoplanares(v, fa.filter((_, i) => !tirarA.has(i)).concat(fb.filter((_, i) => !tirarB.has(i))));
    // O volume tem de ser a soma dos dois: senão, uma forma entra na outra.
    const va = volume(ma.v, ma.faces), vb = volume(mb.v, mb.faces), vj = volume(v, faces);
    if (Math.abs(vj - va - vb) > 1e-3 * (Math.abs(va) + Math.abs(vb)) + 0.5) return null;
    return formaDeMalha(a, { v, faces, aberta: false });
  }

  // Volume de uma malha fechada (teorema da divergência, faces em leque).
  function volume(v, faces) {
    let s2 = 0;
    for (const f of faces) {
      const p = v[f[0]];
      for (let k = 1; k + 1 < f.length; k++) {
        const q = v[f[k]], r = v[f[k + 1]];
        s2 += p.x * (q.y * r.z - q.z * r.y) - p.y * (q.x * r.z - q.z * r.x) + p.z * (q.x * r.y - q.y * r.x);
      }
    }
    return s2 / 6;
  }

  // Funde faces vizinhas (com uma aresta em comum) que estão no mesmo plano e apaga os vértices
  // que ficaram alinhados no meio de uma aresta em todas as faces que os usam.
  function fundirCoplanares(v, faces) {
    faces = faces.map((f) => f.slice());
    const normal = (f) => normal3(f.map((i) => v[i]));
    const noPlano = (f, g) => {
      const n = normal(f), p0 = v[f[0]];
      return g.every((i) => Math.abs(dot3(n, sub3(v[i], p0))) < 1e-3);
    };
    const arestas = (f) => f.map((u, k) => [u, f[(k + 1) % f.length]]);
    let mudou = true;
    while (mudou) {
      mudou = false;
      busca: for (let i = 0; i < faces.length; i++) {
        for (let j = i + 1; j < faces.length; j++) {
          const A = faces[i], B = faces[j];
          const comuns = arestas(A).filter(([u, w]) => arestas(B).some(([p, q]) => p === w && q === u));
          if (comuns.length !== 1) continue;
          if (dot3(normal(A), normal(B)) < 1 - 1e-6 || !noPlano(A, B)) continue;
          const [u, w] = comuns[0];
          const desde = (f, ini) => { const k = f.indexOf(ini); return f.slice(k).concat(f.slice(0, k)); };
          const ladoA = desde(A, w); // w … u
          const ladoB = desde(B, u); // u … w
          const junta = ladoA.concat(ladoB.slice(1, -1));
          if (new Set(junta).size !== junta.length) continue; // ficaria com um vértice repetido
          faces[i] = junta;
          faces.splice(j, 1);
          mudou = true;
          break busca;
        }
      }
    }
    // Vértices alinhados entre os vizinhos em todas as faces em que aparecem.
    const alinhado = (f, k) => {
      const p = v[f[(k + f.length - 1) % f.length]], q = v[f[k]], r = v[f[(k + 1) % f.length]];
      const a2 = sub3(q, p), b2 = sub3(r, q);
      const cr = [a2[1] * b2[2] - a2[2] * b2[1], a2[2] * b2[0] - a2[0] * b2[2], a2[0] * b2[1] - a2[1] * b2[0]];
      return Math.hypot(...cr) / (Math.hypot(...b2) || 1) < 1e-3 && dot3(a2, b2) > 0;
    };
    let tirou = true;
    while (tirou) {
      tirou = false;
      const usados = [...new Set(faces.flat())];
      for (const t of usados) {
        const onde = faces.filter((f) => f.includes(t));
        if (onde.every((f) => alinhado(f, f.indexOf(t)) && f.length > 3)) {
          for (const f of onde) f.splice(f.indexOf(t), 1);
          tirou = true;
        }
      }
    }
    return faces;
  }

  // Faces que a câmera vê, da mais distante para a mais próxima, com a normal voltada para ela.
  function facesVisiveis(f, cam = OBLIQUA) {
    if (furosUV(f).length) return facesVisiveisComFuros(f, cam);
    const m = f.malha ? malhaMundo(f) : malhaDoPrisma(f);
    const out = [];
    for (const face of m.faces) {
      const pts = face.map((i) => m.v[i]);
      let n = normal3(pts);
      const lado = dot3(n, cam.d);
      if (!m.aberta && lado <= 1e-9) continue;
      if (lado < 0) n = n.map((c) => -c);
      const c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
      out.push({ pts, n, prof: dot3([c.x, c.y, c.z], cam.d) });
    }
    return out.sort((a, b) => a.prof - b.prof);
  }

  // Prisma com vãos: as tampas levam os vãos em `furos` (laços 3D).
  function facesVisiveisComFuros(f, cam) {
    const P = prisma(f);
    const out = [];
    const media = (pts) => pts.reduce((a, p) => [a[0] + p.x / pts.length, a[1] + p.y / pts.length, a[2] + p.z / pts.length], [0, 0, 0]);
    const juntar = (pts, n, extra) => { if (dot3(n, cam.d) > 1e-9) out.push({ pts, n, prof: dot3(media(pts), cam.d), ...extra }); };
    if (P.comprimento > 0) {
      for (const laco of [P, ...P.furos]) {
        for (let i = 0; i < laco.a.length; i++) {
          const j = (i + 1) % laco.a.length;
          juntar([laco.a[i], laco.a[j], laco.b[j], laco.b[i]], laco.normais[i]);
        }
      }
    }
    const fim = dot3(P.e, cam.d) >= 0;
    const tampa = fim || !P.comprimento ? 'b' : 'a';
    juntar(P[tampa], fim ? P.e : P.e.map((c) => -c), { furos: P.furos.map((h) => h[tampa]) });
    return out.sort((x, y) => x.prof - y.prof);
  }

  const api = {
    LADO, DIAMETRO, MIN_LADOS, MAX_LADOS, SEGMENTOS_CIRCULO, TILE, OBLIQUA,
    cameraOrbita, misturarCameras, projetar, molde, criarForma, contorno, verticesBase, vertices, caixa,
    buscarEncaixe, encaixeGrade, ordemDesenho, envoltoria, silhueta, dentro,
    eixoDe, contornoUV, prisma, rotacionar, rotacionarGrupo, uniaoSecoes,
    malhaMundo, malhaDoPrisma, moverVertice, facesVisiveis, normal3, mesclarPorFace,
    area, normalExterna, faces, dentroForma, uniaoContornos, mesclar, mesclarVarias, areaRecorte, recortar, vazarPelaFace,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Geometria = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
