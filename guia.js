// Guia interativo: um passo a passo que destaca cada parte da tela e explica o que ela faz.
// Abre sozinho na primeira visita e pelo botão "Guia" no topo do painel. Não depende do editor:
// só lê o DOM, então pode ser mantido à parte.
(function () {
  'use strict';
  const NOME = 'Esquadro';
  const CHAVE_VISTO = 'esquadro-guia-visto';

  // Cada passo: alvo (seletores; o destaque cobre todos), título e texto. Sem alvo, o cartão
  // aparece no meio da tela. Passos cujo alvo está escondido são pulados.
  const PASSOS = [
    {
      titulo: `Bem-vindo ao ${NOME}`,
      texto: 'Aqui você monta casas, muros e construções empilhando formas geométricas que se encaixam pelos vértices. Este guia mostra o essencial em um minuto; use as setas do teclado ou os botões abaixo.',
    },
    {
      alvo: ['[data-secao="formas"]'],
      titulo: 'Criar formas',
      texto: 'Um clique cria a forma no centro da vista: triângulo, quadrado, pentágono, hexágono, octógono ou círculo. Em "Outro", escolha qualquer número de lados, de 3 a 48. Toda forma nasce com 32 px por lado.',
    },
    {
      alvo: ['#vista'],
      titulo: 'Mover, esticar e encaixar',
      texto: 'Arraste uma forma para movê-la: quando um vértice chega perto de outro, as duas se encaixam e passam a andar juntas. Com Shift, o encaixe prefere empilhar. Os quadrados brancos esticam em X e Y; o círculo na diagonal dá espessura. Um duplo clique num vértice deixa arrastá-lo para qualquer ponto e deforma a peça em 3D.',
    },
    {
      alvo: ['.segmentos[aria-label="Vista"]'],
      titulo: 'Vistas e câmera',
      texto: 'Jogo é a vista oblíqua de jogo em grade; Topo mostra a planta; Iso, a isométrica. Segure o botão da roda e arraste para girar livremente, gire a roda para aproximar e arraste o fundo para andar pela cena.',
    },
    {
      alvo: ['.eixo-giro'],
      titulo: 'Eixo de giro',
      texto: 'Escolha X, Y ou Z antes de rotacionar. O giro de 90°, 180° ou 270° fica no menu do botão direito (ou na tecla R). Girar em X ou Y deita a peça de lado: um prisma triangular vira rampa ou telhado.',
    },
    {
      alvo: ['#ferramenta-cor', '#ferramenta-filtro'],
      titulo: 'Cor e filtro',
      texto: 'A amostra colorida pinta as formas marcadas com qualquer cor (paleta ou hexadecimal). O funil esconde e mostra formas por cor, para trabalhar por partes, como o telhado ou o interior.',
    },
    {
      alvo: ['#ferramenta-regua'],
      titulo: 'Régua',
      texto: 'Ligue a régua (ou tecle M) e clique em dois vértices: aparece a distância em 3D, em px e em tiles, com as diferenças em X, Y e Z.',
    },
    {
      alvo: ['#op-vertices', '#op-grade', '#op-angulos', '#op-mostrar-grade'],
      subir: true,
      titulo: 'Assistentes',
      texto: 'Liga e desliga, nesta ordem: o encaixe entre vértices, o encaixe na grade (vértices e meio dos lados), a trava do giro em múltiplos de 45° e a grade do chão, com tiles de 64 px.',
    },
    {
      alvo: ['[data-secao="selecao"]'],
      titulo: 'Seleção',
      texto: 'Clique numa forma para marcá-la (em azul); com Ctrl, marque várias. Aqui ficam a posição e o tamanho exatos, em X, Y e Z, e os botões de separar do grupo, duplicar e excluir.',
    },
    {
      alvo: ['#ferramenta-vazar'],
      titulo: 'Vazar pela face',
      texto: 'Encoste uma face de um bloco na parede e selecione o bloco como molde. Este botão (ou Vazar pela face no menu do botão direito) abre um vão na outra peça. Mova o molde para ver a abertura; Ctrl+Z desfaz. O contorno deve caber por inteiro dentro da face da parede.',
    },
    {
      alvo: ['#vista'],
      titulo: 'Menu do botão direito',
      texto: 'Numa forma: copiar, duplicar, selecionar desacoplado, salvar na biblioteca, mesclar (as formas que se encostam viram uma só, inclusive paredes com vão), recortar área (marque vértices com Shift+clique), rotacionar e definir cor. No fundo: colar e recentralizar.',
    },
    {
      alvo: ['[data-secao="biblioteca"]'],
      titulo: 'Biblioteca',
      texto: 'Salve peças com nome pelo menu do botão direito e coloque cópias no desenho com um clique (ou arrastando a miniatura). Os botões do rodapé exportam e importam a biblioteca como arquivo.',
    },
    {
      alvo: ['[data-secao="personagens"]'],
      titulo: 'Personagens',
      texto: 'Coloque sprites de personagens na cena, em escala real, para comparar as proporções com os blocos. Eles não entram no encaixe nem na cena salva.',
    },
    {
      alvo: ['#salvar-cena', '#carregar-cena', '#limpar'],
      titulo: 'Salvar e carregar',
      texto: 'Salve a cena (Ctrl+S), carregue outra (Ctrl+O) ou comece uma nova. O nome da cena aparece ao lado, com um ponto azul quando há mudanças não salvas. A borda direita do painel pode ser arrastada para alargá-lo.',
    },
    {
      alvo: ['#abrir-ajuda', '#abrir-guia'],
      titulo: 'Ajuda e guia',
      texto: 'O ponto de interrogação (ou a tecla ?) lista todos os atalhos. Este guia volta pelo botão ao lado. Bom trabalho!',
    },
  ];

  let passos = [], atual = 0, raiz = null;

  const visivel = (el) => !!el && el.getClientRects().length > 0 && !el.closest('[hidden]');
  const elementos = (p) => (p.alvo || []).map((s) => document.querySelector(s)).filter(Boolean)
    .map((el) => (p.subir ? el.closest('label') || el : el));

  function montar() {
    raiz = document.createElement('div');
    raiz.className = 'guia';
    raiz.innerHTML = `
      <div class="guia-fundo"></div>
      <div class="guia-destaque"></div>
      <div class="guia-cartao" role="dialog" aria-modal="true" aria-labelledby="guia-titulo">
        <div class="guia-passo"></div>
        <h2 id="guia-titulo"></h2>
        <p></p>
        <div class="guia-botoes">
          <button type="button" class="guia-pular">Pular guia</button>
          <span class="guia-espaco"></span>
          <button type="button" class="guia-voltar">Voltar</button>
          <button type="button" class="guia-proximo primario">Próximo</button>
        </div>
      </div>`;
    document.body.append(raiz);
    raiz.querySelector('.guia-pular').addEventListener('click', fechar);
    raiz.querySelector('.guia-voltar').addEventListener('click', () => ir(atual - 1));
    raiz.querySelector('.guia-proximo').addEventListener('click', () => (atual === passos.length - 1 ? fechar() : ir(atual + 1)));
  }

  function posicionar() {
    if (!raiz || raiz.hidden) return;
    const p = passos[atual];
    const destaque = raiz.querySelector('.guia-destaque');
    const cartao = raiz.querySelector('.guia-cartao');
    const els = elementos(p).filter(visivel);
    const W = window.innerWidth, H = window.innerHeight;
    if (!els.length) {
      destaque.hidden = true;
      raiz.querySelector('.guia-fundo').hidden = false;
      cartao.style.left = Math.round((W - cartao.offsetWidth) / 2) + 'px';
      cartao.style.top = Math.round((H - cartao.offsetHeight) / 2) + 'px';
      return;
    }
    raiz.querySelector('.guia-fundo').hidden = true;
    const rs = els.map((el) => el.getBoundingClientRect());
    const m = 6;
    const r = {
      left: Math.max(4, Math.min(...rs.map((q) => q.left)) - m),
      top: Math.max(4, Math.min(...rs.map((q) => q.top)) - m),
      right: Math.min(W - 4, Math.max(...rs.map((q) => q.right)) + m),
      bottom: Math.min(H - 4, Math.max(...rs.map((q) => q.bottom)) + m),
    };
    Object.assign(destaque.style, { left: r.left + 'px', top: r.top + 'px', width: r.right - r.left + 'px', height: r.bottom - r.top + 'px' });
    destaque.hidden = false;
    // O cartão vai onde couber: à direita, embaixo, à esquerda, em cima ou, se o alvo for grande, dentro dele.
    const cw = cartao.offsetWidth, ch = cartao.offsetHeight, g = 14;
    const opcoes = [
      [r.right + g, r.top, r.right + g + cw <= W],
      [r.left, r.bottom + g, r.bottom + g + ch <= H],
      [r.left - g - cw, r.top, r.left - g - cw >= 0],
      [r.left, r.top - g - ch, r.top - g - ch >= 0],
    ];
    const [x, y] = (opcoes.find((o) => o[2]) || [r.left + 24, r.top + 24]);
    cartao.style.left = Math.round(Math.max(8, Math.min(x, W - cw - 8))) + 'px';
    cartao.style.top = Math.round(Math.max(8, Math.min(y, H - ch - 8))) + 'px';
  }

  function ir(i) {
    if (i < 0 || i >= passos.length) return;
    atual = i;
    const p = passos[i];
    // Abre a seção recolhida que contém o alvo e rola o painel até ele.
    for (const el of elementos(p)) {
      const sec = el.closest('details');
      if (sec && !sec.open && !sec.hidden) sec.open = true;
    }
    const primeiro = elementos(p).find(visivel);
    if (primeiro && primeiro.closest('.rolagem')) primeiro.scrollIntoView({ block: 'nearest' });
    raiz.querySelector('.guia-passo').textContent = `${i + 1} de ${passos.length}`;
    raiz.querySelector('#guia-titulo').textContent = p.titulo;
    raiz.querySelector('.guia-cartao p').textContent = p.texto;
    raiz.querySelector('.guia-voltar').disabled = i === 0;
    raiz.querySelector('.guia-proximo').textContent = i === passos.length - 1 ? 'Concluir' : 'Próximo';
    posicionar(); // já com o texto novo (o tamanho do cartão muda)
    requestAnimationFrame(posicionar); // de novo, depois que a seção aberta e a rolagem assentarem
    raiz.querySelector('.guia-proximo').focus({ preventScroll: true });
  }

  function abrir() {
    if (!raiz) montar();
    // Só os passos cujo alvo existe e aparece (ou que não têm alvo).
    passos = PASSOS.filter((p) => !p.alvo || elementos(p).some((el) => !el.closest('[hidden]')));
    raiz.hidden = false;
    ir(0);
  }

  function fechar() {
    if (raiz) raiz.hidden = true;
    try { localStorage.setItem(CHAVE_VISTO, '1'); } catch (e) { /* sem armazenamento */ }
  }

  window.addEventListener('resize', posicionar);
  // Com o guia aberto, as teclas são dele: setas andam, Esc fecha, o editor não recebe nada.
  window.addEventListener('keydown', (ev) => {
    if (!raiz || raiz.hidden) return;
    ev.stopImmediatePropagation();
    if (ev.key === 'Escape') { ev.preventDefault(); fechar(); }
    else if (ev.key === 'ArrowRight' || ev.key === 'Enter') { ev.preventDefault(); atual === passos.length - 1 ? fechar() : ir(atual + 1); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); ir(atual - 1); }
  }, true);

  document.getElementById('abrir-guia').addEventListener('click', abrir);
  let visto = false;
  try { visto = localStorage.getItem(CHAVE_VISTO) === '1'; } catch (e) { visto = true; }
  if (!visto) setTimeout(abrir, 500);
  window.GuiaBlocos = { abrir, fechar };
})();
