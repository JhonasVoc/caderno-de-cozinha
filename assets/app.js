// Caderno de Cozinha: página inicial, login, Minhas receitas, Descubra e Vídeos.
// Os dados vêm de window.Store (assets/store.js): Supabase quando configurado, senão modo demonstração.
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const view = $('#view');
  const S = window.Store;
  const videos = S.videos;
  let vCat = '';
  const filters = { minhas: { cat: '', q: '' }, descubra: { cat: '', q: '' } };
  const cache = { minhas: null, descubra: null };
  const servings = {};
  const timers = {};
  let lastTab = 'descubra';
  let renderSeq = 0;
  let editing = null; // { id (null = nova), draft, section, dirty }
  let flash = '';     // mensagem mostrada na próxima receita aberta

  const UNITS = { '': '', g: 'g', kg: 'kg', ml: 'ml', l: 'l', tsp: 'col. chá', tbsp: 'col. sopa', cup: 'xíc.', pinch: 'pitada' };
  const unitLabel = u => UNITS[u] ?? u;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const FRACS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
  const cap = s => { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const isSection = i => String(i.name || '').startsWith('## ');
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

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
  const loading = () => { view.innerHTML = '<div class="empty"><strong>Abrindo o caderno…</strong></div>'; };
  const errorBox = e => { view.innerHTML = `<div class="empty"><strong>Não foi possível carregar.</strong><span>${esc(e.message)}</span><button class="btn" id="retry">Tentar de novo</button></div>`; $('#retry').onclick = route; };
  async function list(tab) { if (!cache[tab]) cache[tab] = await (tab === 'minhas' ? S.mine() : S.discover()); return cache[tab]; }
  const invalidate = () => { cache.minhas = cache.descubra = null; };

  /* ---------- conta (canto superior direito) ---------- */
  function renderAcct() {
    const u = S.user(), el = $('#acct');
    if (!u) { el.innerHTML = '<button class="btn" id="enter">Entrar</button>'; $('#enter').onclick = openLogin; return; }
    el.innerHTML = `<button class="avatar" id="avatar" aria-haspopup="true" aria-expanded="false" aria-label="Sua conta, @${esc(u.username)}">${esc(u.username.charAt(0).toUpperCase())}</button>
      <div class="menu" id="acctMenu" hidden><span class="who">@${esc(u.username)}</span><a href="#minhas">Minhas receitas</a><button type="button" id="signOut">Sair</button></div>`;
    const btn = $('#avatar'), menu = $('#acctMenu');
    btn.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
    menu.onclick = e => e.stopPropagation();
    menu.querySelector('a').onclick = () => { menu.hidden = true; };
    $('#signOut').onclick = async () => { menu.hidden = true; await S.signOut(); location.hash = ''; };
  }
  document.addEventListener('click', () => { const m = $('#acctMenu'); if (m && !m.hidden) { m.hidden = true; $('#avatar').setAttribute('aria-expanded', 'false'); } });

  /* ---------- login ---------- */
  const dlg = $('#login');
  let sentTo = '';
  const loginMsg = (t, err) => { const m = $('#loginMsg'); m.textContent = t || ''; m.classList.toggle('err', !!err); };
  function loginStep(n) { $('#loginStep1').hidden = n !== 1; $('#loginStep2').hidden = n !== 2; loginMsg(''); }
  function openLogin() {
    loginStep(1); $('#email').value = ''; $('#code').value = '';
    if (!S.online) loginMsg('Modo demonstração: qualquer opção entra com uma conta de teste.');
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
  }
  const busy = async (btn, fn) => { btn.disabled = true; try { await fn(); } catch (e) { loginMsg(e.message, true); } finally { btn.disabled = false; } };
  $('#loginClose').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  $('#googleBtn').onclick = e => busy(e.currentTarget, () => S.signInGoogle());
  $('#appleBtn').onclick = e => {
    if (!S.appleEnabled) return loginMsg('O login com Apple chega em breve. Por enquanto, use Google ou e-mail.', true);
    busy(e.currentTarget, () => S.signInApple());
  };
  $('#email').addEventListener('input', () => loginMsg(''));
  $('#emailForm').onsubmit = e => {
    e.preventDefault();
    const email = $('#email').value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return loginMsg('Digite um e-mail válido.', true);
    busy(e.submitter || $('#emailForm .cont'), async () => {
      await S.sendCode(email); sentTo = email; $('#sentTo').textContent = email; loginStep(2);
      if (!S.online) loginMsg('Modo demonstração: digite qualquer código de 6 dígitos.');
      $('#code').focus();
    });
  };
  $('#code').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); loginMsg(''); });
  $('#codeForm').onsubmit = e => {
    e.preventDefault();
    const code = $('#code').value;
    if (code.length !== 6) return loginMsg('O código tem 6 dígitos.', true);
    busy(e.submitter || $('#codeForm .cont'), () => S.verifyCode(sentTo, code));
  };
  $('#otherEmail').onclick = () => loginStep(1);

  // Só redesenha quando quem está logado muda (renovação de sessão em segundo plano não conta).
  let lastUserId = undefined;
  S.onChange(() => {
    const uid = S.user() ? S.user().id : null;
    if (uid === lastUserId) return;
    lastUserId = uid;
    invalidate(); renderAcct();
    if (S.user() && dlg.open) dlg.close();
    route();
  });

  /* ---------- roteamento ---------- */
  function setTab(tab) {
    $('#tabs').hidden = !tab;
    document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const u = S.user();
    if (editing && h !== 'nova' && !h.startsWith('editar-')) editing.previewing = false;
    if (h === 'videos') { setTab('videos'); return renderVideos(); }
    if (h === 'descubra') { lastTab = 'descubra'; setTab('descubra'); return renderGrid('descubra'); }
    if (h.startsWith('r-')) { setTab(lastTab); return renderRecipe(h.slice(2)); }
    if (h === 'nova' || h.startsWith('editar-')) {
      if (!u) { setTab(null); renderLanding(); return openLogin(); }
      setTab(null); return openEditor(h === 'nova' ? null : h.slice(7));
    }
    if (u && (h === 'minhas' || h === '')) { lastTab = 'minhas'; setTab('minhas'); return renderGrid('minhas'); }
    setTab(null);
    renderLanding();
    if (h === 'minhas') openLogin();
  }
  window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });

  /* ---------- página inicial (sem login) ---------- */
  async function renderLanding() {
    document.title = 'Caderno de Cozinha';
    const seq = ++renderSeq;
    const feats = [['+', 'Crie', 'receitas e técnicas do seu jeito'], ['✎', 'Edite', 'quando quiser, quantas vezes quiser'], ['⚖', 'Ajuste', 'as porções e as medidas se ajustam'], ['↗', 'Compartilhe', 'com amigos e a comunidade']];
    view.innerHTML = `
      <section class="hero">
        <span class="k">seu caderno de receitas</span>
        <h2>Sua cozinha, do seu jeito.</h2>
        <p>Crie suas próprias receitas, edite como quiser, ajuste as porções e compartilhe com amigos e a comunidade.</p>
        <div class="feats">${feats.map(f => `<div class="feat"><span class="ic" aria-hidden="true">${f[0]}</span><b>${f[1]}</b><span>${f[2]}</span></div>`).join('')}</div>
        <div class="cta"><button class="btn primary lg" id="start">Criar meu caderno</button><a class="btn lg" href="#descubra">Explorar receitas da comunidade</a></div>
      </section>
      <section class="trending"><span class="k">em alta na comunidade</span><div class="grid" id="trend"><p class="status">Carregando…</p></div></section>`;
    $('#start').onclick = () => S.user() ? (location.hash = 'minhas') : openLogin();
    try {
      const all = await list('descubra'); if (seq !== renderSeq) return;
      const top = [...all].sort((a, b) => (b.likes - a.likes) || ((b.images || []).length ? 1 : 0) - ((a.images || []).length ? 1 : 0)).slice(0, 4);
      $('#trend').innerHTML = top.map(r => card(r, 'descubra')).join('') || '<p class="status">Ainda não há receitas públicas. Seja a primeira pessoa a publicar uma.</p>';
    } catch (e) { if (seq === renderSeq) $('#trend').innerHTML = `<p class="status err">${esc(e.message)}</p>`; }
  }

  /* ---------- Minhas receitas e Descubra ---------- */
  async function renderGrid(tab) {
    const seq = ++renderSeq;
    const mine = tab === 'minhas';
    document.title = (mine ? 'Minhas receitas' : 'Descubra') + ' · Caderno de Cozinha';
    if (!cache[tab]) loading();
    let all;
    try { all = await list(tab); } catch (e) { if (seq === renderSeq) errorBox(e); return; }
    if (seq !== renderSeq) return;
    const f = filters[tab];
    const cats = [...new Set(all.map(r => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    const q = f.q.trim().toLowerCase();
    const shown = all.filter(r => (!f.cat || r.category === f.cat) &&
      (!q || [r.title, r.description, r.category, r.author, ...(r.ingredients || []).map(i => i.name)].join(' ').toLowerCase().includes(q)))
      .sort(mine ? (a, b) => a.title.localeCompare(b.title, 'pt') : (a, b) => (b.likes - a.likes) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')) || a.title.localeCompare(b.title, 'pt'));
    const canImport = mine && S.canImport() && !all.length;
    if (mine && !all.length && !canImport) {
      view.innerHTML = `<div class="empty"><strong>Comece seu caderno</strong><span>Salve receitas da comunidade ou crie as suas.</span><div class="cta"><a class="btn primary" href="#descubra">Explorar receitas</a><button class="btn" id="newR">Nova receita</button></div><p class="status" id="gridMsg" role="status"></p></div>`;
      $('#newR').onclick = () => { location.hash = 'nova'; }; return;
    }
    view.innerHTML = `
      ${mine ? `<div class="list-head"><span class="status">${plural(all.length, 'receita', 'receitas')}</span><button class="btn primary" id="newR">+ Nova receita</button></div>` : ''}
      ${canImport ? `<div class="notice"><span>Importe as ${plural(window.CADERNO.recipes.length, 'receita', 'receitas')} do seu caderno antigo. Elas entram como privadas.</span><button class="btn primary sm" id="imp">Importar</button></div>` : ''}
      <p class="status" id="gridMsg" role="status"></p>
      <div class="filters">
        <input class="search" id="q" type="search" placeholder="${mine ? 'Buscar nas minhas receitas…' : 'Buscar receitas da comunidade…'}" value="${esc(f.q)}" aria-label="Buscar receitas">
        ${cats.length > 1 ? `<div class="chips" role="group" aria-label="Categorias"><button class="chip" data-cat="" aria-pressed="${!f.cat}">Todas (${all.length})</button>${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${f.cat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
      </div>
      <div class="grid" style="margin-top:20px">${shown.map(r => card(r, tab)).join('') || '<p class="status">Nenhuma receita encontrada.</p>'}</div>`;
    const qi = $('#q');
    qi.addEventListener('input', e => { f.q = e.target.value; const pos = qi.selectionStart; renderGrid(tab).then(() => { const n = $('#q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
    view.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { f.cat = b.dataset.cat; renderGrid(tab); }));
    if ($('#newR')) $('#newR').onclick = () => { location.hash = 'nova'; };
    if (flash) { $('#gridMsg').textContent = flash; flash = ''; }
    if ($('#imp')) $('#imp').onclick = async e => {
      e.currentTarget.disabled = true;
      try { const n = await S.importStatic(); invalidate(); await renderGrid('minhas'); $('#gridMsg').textContent = plural(n, 'receita importada', 'receitas importadas') + '.'; }
      catch (err) { $('#gridMsg').textContent = err.message; $('#gridMsg').classList.add('err'); e.currentTarget.disabled = false; }
    };
  }

  function card(r, tab) {
    const img = (r.images || [])[0];
    const n = (r.ingredients || []).filter(i => !isSection(i)).length;
    const tail = tab === 'minhas'
      ? `<span class="vis ${r.isPublic ? 'pub' : ''}">${r.isPublic ? 'pública' : 'privada'}</span>`
      : `<span>por @${esc(r.author)}</span><span>♥ ${r.likes || 0}</span>`;
    return `<a class="card" href="#r-${esc(r.id)}">
      ${img ? `<img class="thumb" src="${esc(img.src)}" alt="" loading="lazy">` : `<div class="ph" aria-hidden="true">${esc((r.title || '?').trim().charAt(0))}</div>`}
      <div class="body">${r.category ? `<span class="cat">${esc(r.category)}</span>` : ''}<h2>${esc(r.title)}</h2>${r.description ? `<p>${esc(r.description)}</p>` : ''}
      <span class="meta">${n} itens · ${(r.steps || []).length} passos${r.scale !== false && r.servings ? ` · ${esc(r.servings)} ${esc(r.yieldLabel || 'porções')}` : ''}</span>
      <span class="meta row">${tail}</span></div></a>`;
  }

  /* ---------- receita ---------- */
  async function renderRecipe(id) {
    const seq = ++renderSeq;
    let r = [...(cache.minhas || []), ...(cache.descubra || [])].find(x => x.id === id);
    if (!r) {
      loading();
      try { r = await S.get(id); } catch (e) { if (seq === renderSeq) errorBox(e); return; }
      if (seq !== renderSeq) return;
    }
    if (!r) { view.innerHTML = `<div class="empty"><strong>Receita não encontrada.</strong><span>Ela pode ter sido apagada ou estar privada.</span><a class="btn" href="#descubra">Ver receitas da comunidade</a></div>`; return; }
    paintRecipe(r);
  }
  function actionsHTML(r) {
    if (r.mine) return `<span class="vis ${r.isPublic ? 'pub' : ''}">${r.isPublic ? 'pública: aparece em Descubra' : 'privada: só você vê'}</span>
      <a class="btn sm" href="#editar-${esc(r.id)}">Editar</a>
      <button class="btn sm" id="vis">${r.isPublic ? 'Tornar privada' : 'Publicar na comunidade'}</button>`;
    return `<span class="by">por @${esc(r.author)}</span>
      <button class="btn sm${r.liked ? ' on' : ''}" id="like" aria-pressed="${!!r.liked}">${r.liked ? '♥' : '♡'} ${r.likes || 0}</button>
      <button class="btn sm" id="save">Salvar no meu caderno</button>`;
  }
  function paintRecipe(r, opts = {}) {
    const { b, s, k } = scaleOf(r);
    view.innerHTML = `
      ${opts.preview
        ? `<div class="notice"><span>Pré-visualização: ainda não foi salva.</span><button class="btn primary sm" id="backEd">Voltar ao editor</button></div>`
        : `<a class="back" href="#${lastTab}">← ${lastTab === 'minhas' ? 'Minhas receitas' : 'Descubra'}</a>`}
      <div class="r-head" style="margin-top:14px">
        ${r.category ? `<span class="cat">${esc(r.category)}</span>` : ''}
        <h2>${esc(r.title || 'Sem título')}</h2>
        ${r.description ? `<p>${esc(r.description)}</p>` : ''}
        ${opts.preview ? '' : `<div class="r-actions">${actionsHTML(r)}</div>`}
        <p class="status" id="rMsg" role="status"></p>
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
      ${r.notes ? `<p class="notes" style="margin-top:28px"><b>Notas:</b> ${esc(r.notes).replace(/\n/g, '<br>')}</p>` : ''}
      ${r.source ? `<p class="status" style="margin-top:12px">Fonte: ${esc(r.source)}</p>` : ''}`;
    const set = v => { servings[r.id] = Math.max(1, v); paintRecipe(r, opts); };
    if (opts.preview) $('#backEd').onclick = () => { editing.previewing = false; renderEditor(); window.scrollTo(0, 0); };
    if ($('#sm')) $('#sm').onclick = () => set(s - 1);
    if ($('#sp')) $('#sp').onclick = () => set(s + 1);
    if ($('#sr')) $('#sr').onclick = () => set(b);
    view.querySelectorAll('.timer').forEach(bt => { bt.onclick = () => toggleTimer(bt.dataset.key, Number(bt.dataset.tot)); });
    view.querySelectorAll('.gallery img').forEach(im => { im.onclick = () => { $('#zoomImg').src = im.src; try { $('#zoom').showModal(); } catch (e) { } }; });
    const msg = (t, err) => { const m = $('#rMsg'); m.textContent = t; m.classList.toggle('err', !!err); };
    const act = (id, fn) => { const el = $(id); if (el) el.onclick = async () => { if (!S.user()) return openLogin(); el.disabled = true; try { await fn(); } catch (e) { msg(e.message, true); el.disabled = false; } }; };
    act('#vis', async () => { await S.setPublic(r.id, !r.isPublic); r.isPublic = !r.isPublic; cache.descubra = null; paintRecipe(r); msg(r.isPublic ? 'Publicada: agora aparece em Descubra.' : 'Agora só você vê esta receita.'); });
    act('#like', async () => { await S.toggleLike(r); r.liked = !r.liked; r.likes = (r.likes || 0) + (r.liked ? 1 : -1); paintRecipe(r); });
    act('#save', async () => { await S.saveCopy(r); cache.minhas = null; msg('Salva em Minhas receitas como privada.'); });
    if (flash && !opts.preview) { msg(flash); flash = ''; }
    document.title = (opts.preview ? 'Pré-visualização' : r.title) + ' · Caderno de Cozinha';
  }

  /* ---------- editor ---------- */
  async function openEditor(id) {
    if (editing && editing.id !== id && editing.dirty && !confirm('Você tem alterações não salvas em outra receita. Descartar?')) {
      location.hash = editing.id ? 'editar-' + editing.id : 'nova'; return;
    }
    if (!editing || editing.id !== id) {
      let r = null;
      if (id) {
        const seq = ++renderSeq; loading();
        try { r = [...(cache.minhas || [])].find(x => x.id === id) || await S.get(id); } catch (e) { if (seq === renderSeq) errorBox(e); return; }
        if (seq !== renderSeq) return;
        if (!r || !r.mine) { view.innerHTML = `<div class="empty"><strong>Você só pode editar as suas receitas.</strong><a class="btn" href="#minhas">Minhas receitas</a></div>`; return; }
      }
      editing = { id, draft: Editor.fromRecipe(r), section: 'basico', dirty: false, previewing: false };
    }
    editing.previewing ? showPreview() : renderEditor();
  }
  function renderEditor() {
    ++renderSeq;
    const ed = editing;
    document.title = (ed.id ? 'Editar receita' : 'Nova receita') + ' · Caderno de Cozinha';
    const cats = [...new Set((cache.minhas || []).map(r => r.category).filter(Boolean))];
    Editor.mount(view, {
      draft: ed.draft, section: ed.section, isNew: !ed.id, categories: cats,
      onDirty: () => { ed.dirty = true; },
      upload: blob => S.uploadImage(blob),
      onPreview: () => { ed.section = 'notas'; ed.previewing = true; showPreview(); window.scrollTo(0, 0); },
      onCancel: () => {
        if (ed.dirty && !confirm('Descartar as alterações?')) return;
        editing = null; location.hash = ed.id ? 'r-' + ed.id : 'minhas';
      },
      onSave: async (recipe, isPublic) => {
        let id = ed.id;
        if (id) await S.update(id, recipe, isPublic); else id = await S.create(recipe, isPublic);
        editing = null; invalidate(); lastTab = 'minhas';
        flash = ed.id ? 'Alterações salvas.' : (isPublic ? 'Receita salva e publicada em Descubra.' : 'Receita salva. Só você vê.');
        location.hash = 'r-' + id;
      },
      onDelete: async () => {
        if (!confirm(`Apagar “${ed.draft.title || 'esta receita'}”? Isso não pode ser desfeito.`)) return;
        await S.remove(ed.id, ed.draft.images.map(im => im.src));
        editing = null; invalidate(); flash = 'Receita apagada.'; location.hash = 'minhas';
      }
    });
  }
  function showPreview() {
    ++renderSeq;
    const { recipe } = Editor.toRecipe(editing.draft);
    paintRecipe({ ...recipe, id: 'preview' }, { preview: true });
  }
  window.addEventListener('beforeunload', e => { if (editing && editing.dirty) { e.preventDefault(); e.returnValue = ''; } });
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
    ++renderSeq;
    document.title = 'Vídeos · Caderno de Cozinha';
    if (!videos.length) { view.innerHTML = `<div class="empty"><strong>Nenhum vídeo salvo ainda.</strong><span>Adicione um arquivo em videos/ e rode npm run build.</span></div>`; return; }
    const cats = [...new Set(videos.map(v => v.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
    const shown = videos.filter(v => !vCat || v.category === vCat);
    view.innerHTML = `${cats.length > 1 ? `<div class="chips" role="group" aria-label="Categorias de vídeo" style="margin-bottom:20px"><button class="chip" data-cat="" aria-pressed="${!vCat}">Todos</button>${cats.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${vCat === c}">${esc(c)}</button>`).join('')}</div>` : ''}
      <div class="vlist">${shown.map(v => {
        const u = safeUrl(v.url), yt = /youtu\.?be/.test(hostOf(v.url));
        return `<article class="vcard">
          <a class="play" href="${esc(u)}" target="_blank" rel="noopener" aria-label="Assistir ${esc(v.title)}"><span class="tri" aria-hidden="true"></span><span class="src">${yt ? 'YouTube' : esc(hostOf(v.url))}</span></a>
          <div class="body">${v.category ? `<span class="cat">${esc(v.category)}</span>` : ''}<h2>${esc(v.title || 'Vídeo sem título')}</h2>${v.note ? `<p>${esc(v.note)}</p>` : ''}
            <div class="acts"><a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">Assistir ↗</a></div></div></article>`;
      }).join('')}</div>`;
    view.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { vCat = b.dataset.cat; renderVideos(); }));
  }

  /* ---------- início ---------- */
  $('#demoBanner').hidden = S.online;
  $('#emailLogin').hidden = !S.emailEnabled;
  renderAcct();
  loading();
  S.init().then(() => { lastUserId = S.user() ? S.user().id : null; renderAcct(); route(); }).catch(e => { errorBox(e); });
})();
