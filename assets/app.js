// Caderno de Cozinha: site estático que lê window.CADERNO (gerado em data/caderno.js).
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const view = $('#view');
  const DATA = window.CADERNO || { recipes: [], videos: [] };
  const recipes = DATA.recipes.filter(r => !r.draft);
  const videos = DATA.videos || [];
  let filterCat = '', query = '', vCat = '';
  const servings = {};
  const timers = {};

  const UNITS = { '': '', g: 'g', kg: 'kg', ml: 'ml', l: 'l', tsp: 'col. chá', tbsp: 'col. sopa', cup: 'xíc.', pinch: 'pitada' };
  const unitLabel = u => UNITS[u] ?? u;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const FRACS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
  const cap = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const isSection = i => String(i.name || '').startsWith('## ');

  function fmtAmt(a, u) {
    if (a == null || a === '') return '';
    const n = Number(a);
    if (!isFinite(n)) return String(a);
    if (['cup', 'tsp', 'tbsp', ''].includes(u || '') && n > 0) {
      let w = Math.floor(n + 1e-9); const f = n - w;
      const hit = FRACS.find(x => Math.abs(x[0] - f) < 0.04);
      if (hit) {
        if (hit[0] === 1) return String(w + 1);
        if (!hit[1]) return String(w);
        return w ? w + ' ' + hit[1] : hit[1];
      }
    }
    return (n < 1 ? nf2 : nf).format(Math.round(n * 100) / 100);
  }
  function scaleOf(r) { const b = Number(r.servings) || 1; const s = servings[r.id] ?? b; return { b, s, k: r.scale === false ? 1 : s / b }; }
  function ingText(i, k) {
    const amt = fmtAmt(i.amount != null && i.amount !== '' ? Number(i.amount) * k : '', i.unit);
    const u = i.unit ? unitLabel(i.unit) : '';
    return { amt: amt ? (u ? amt + ' ' + u : amt) : '', name: i.name || '' };
  }
  function stepHTML(r, txt, k) {
    const map = {}; (r.ingredients || []).forEach(i => { map[String(i.id)] = i; });
    return esc(txt).replace(/\{([A-Za-z0-9]+)\}/g, (m, id) => {
      const i = map[id]; if (!i) return m;
      const t = ingText(i, k);
      return '<b>' + (t.amt ? esc(t.amt) + (i.unit ? ' de ' : ' ') : '') + esc(t.name) + '</b>';
    }).replace(/\n/g, '<br>');
  }
  const fmtTime = sec => { sec = Math.max(0, Math.round(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); };

  /* ---------- roteamento ---------- */
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const isV = h === 'videos';
    $('#tabR').toggleAttribute('aria-current', !isV); if (!isV) $('#tabR').setAttribute('aria-current', 'page');
    $('#tabV').toggleAttribute('aria-current', isV); if (isV) $('#tabV').setAttribute('aria-current', 'page');
    if (isV) return renderVideos();
    if (h.startsWith('r-')) { const r = recipes.find(x => x.id === h.slice(2)); if (r) return renderRecipe(r); }
    renderList();
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

  /* ---------- índice ---------- */
  function renderList() {
    document.title = 'Caderno de Cozinha';
    if (!recipes.length) {
      view.innerHTML = `<div class="empty"><strong>Nenhuma receita encontrada.</strong><span>Rode <code>npm run build</code> para gerar data/caderno.js.</span></div>`;
      return;
    }
    const cats = [...new Set(recipes.map(r => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    const q = query.trim().toLowerCase();
    const list = recipes.filter(r => (!filterCat || r.category === filterCat) &&
      (!q || [r.title, r.description, r.category, ...(r.ingredients || []).map(i => i.name)].join(' ').toLowerCase().includes(q)));
    view.innerHTML = `
      <div class="filters">
        <input class="search" id="q" type="search" placeholder="Buscar por nome ou ingrediente…" value="${esc(query)}" aria-label="Buscar receitas">
        ${cats.length > 1 ? `<div class="chips" role="group" aria-label="Categorias"><button class="chip" data-cat="" aria-pressed="${!filterCat}">Todas (${recipes.length})</button>${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${filterCat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="grid" style="margin-top:20px">${list.map(card).join('') || '<p class="status">Nenhuma receita encontrada.</p>'}</div>`;
    const qi = $('#q');
    qi.addEventListener('input', e => { query = e.target.value; const pos = qi.selectionStart; renderList(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); });
    view.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { filterCat = b.dataset.cat; renderList(); }));
  }
  function card(r) {
    const img = (r.images || [])[0];
    const n = (r.ingredients || []).filter(i => !isSection(i)).length;
    return `<a class="card" href="#r-${esc(r.id)}">
      ${img ? `<img class="thumb" src="${esc(img.src)}" alt="" loading="lazy">` : `<div class="ph" aria-hidden="true">${esc((r.title || '?').trim().charAt(0))}</div>`}
      <div class="body">${r.category ? `<span class="cat">${esc(r.category)}</span>` : ''}<h2>${esc(r.title)}</h2>${r.description ? `<p>${esc(r.description)}</p>` : ''}
      <span class="meta">${n} itens · ${(r.steps || []).length} passos${r.scale !== false && r.servings ? ` · ${esc(r.servings)} ${esc(r.yieldLabel || 'porções')}` : ''}</span></div></a>`;
  }

  /* ---------- receita ---------- */
  function renderRecipe(r) {
    const { b, s, k } = scaleOf(r);
    view.innerHTML = `
      <a class="back" href="#">← Todas as receitas</a>
      <div class="r-head" style="margin-top:14px">
        ${r.category ? `<span class="cat">${esc(r.category)}</span>` : ''}
        <h2>${esc(r.title)}</h2>
        ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      </div>
      ${(r.images || []).length ? `<div class="gallery" style="margin-top:24px">${r.images.map(im => `<figure><img src="${esc(im.src)}" alt="${esc(im.caption || r.title)}" loading="lazy">${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
      <div class="cols" style="margin-top:28px">
        <section class="panel"><h3>Ingredientes${r.scale === false ? ' e utensílios' : ''}</h3>
          <div class="ing">
            ${r.scale !== false ? `<div class="serv"><span class="lbl">${esc(cap(r.yieldLabel || 'porções'))}</span><div class="stepper"><button type="button" id="sm" aria-label="Menos">−</button><output id="sv">${s}</output><button type="button" id="sp" aria-label="Mais">+</button></div>${s !== b ? `<button class="btn sm ghost" id="sr">voltar a ${b}</button>` : ''}</div>` : ''}
            <ul>${(r.ingredients || []).map(i => { if (isSection(i)) return `<li class="sec">${esc(i.name.slice(3))}</li>`; const t = ingText(i, k); return `<li><span class="amt">${esc(t.amt)}</span><span>${esc(t.name)}</span></li>`; }).join('')}</ul>
          </div>
        </section>
        <section class="panel"><h3>Passo a passo</h3>
          <ol class="steps">${(r.steps || []).map((st, ix) => {
            const key = r.id + ':' + ix, tm = timers[key], tot = Number(st.timer) || 0;
            return `<li><div class="st">${st.title ? `<b class="t">${esc(st.title)}</b>` : ''}<div class="c">${stepHTML(r, st.content || '', k)}</div>
            ${tot ? `<button type="button" class="timer${tm && tm.run ? ' run' : ''}${tm && tm.left <= 0 ? ' done' : ''}" data-key="${esc(key)}" data-tot="${tot}">${tm && tm.left <= 0 ? '✓ pronto' : (tm && tm.run ? '❚❚ ' : '▶ ') + fmtTime(tm ? tm.left : tot)}</button>` : ''}</div></li>`;
          }).join('')}</ol>
        </section>
      </div>
      ${r.notes ? `<p class="notes" style="margin-top:28px"><b>Notas:</b> ${esc(r.notes).replace(/\n/g, '<br>')}</p>` : ''}`;
    const set = v => { servings[r.id] = Math.max(1, v); renderRecipe(r); };
    if ($('#sm')) $('#sm').onclick = () => set(s - 1);
    if ($('#sp')) $('#sp').onclick = () => set(s + 1);
    if ($('#sr')) $('#sr').onclick = () => set(b);
    view.querySelectorAll('.timer').forEach(bt => { bt.onclick = () => toggleTimer(bt.dataset.key, Number(bt.dataset.tot)); });
    view.querySelectorAll('.gallery img').forEach(im => { im.onclick = () => { $('#zoomImg').src = im.src; try { $('#zoom').showModal(); } catch (e) { } }; });
    document.title = r.title + ' · Caderno de Cozinha';
  }
  $('#zoom').addEventListener('click', () => $('#zoom').close());

  /* ---------- timers ---------- */
  let actx = null;
  function beep() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(t => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.2, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t + 0.3);
        o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.3);
      });
    } catch (e) { }
  }
  function toggleTimer(key, tot) {
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
    let t = timers[key];
    if (!t || t.left <= 0) t = timers[key] = { left: tot, run: false, end: 0 };
    if (t.run) { t.run = false; t.left = (t.end - Date.now()) / 1000; clearInterval(t.id); }
    else {
      t.run = true; t.end = Date.now() + t.left * 1000;
      t.id = setInterval(() => { t.left = (t.end - Date.now()) / 1000; if (t.left <= 0) { t.left = 0; t.run = false; clearInterval(t.id); beep(); } paint(key, t); }, 250);
    }
    paint(key, t);
  }
  function paint(key, t) {
    const bt = view.querySelector(`.timer[data-key="${CSS.escape(key)}"]`); if (!bt) return;
    bt.classList.toggle('run', t.run); bt.classList.toggle('done', t.left <= 0);
    bt.textContent = t.left <= 0 ? '✓ pronto' : (t.run ? '❚❚ ' : '▶ ') + fmtTime(t.left);
  }

  /* ---------- vídeos ---------- */
  const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } };
  const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  function renderVideos() {
    document.title = 'Vídeos · Caderno de Cozinha';
    if (!videos.length) { view.innerHTML = `<div class="empty"><strong>Nenhum vídeo salvo ainda.</strong><span>Adicione um arquivo em videos/ e rode npm run build.</span></div>`; return; }
    const cats = [...new Set(videos.map(v => v.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    const list = videos.filter(v => !vCat || v.category === vCat);
    view.innerHTML = `${cats.length > 1 ? `<div class="chips" role="group" aria-label="Categorias de vídeo" style="margin-bottom:20px"><button class="chip" data-cat="" aria-pressed="${!vCat}">Todos</button>${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${vCat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="vlist">${list.map(v => {
        const u = safeUrl(v.url), yt = /youtu\.?be/.test(hostOf(v.url));
        return `<article class="vcard">
          <a class="play" href="${esc(u)}" target="_blank" rel="noopener" aria-label="Assistir ${esc(v.title)}"><span class="tri" aria-hidden="true"></span><span class="src">${yt ? 'YouTube' : esc(hostOf(v.url))}</span></a>
          <div class="body">${v.category ? `<span class="cat">${esc(v.category)}</span>` : ''}<h2>${esc(v.title || 'Vídeo sem título')}</h2>${v.note ? `<p>${esc(v.note)}</p>` : ''}
            <div class="acts"><a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">Assistir ↗</a></div></div></article>`;
      }).join('')}</div>`;
    view.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { vCat = b.dataset.cat; renderVideos(); }));
  }

  route();
})();
