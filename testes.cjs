// Testes da geometria: node testes.cjs
const assert = require('assert');
const G = require('./geometria.js');

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-4, `${msg}: ${a} ≠ ${b}`);
let id = 1;
const nova = (lados, x = 0, y = 0) => G.criarForma(lados, x, y, id, id++);

// Polígonos regulares com 32 px de lado e aresta inferior horizontal.
for (let n = G.MIN_LADOS; n <= 12; n++) {
  const f = nova(n);
  const v = G.verticesBase(f);
  assert.strictEqual(v.length, n, `${n} lados → ${n} vértices`);
  for (let i = 0; i < n; i++) {
    const [a, b] = [v[i], v[(i + 1) % n]];
    perto(Math.hypot(b[0] - a[0], b[1] - a[1]), 32, `lado do polígono de ${n}`);
  }
  const baixo = v.filter((p) => Math.abs(p[1] - f.h) < 1e-6);
  assert.strictEqual(baixo.length, 2, `${n} lados com aresta inferior horizontal`);
}
const quadrado = nova(4);
perto(quadrado.w, 32, 'largura do quadrado');
perto(quadrado.h, 32, 'altura do quadrado');

// Círculo: 32 px de diâmetro, quatro vértices nos extremos.
const circulo = nova(0);
assert.strictEqual(circulo.w, 32);
assert.strictEqual(G.vertices(circulo).length, 4);

// Espessura dobra os vértices.
const prisma = nova(5);
assert.strictEqual(G.vertices(prisma).length, 5);
prisma.espessura = 20;
assert.strictEqual(G.vertices(prisma).length, 10);
assert.ok(G.vertices(prisma).slice(5).every((p) => p.z === 20));

// Esticar mantém os vértices e muda a caixa.
const esticado = nova(4);
esticado.w = 96;
const vx = G.verticesBase(esticado).map((p) => p[0]);
assert.strictEqual(Math.max(...vx) - Math.min(...vx), 96);

// Projeção oblíqua: Z sobe para cima e para a esquerda.
assert.deepStrictEqual(G.projetar({ x: 10, y: 10, z: 4 }), { x: 6, y: 6 });

// Encaixe lado a lado: o canto do bloco móvel cai no canto do fixo.
const a = nova(4, 0, 0);
const b = nova(4, 35, 2);
const e = G.buscarEncaixe([b], [a], 8);
assert.ok(e, 'encaixe lateral encontrado');
assert.deepStrictEqual([e.dx, e.dy, e.dz], [-3, -2, 0]);
assert.strictEqual(G.buscarEncaixe([nova(4, 60, 60)], [a], 8), null, 'longe não encaixa');

// Empilhar: o canto de baixo do móvel vai ao canto de cima do fixo.
const base = nova(4, 0, 0); base.espessura = 32;
const topo = nova(4, -30, -31); topo.espessura = 32;
const lado = G.buscarEncaixe([topo], [base], 8);
assert.strictEqual(lado.dz, 0, 'sem Shift, fica na mesma altura');
const pilha = G.buscarEncaixe([topo], [base], 8, true);
assert.ok(pilha, 'empilhamento encontrado');
assert.strictEqual(pilha.dz, 32, 'sobe 32 px');
assert.strictEqual(topo.z + pilha.dz, 32);
assert.strictEqual(topo.x + pilha.dx, 0);

// Nunca afunda abaixo do chão.
const chao = nova(4, 0, 0);
const alto = nova(4, 2, 2); alto.espessura = 32;
const ruim = G.buscarEncaixe([alto], [chao], 40);
assert.ok(!ruim || alto.z + ruim.dz >= 0);

// Ordem de desenho: o de baixo antes do de cima; oeste antes de leste.
const embaixo = nova(4, 0, 0); embaixo.espessura = 32;
const emcima = nova(4, 0, 0); emcima.z = 32; emcima.espessura = 32;
const leste = nova(4, 32, 0); leste.espessura = 32;
const ordem = G.ordemDesenho([leste, emcima, embaixo]);
assert.ok(ordem.indexOf(embaixo) < ordem.indexOf(emcima), 'baixo antes de cima');
assert.ok(ordem.indexOf(embaixo) < ordem.indexOf(leste), 'oeste antes de leste');

// Seleção pela silhueta projetada.
const s = G.silhueta(embaixo);
assert.ok(G.dentro([16, 16], s));
assert.ok(G.dentro([-16, -16], s), 'o topo projetado também é clicável');
assert.ok(!G.dentro([40, 40], s));

// Câmera giratória: topo é a planta; isométrica olha na diagonal (1,1,1).
const topoCam = G.cameraOrbita(0, 90);
const pt = G.projetar({ x: 10, y: 20, z: 30 }, topoCam);
perto(pt.x, 10, 'topo x'); perto(pt.y, 20, 'topo y');
const iso = G.cameraOrbita(45, Math.atan(1 / Math.SQRT2) * 180 / Math.PI);
for (const c of iso.d) perto(c, 1 / Math.sqrt(3), 'isométrica olha de (1,1,1)');
const frente = G.cameraOrbita(0, 0); // do sul, na horizontal: Z sobe na tela
perto(G.projetar({ x: 0, y: 0, z: 10 }, frente).y, -10, 'Z para cima');

// Ordem muda com o giro: olhando do norte, o bloco do norte fica na frente.
const norte = nova(4, 0, 0); norte.espessura = 32;
const sul = nova(4, 0, 32); sul.espessura = 32;
const doSul = G.ordemDesenho([norte, sul], G.cameraOrbita(0, 30));
assert.ok(doSul.indexOf(norte) < doSul.indexOf(sul), 'do sul: norte atrás');
const doNorte = G.ordemDesenho([norte, sul], G.cameraOrbita(180, 30));
assert.ok(doNorte.indexOf(sul) < doNorte.indexOf(norte), 'do norte: sul atrás');

// Encaixe na grade de 64 px: vértice da grade ou meio do lado.
assert.strictEqual(G.TILE, 64);
const g1 = G.encaixeGrade([nova(4, 61, 3)], 8);
assert.deepStrictEqual([g1.dx, g1.dy], [3, -3], 'canto vai ao vértice (64, 0)');
const g2 = G.encaixeGrade([nova(4, 34, 130)], 8);
assert.deepStrictEqual([g2.destino.x, g2.destino.y], [32, 128], 'meio do lado da célula');
assert.strictEqual(G.encaixeGrade([nova(4, 16, 16)], 8), null, 'centro da célula não é ponto de encaixe');

// Mesclar lado a lado: dois quadrados viram um retângulo de 4 vértices.
const qa = nova(4, 0, 0); qa.espessura = 32;
const qb = nova(4, 32, 0); qb.espessura = 32;
const ret = G.mesclar(qa, qb);
assert.ok(ret, 'quadrados encostados se mesclam');
assert.strictEqual(G.verticesBase(ret).length, 4, 'os vértices do meio somem');
assert.deepStrictEqual([ret.x, ret.y, ret.w, ret.h, ret.espessura], [0, 0, 64, 32, 32]);
assert.strictEqual(G.vertices(ret).length, 8);

// Encostados só em parte de uma aresta: forma em L com 6 vértices.
const grande = nova(4, 0, 0); grande.w = 64; grande.h = 64;
const pequeno = nova(4, 64, 0);
const ele = G.mesclar(grande, pequeno);
assert.ok(ele, 'L mesclado');
assert.strictEqual(G.verticesBase(ele).length, 6);
perto(Math.abs(G.area(G.contorno(ele))), 64 * 64 + 32 * 32, 'área do L');
assert.ok(G.dentroForma([80, 16], ele), 'dentro da perna do L');
assert.ok(!G.dentroForma([80, 48], ele), 'o vão do L não é da forma');

// Empilhados com a mesma base: soma as espessuras.
const p1 = nova(4, 0, 0); p1.espessura = 32;
const p2 = nova(4, 0, 0); p2.z = 32; p2.espessura = 16;
const torre = G.mesclar(p1, p2);
assert.deepStrictEqual([torre.z, torre.espessura, G.vertices(torre).length], [0, 48, 8]);

// Não mescla: só um canto em comum, alturas diferentes ou sobrepostos.
assert.strictEqual(G.mesclar(nova(4, 0, 0), nova(4, 32, 32)), null, 'só o canto');
const fino = nova(4, 32, 0); fino.espessura = 10;
assert.strictEqual(G.mesclar(nova(4, 0, 0), fino), null, 'espessuras diferentes');
assert.strictEqual(G.mesclar(nova(4, 0, 0), nova(4, 16, 0)), null, 'sobrepostos');

// Três em fila, mesclados par a par.
const fila = G.mesclarVarias([nova(4, 0, 0), nova(4, 64, 0), nova(4, 32, 0)]);
assert.ok(fila && G.verticesBase(fila).length === 4 && fila.w === 96, 'fila de três vira um retângulo');

// Recortar: três cantos de um quadrado tiram um triângulo e sobra o outro.
const qr = nova(4, 0, 0); qr.w = 64; qr.h = 64; qr.espessura = 16;
const cq = G.contorno(qr);
const fora = cq.findIndex((p) => p[0] === 64 && p[1] === 64); // o canto que fica
const tres = [0, 1, 2, 3].filter((i) => i !== fora);
const sobra = G.recortar(qr, tres);
assert.strictEqual(sobra.length, 1, 'sobra um pedaço');
assert.strictEqual(G.verticesBase(sobra[0]).length, 3, 'o pedaço é um triângulo');
perto(Math.abs(G.area(G.contorno(sobra[0]))), 64 * 64 / 2, 'metade da área');
assert.deepStrictEqual([sobra[0].z, sobra[0].espessura], [0, 16], 'mantém altura e espessura');
assert.ok(G.dentroForma([56, 56], sobra[0]) && !G.dentroForma([8, 8], sobra[0]), 'o canto escolhido ficou');

// Hexágono com vértices alternados: o triângulo do meio sai e ficam três pedaços.
const hx = nova(6, 0, 0);
assert.strictEqual(G.recortar(hx, [0, 2, 4]).length, 3);
// Todos os vértices: a forma inteira some.
assert.deepStrictEqual(G.recortar(nova(4, 0, 0), [0, 1, 2, 3]), []);
// Menos de três vértices, ou vértices alinhados: sem área.
assert.strictEqual(G.recortar(nova(4, 0, 0), [0, 1]), null);
assert.strictEqual(G.areaRecorte(nova(4, 0, 0), [0, 1]), null);

// Círculo: três extremos (leste, sul, oeste) tiram o triângulo inscrito.
const cr = nova(0, 0, 0);
const arcos = G.recortar(cr, [0, 1, 2]);
assert.strictEqual(arcos.length, 3, 'dois segmentos e a metade de cima');
perto(arcos.reduce((s, f) => s + Math.abs(G.area(G.contorno(f))), 0) + 16 * 16,
  Math.abs(G.area(G.contorno(cr))), 'pedaços + triângulo = círculo');

// Forma côncava (L) com corda por fora do vão: recusa.
const Lr = G.mesclar(Object.assign(nova(4, 0, 0), { w: 64, h: 64 }), nova(4, 64, 0));
const cl = G.contorno(Lr);
const pega = (x, y) => cl.findIndex((p) => p[0] === x && p[1] === y);
assert.strictEqual(G.recortar(Lr, [pega(96, 32), pega(64, 64), pega(0, 64)]), null, 'corda fora da forma');

// Rotacionar: uma caixa 64 × 32 × 16 girada 90° em Z troca largura e profundidade.
const cx0 = Object.assign(nova(4, 0, 0), { w: 64, h: 32, espessura: 16 });
const [rz] = G.rotacionarGrupo([cx0], 'z', 90);
assert.deepStrictEqual([rz.w, rz.h, rz.espessura, rz.eixo, rz.z], [32, 64, 16, 'z', 0]);
perto(rz.x + rz.w / 2, 32, 'centro X mantido'); perto(rz.y + rz.h / 2, 16, 'centro Y mantido');
// Em X, a caixa fica de pé: a profundidade vira altura, e o eixo da extrusão passa a ser Y.
const [rx] = G.rotacionarGrupo([cx0], 'x', 90);
assert.deepStrictEqual([rx.w, rx.h, rx.espessura, rx.eixo, rx.z], [64, 16, 32, 'y', 0]);
assert.strictEqual(G.vertices(rx).length, 8);
// Em Y, a extrusão passa a ser X.
const [ry] = G.rotacionarGrupo([cx0], 'y', 270);
assert.deepStrictEqual([ry.w, ry.h, ry.espessura, ry.eixo], [16, 32, 64, 'x']);
// Quatro giros de 90° voltam ao começo; 180° em Z mantém a caixa.
let volta = cx0;
for (let i = 0; i < 4; i++) [volta] = G.rotacionarGrupo([volta], 'x', 90);
assert.deepStrictEqual([volta.w, volta.h, volta.espessura, volta.eixo], [64, 32, 16, 'z']);

// Prisma triangular deitado de lado (giro em X): 6 vértices, seção de pé.
const tri = Object.assign(nova(3, 0, 0), { espessura: 64 });
const [deitado] = G.rotacionarGrupo([tri], 'x', 90);
assert.strictEqual(deitado.eixo, 'y');
assert.strictEqual(G.vertices(deitado).length, 6);
perto(deitado.h, 64, 'o comprimento do prisma vai para Y');
assert.ok(deitado.regular && deitado.pontos, 'segue sendo o triângulo regular');
// Os vértices girados são os originais girados (mesma distância entre eles).
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
const v0 = G.vertices(tri), v1 = G.vertices(deitado);
perto(dist(v1[0], v1[1]), dist(v0[0], v0[1]), 'lado preservado');
perto(dist(v1[0], v1[3]), 64, 'comprimento preservado');
// Clique e faces funcionam com a forma de lado.
assert.strictEqual(G.faces(deitado).length, 2 + 3);
assert.ok(G.silhueta(deitado).length >= 3);
// Grupo: duas caixas lado a lado giram juntas em torno do centro do grupo.
const par1 = Object.assign(nova(4, 0, 0), { espessura: 32 }), par2 = Object.assign(nova(4, 32, 0), { espessura: 32 });
const [h1, h2] = G.rotacionarGrupo([par1, par2], "z", 90);
assert.deepStrictEqual([h1.x, h1.y, h2.x, h2.y], [16, -16, 16, 16], 'giram em volta do centro do par');
// Formas de lado também mesclam (duas caixas em pé lado a lado viram uma); recortar, não.
const deLado = G.mesclar(rx, Object.assign({}, rx, { x: 64 }));
assert.ok(deLado && deLado.w === 128 && G.vertices(deLado).length === 8, 'caixas de lado mescladas');
assert.strictEqual(G.recortar(rx, [0, 1, 2]), null);

// Portal: duas colunas e uma verga por cima viram um U invertido (prisma em Y).
const colA = Object.assign(nova(4, 0, 0), { w: 16, h: 16, espessura: 96 });
const colB = Object.assign(nova(4, 80, 0), { w: 16, h: 16, espessura: 96 });
const verga = Object.assign(nova(4, 0, 0), { w: 96, h: 16, z: 96, espessura: 24 });
const portal = G.mesclarVarias([colA, colB, verga]);
assert.ok(portal, 'portal mesclado');
assert.strictEqual(portal.eixo, 'y');
assert.deepStrictEqual([portal.x, portal.y, portal.z, portal.w, portal.h, portal.espessura], [0, 0, 0, 96, 16, 120]);
assert.strictEqual(portal.pontos.length, 8, 'seção em U invertido com 8 cantos');
perto(Math.abs(G.area(portal.pontos.map(([u, v]) => [u * 96, v * 120]))), 2 * 16 * 96 + 96 * 24, 'área da seção');
// Contatos parciais com profundidades diferentes também unem o portal.
const vergaFunda = Object.assign({}, verga, { h: 24 });
assert.ok(G.mesclarVarias([colA, colB, vergaFunda]));

// Malha: subir um vértice de cima de um cubo deixa 8 vértices e 6 faces, e a caixa cresce.
const cubo = Object.assign(nova(4, 0, 0), { w: 64, h: 64, espessura: 64 });
const vc = G.vertices(cubo);
const topoI = vc.findIndex((p) => p.x === 64 && p.y === 64 && p.z === 64);
const alto2 = G.moverVertice(cubo, topoI, { x: 64, y: 64, z: 96 });
assert.ok(alto2.malha, 'virou malha');
assert.strictEqual(G.vertices(alto2).length, 8);
assert.strictEqual(alto2.malha.faces.length, 6);
assert.deepStrictEqual([alto2.x, alto2.y, alto2.z, alto2.w, alto2.h, alto2.espessura], [0, 0, 0, 64, 64, 96]);
assert.ok(G.vertices(alto2).some((p) => p.x === 64 && p.y === 64 && p.z === 96), 'o vértice foi para onde devia');
// Os outros vértices não saem do lugar.
for (const p of vc) if (!(p.x === 64 && p.y === 64 && p.z === 64)) assert.ok(G.vertices(alto2).some((q) => q.x === p.x && q.y === p.y && q.z === p.z));
// Arrastar até o vizinho: os dois viram um só (7 vértices), a face de cima vira triângulo.
const vizinho = vc.find((p) => p.x === 0 && p.y === 64 && p.z === 64);
const junto = G.moverVertice(cubo, topoI, vizinho);
assert.strictEqual(G.vertices(junto).length, 7);
assert.ok(junto.malha.faces.some((f) => f.length === 3));
// Pirâmide: os 4 de cima no mesmo ponto.
let pir = cubo;
const cume = { x: 32, y: 32, z: 64 };
for (const alvoV of vc.filter((p) => p.z === 64)) {
  const i = G.vertices(pir).findIndex((p) => p.x === alvoV.x && p.y === alvoV.y && p.z === alvoV.z);
  pir = G.moverVertice(pir, i, cume);
}
assert.strictEqual(G.vertices(pir).length, 5, 'pirâmide de base quadrada');
assert.strictEqual(pir.malha.faces.length, 5, 'base + 4 triângulos');
// Câmera isométrica vê 3 faces do cubo; da pirâmide, as de cima.
assert.strictEqual(G.facesVisiveis(cubo, G.cameraOrbita(45, 35.26)).length, 3);
assert.ok(G.facesVisiveis(pir, G.cameraOrbita(45, 35.26)).length >= 2);
// Clique, giro e esticar funcionam com a malha.
assert.ok(G.dentroForma([32, 0], pir, G.cameraOrbita(0, 90)), 'clique pela vista de topo');
const [pirGirada] = G.rotacionarGrupo([pir], 'x', 90);
assert.strictEqual(G.vertices(pirGirada).length, 5);
perto(dist(G.vertices(pirGirada)[0], G.vertices(pirGirada)[1]), dist(G.vertices(pir)[0], G.vertices(pir)[1]), 'giro preserva as distâncias');
const larga = { ...pir, w: 128 };
assert.ok(G.vertices(larga).some((p) => p.x === 128), 'esticar escala a malha');
// Círculo ainda não; malha não mescla.
assert.strictEqual(G.moverVertice(nova(0, 0, 0), 0, { x: 0, y: 0, z: 10 }), null);
assert.ok(G.mesclar(pir, cubo),'sólidos sobrepostos mesclam por união booleana');

// Mescla por face: cubo deformado (canto de trás subiu) encostado num cubo comum pela face x = 64.
const cuboA = Object.assign(nova(4, 0, 0), { w: 64, h: 64, espessura: 64 });
const iTras = G.vertices(cuboA).findIndex((p) => p.x === 0 && p.y === 0 && p.z === 64);
const deformado = G.moverVertice(cuboA, iTras, { x: 0, y: 0, z: 96 });
const cuboB = Object.assign(nova(4, 64, 0), { w: 64, h: 64, espessura: 64 });
const juntos = G.mesclar(deformado, cuboB);
assert.ok(juntos && juntos.malha, 'formas livres mesclam pela face em comum');
const vj = G.vertices(juntos);
assert.ok(!vj.some((p) => p.x === 64 && p.z === 0), 'os vértices de baixo do meio somem (arestas retas)');
assert.ok(vj.some((p) => p.x === 64 && p.y === 0 && p.z === 64), 'o do meio da frente fica (o topo de A é inclinado)');
assert.strictEqual(vj.length, 10);
assert.ok(juntos.malha.faces.some((f) => f.length >= 4 && f.every((i) => juntos.malha.v[i][2] === 0)), 'uma base só');
assert.deepStrictEqual([juntos.x, juntos.w, juntos.espessura], [0, 128, 96]);
// Também na ordem inversa, e com o prisma comum primeiro.
assert.ok(G.mesclar(cuboB, deformado));
// Sem face inteira em comum: não mescla (encostado só em parte, ou separado).
const meioCubo = Object.assign(nova(4, 64, 0), { w: 32, h: 32, espessura: 32 });
assert.ok(G.mesclar(deformado, meioCubo), 'contato parcial da face permite união booleana');
assert.strictEqual(G.mesclar(deformado, Object.assign(nova(4, 200, 0), { w: 64, h: 64, espessura: 64 })), null, 'separadas');
// A pirâmide em cima do cubo deformado? A base dela coincide com a face de cima do cubo comum.
const pirEmCima = { ...pir, x: 64, y: 0, z: 64 };
const casinha = G.mesclar(cuboB, pirEmCima);
assert.ok(casinha && G.vertices(casinha).length === 9, 'cubo com telhado em pirâmide: 8 + cume');
assert.strictEqual(casinha.malha.faces.length, 5 + 4, 'quatro paredes, base e quatro águas');

// Janela: as 4 peças da cena do usuário (parede de baixo, duas colunas e verga) fecham uma
// moldura com um vão no meio.
const caixaDe = (x, y, z, w, h, e) => Object.assign(nova(4, 0, 0), { x, y, z, w, h, espessura: e });
const pecasJanela = [
  caixaDe(312, 524, 0, 8, 64, 40),   // parede de baixo
  caixaDe(312, 524, 90, 8, 64, 38),  // verga
  caixaDe(312, 576, 40, 8, 12, 50),  // coluna direita
  caixaDe(312, 524, 40, 8, 12, 50),  // coluna esquerda
];
const janela = G.mesclarVarias(pecasJanela);
assert.ok(janela, 'as 4 peças da janela mesclam');
assert.strictEqual(janela.eixo, 'x', 'prisma ao longo da espessura da parede');
assert.strictEqual(janela.furos && janela.furos.length, 1, 'um vão');
assert.deepStrictEqual([janela.x, janela.y, janela.z, janela.w, janela.h, janela.espessura], [312, 524, 0, 8, 64, 128]);
assert.strictEqual(G.vertices(janela).length, 16, '4 cantos de fora + 4 do vão, nas duas faces');
// Olhando de frente para a parede (de leste), o meio do vão é vazio e a parede não.
const deLeste = G.cameraOrbita(90, 0);
const meioVao = G.projetar({ x: 320, y: 556, z: 65 }, deLeste), naParede = G.projetar({ x: 320, y: 556, z: 20 }, deLeste);
assert.ok(!G.dentroForma([meioVao.x, meioVao.y], janela, deLeste), 'clique no vão não pega a parede');
assert.ok(G.dentroForma([naParede.x, naParede.y], janela, deLeste), 'clique na parede pega');
// Faces visíveis: a tampa leva o vão; as paredes de dentro do vão aparecem.
const fv = G.facesVisiveis(janela, G.cameraOrbita(60, 30));
assert.ok(fv.some((f) => f.furos && f.furos.length === 1), 'tampa com vão');
// Girar mantém o vão; a ordem das peças não importa.
const [janelaDeitada] = G.rotacionarGrupo([janela], 'y', 90);
assert.strictEqual(janelaDeitada.furos.length, 1);
assert.ok(G.mesclarVarias([pecasJanela[2], pecasJanela[1], pecasJanela[0], pecasJanela[3]]));
// Uma parede com vão continua mesclando com outra caixa ao lado (o vão vai junto).
const comVizinha = G.mesclar(janela, caixaDe(312, 588, 0, 8, 64, 128));
assert.ok(comVizinha && comVizinha.furos.length === 1 && comVizinha.h === 128, 'parede com janela + parede lisa');
// Formas com vão ainda não deformam vértice nem recortam.
assert.strictEqual(G.moverVertice(janela, 0, { x: 0, y: 0, z: 0 }), null);
assert.strictEqual(G.recortar(janela, [0, 1, 2]), null);

// Vazar pela face: a peça marcada é o molde, e a parede NÃO marcada recebe o vão.
{
  const parede = { ...nova(4), x: 0, y: 0, z: 0, w: 240, h: 8, espessura: 160, cor: '#8585cc' };
  const molde = { ...nova(4), x: 80, y: 8, z: 50, w: 40, h: 32, espessura: 60, cor: '#c82030' };
  const originais = JSON.stringify([parede, molde]);
  const vao = G.vazarPelaFace(molde, parede);
  assert.ok(vao && vao.furos.length === 1, 'o exemplo da parede ganha um vão');
  assert.equal(vao.eixo, 'y');
  assert.equal(vao.h, 8, 'atravessa toda a espessura da parede');
  assert.equal(vao.cor, parede.cor);
  assert.equal(vao.id, parede.id);
  assert.equal(JSON.stringify([parede, molde]), originais, 'geometria pura: não modifica as entradas');
  const furo = G.prisma(vao).furos[0];
  assert.deepEqual([...new Set(furo.a.map(p => p.x))].sort((a,b)=>a-b), [80,120]);
  assert.deepEqual([...new Set(furo.a.map(p => p.z))].sort((a,b)=>a-b), [50,110]);
  assert.ok(furo.a.every(p => p.y === 0) && furo.b.every(p => p.y === 8));
  assert.equal(G.dentroForma([100,-80],vao,{ ax:[1,0,0],ay:[0,0,-1],d:[0,1,0] }),false,'clique através do vão não pega parede');
  assert.equal(G.dentroForma([20,-80],vao,{ ax:[1,0,0],ay:[0,0,-1],d:[0,1,0] }),true);
  assert.equal(G.vazarPelaFace(molde, vao), null, 'não duplica o mesmo vão');
  const fundido=G.vazarPelaFace({...molde,x:100},vao);
  assert.ok(fundido && fundido.furos.length===1,'o novo corte se une ao vão anterior com que cruza');
  assert.equal(G.vazarPelaFace({...molde,x:90,z:55,w:20,h:16,espessura:50},vao),null,'não duplica um molde que fica inteiramente dentro do vão');
  const dois = G.vazarPelaFace({...molde,x:160},vao);
  assert.equal(dois.furos.length,2,'acrescenta um segundo vão independente');
  const naAresta=G.vazarPelaFace({...molde,x:0},parede);
  assert.ok(naAresta && !naAresta.furos?.length,'corte alinhado à borda vira entalhe aberto');
  const paredeTopo={...parede,y:0,h:160,espessura:8};
  const moldeNaBorda={...molde,y:50,z:8,h:60,espessura:24,x:-20};
  const entalhe=G.vazarPelaFace(moldeNaBorda,paredeTopo);
  assert.ok(entalhe && !entalhe.furos?.length,'molde que cruza a aresta vira entalhe aberto');
  assert.ok(entalhe.pontos.length>4,'o novo contorno da parede fica côncavo');
  assert.ok(G.dentroForma([10,-80],entalhe,{ax:[1,0,0],ay:[0,0,-1],d:[0,1,0]} )===false,'a região recortada na borda fica vazia');
  assert.equal(G.vazarPelaFace({...moldeNaBorda,x:-40},paredeTopo),null,'tangência pela aresta sem área de recorte não altera a parede');
  assert.equal(G.vazarPelaFace({...molde,y:8.5},parede),null,'sem contato');
  assert.equal(G.vazarPelaFace({...molde,y:7},parede),null,'penetração não é apoio de face');
  assert.equal(G.vazarPelaFace({...molde,x:240},parede),null,'aresta/ponto não bastam');
  assert.equal(G.vazarPelaFace(molde,molde),null);
  assert.ok(G.vazarPelaFace({...molde,y:-32},parede),'apoio do outro lado da parede');
  for(const eixo of ['x','y','z']) {
    const giradas = G.rotacionarGrupo([parede,molde],eixo,90);
    assert.ok(G.vazarPelaFace(giradas[1],giradas[0]),`recorte após giro no eixo ${eixo}`);
  }
  for(const lados of [3,5,6,0]) {
    const topo = { ...parede, w:240,h:240,espessura:8 };
    const p = {...nova(lados),x:60,y:70,z:8,w:50,h:40,espessura:32};
    const resultado = G.vazarPelaFace(p,topo);
    assert.ok(resultado,`molde ${lados || 'circular'}`);
    assert.equal(resultado.furos[0].length,lados || G.SEGMENTOS_CIRCULO,'contorno real da face');
  }
  assert.deepEqual(G.prisma(JSON.parse(JSON.stringify(vao))),G.prisma(vao),'persistência preserva o vão');
}
// Portal côncavo: molde encostado, com a mesma altura e o mesmo início em Z.
// Se o recorte separa a seção, ambas as partes azuis restantes são devolvidas.
{
  const perfil=[[0,0],[0,100],[100,100],[100,0],[70,0],[70,55],[68,62],[63,70],[55,76],[45,76],[37,70],[32,62],[30,55],[30,0]];
  const portal={...nova(4),x:0,y:0,z:0,w:100,h:8,espessura:100,eixo:'y',lados:perfil.length,
    pontos:perfil.map(([x,z])=>[x/100,z/100])};
  const red={...nova(4),x:20,y:8,z:0,w:40,h:16,espessura:100};
  const corte=G.vazarPelaFace(red,portal);
  assert.ok(Array.isArray(corte)&&corte.length===2,'contato de faces com alturas e Z iguais corta portal em duas partes');
  assert.ok(corte.every(p=>p.eixo==='y'&&!p.malha),'partes do portal continuam sendo prismas editáveis');
  const perfilMesh=portal.pontos.map(([x,z])=>[x,0,z]).concat(portal.pontos.map(([x,z])=>[x,1,z]));
  const n=perfil.length;
  const portalMesh={...portal,pontos:undefined,malha:{v:perfilMesh,faces:[
    perfil.map((_,i)=>i),perfil.map((_,i)=>n+i),
    ...perfil.map((_,i)=>[i,(i+1)%n,n+(i+1)%n,n+i])
  ],aberta:false}};
  const corteMesh=G.vazarPelaFace(red,portalMesh);
  assert.ok(Array.isArray(corteMesh)&&corteMesh.length===2,'alvo mesclado em malha extrudida aceita o mesmo recorte');
}
// O piso fino deve ser pintado antes da parede que nasce nele, mesmo quando
// a profundidade média da placa grande sugeriria a ordem inversa.
{
  const piso={...nova(4),x:0,y:0,z:0,w:512,h:512,espessura:8};
  const parede={...nova(4),x:220,y:220,z:0,w:8,h:8,espessura:192};
  for(const lista of [[piso,parede],[parede,piso]]) {
    const ordenadas=G.ordemDesenho(lista,G.cameraOrbita(45,35));
    assert.equal(ordenadas[0],piso,'piso fica atrás da parede para a câmera');
    assert.equal(ordenadas[1],parede);
  }
}
{
  const cube={...nova(4),x:0,y:0,z:0,w:64,h:64,espessura:64};
  const vs=G.vertices(cube),i=vs.findIndex(p=>p.x===0&&p.y===0&&p.z===64);
  const novo=G.criarVerticeRelativo(cube,i,{x:24,y:24,z:0});
  assert.ok(novo&&novo.malha,'ponto interior passa a integrar a malha');
  const j=G.vertices(novo).findIndex(p=>p.x===24&&p.y===24&&p.z===64);
  assert.ok(j>=0&&novo.malha.faces.filter(f=>f.includes(j)).length>=3);
  assert.ok(G.moverVertice(novo,j,{x:24,y:24,z:80}),'novo vértice permite deformação');
  assert.equal(G.criarVerticeRelativo(cube,i,{x:24,y:24,z:1}),null,'ponto fora da face é rejeitado');
  const edge=G.criarVerticeRelativo(cube,i,{x:32,y:0,z:0});
  const ei=G.vertices(edge).findIndex(p=>p.x===32&&p.y===0&&p.z===64);
  assert.equal(edge.malha.faces.filter(f=>f.includes(ei)).length,2,'aresta compartilhada é atualizada nas duas faces');
}
{
  const ring={...nova(4),x:0,y:0,z:0,w:100,h:100,espessura:20,
    furos:[[[.3,.3],[.7,.3],[.7,.7],[.3,.7]]]};
  const vs=G.vertices(ring),i=vs.findIndex(p=>p.x===0&&p.y===0&&p.z===20);
  const cap=G.criarVerticeRelativo(ring,i,{x:20,y:20,z:0});
  assert.ok(cap&&cap.malha,'tampa com furo recebe novo vértice');
  assert.equal(G.criarVerticeRelativo(ring,i,{x:50,y:50,z:0}),null,'não cria ponto no vazio do furo');
  const topo=G.cameraOrbita(0,90),p=G.projetar({x:50,y:50,z:20},topo);
  assert.equal(G.dentroForma([p.x,p.y],cap,topo),false,'o vão permanece aberto após triangular a tampa');
  const j=vs.findIndex(p=>p.x===30&&p.y===30&&p.z===20);
  const inner=G.criarVerticeRelativo(ring,j,{x:0,y:20,z:-10});
  assert.ok(inner&&G.vertices(inner).some(p=>p.x===30&&p.y===50&&p.z===10),'parede interna do furo recebe vértice');
  const edges=new Map();
  for(const face of cap.malha.faces)for(let k=0;k<face.length;k++){const key=[face[k],face[(k+1)%face.length]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
  assert.ok([...edges.values()].every(n=>n===2),'a malha com furo continua fechada sem arestas soltas');
  for(const axis of ['x','y']) {
    const [rot]=G.rotacionarGrupo([ring],axis,90),verts=G.vertices(rot),start=verts[0];
    const face=G.malhaDoPrisma(rot).faces.find(f=>f.includes(0)&&f.length===3);
    const mesh=G.malhaDoPrisma(rot),center=face.reduce((s,id)=>({x:s.x+mesh.v[id].x/3,y:s.y+mesh.v[id].y/3,z:s.z+mesh.v[id].z/3}),{x:0,y:0,z:0});
    assert.ok(G.criarVerticeRelativo(rot,0,{x:center.x-start.x,y:center.y-start.y,z:center.z-start.z}),`furo preservado no eixo ${axis}`);
  }
}
{
  const perfil=[[0,0],[0,100],[100,100],[100,0],[70,0],[70,55],[68,62],[63,70],[55,76],[45,76],[37,70],[32,62],[30,55],[30,0]];
  const arco={...nova(4),x:0,y:0,z:0,w:100,h:8,espessura:100,eixo:'y',lados:perfil.length,pontos:perfil.map(([x,z])=>[x/100,z/100])};
  const [girado]=G.rotacionarGrupo([arco],'z',90),outro={...girado,id:999,grupo:999,x:0,y:0};
  const unido=G.mesclar(arco,outro);
  assert.ok(unido&&unido.malha,'portais perpendiculares com sobreposição parcial mesclam');
  const frente={ax:[1,0,0],ay:[0,0,-1],d:[0,1,0]},lado={ax:[0,1,0],ay:[0,0,-1],d:[1,0,0]};
  assert.equal(G.dentroForma([50,-40],unido,frente),false,'passagem do primeiro arco permanece aberta');
  assert.equal(G.dentroForma([50,-40],unido,lado),false,'passagem do segundo arco permanece aberta');
  const edges=new Map();for(const f of unido.malha.faces)for(let k=0;k<f.length;k++){const key=[f[k],f[(k+1)%f.length]].sort((a,b)=>a-b).join(':');edges.set(key,(edges.get(key)||0)+1);}
  assert.ok([...edges.values()].every(n=>n===2),'união dos arcos mantém malha fechada');
  const origem=G.vertices(arco).findIndex(p=>p.x===0&&p.y===0&&p.z===100);
  const editado=G.criarVerticeRelativo(arco,origem,{x:50,y:4,z:0});
  assert.ok(editado&&G.mesclar(editado,outro),'arco convertido em malha por novo vértice também mescla');
  assert.equal(G.mesclar(arco,{...outro,x:200}),null,'peças separadas continuam recusadas');
  const box={...nova(4),x:0,y:0,z:0,w:64,h:64,espessura:64};
  assert.ok(G.mesclar(box,{...box,x:32,id:998}),'caixas sobrepostas podem ser unidas');
  assert.equal(G.mesclar(box,{...box,x:64,y:64,id:998}),null,'contato só por aresta não cria sólido único');
}
console.log('geometria: todos os testes passaram');

