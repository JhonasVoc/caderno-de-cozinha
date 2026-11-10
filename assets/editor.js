// Editor de receitas do Caderno de Cozinha: Básico, Ingredientes, Passos e Notas.
// Trabalha sobre um "rascunho" (draft) que o app guarda; só vira receita (formato de recipes/) ao salvar.
// Nos passos, ingredientes aparecem como {nome}; ao salvar viram {id}, como no formato do caderno.
(function () {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const UNIT_OPTS = [['', '—'], ['g', 'g'], ['kg', 'kg'], ['ml', 'ml'], ['l', 'l'], ['tsp', 'c. chá'], ['tbsp', 'c. sopa'], ['cup', 'xícara'], ['pinch', 'pitada']];
  const UNIT_SHORT = { '': '', g: 'g', kg: 'kg', ml: 'ml', l: 'l', tsp: 'col. chá', tbsp: 'col. sopa', cup: 'xíc.', pinch: 'pitada' };
  const DEFAULT_CATS = ['Bolos', 'Caldos', 'Churrasco', 'Doces', 'Embutidos', 'Frituras', 'Fundos', 'Molhos', 'Peixe cru', 'Pratos', 'Salgados', 'Sushi', 'Técnicas', 'Temperos'];
  const SECTIONS = [['basico', 'Básico', 'Básico'], ['ingredientes', 'Ingred.', 'Ingredientes'], ['passos', 'Passos', 'Passos'], ['notas', 'Notas', 'Notas']];
  const MANAGED = ['title', 'category', 'description', 'servings', 'yieldLabel', 'scale', 'ingredients', 'steps', 'notes', 'source', 'images', 'updatedAt',
    'id', 'owner', 'author', 'isPublic', 'likes', 'liked', 'mine', 'createdAt', 'demoCopy'];

  /* ---------- quantidades ---------- */
  const FR = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };
  const round = n => Math.round(n * 1000) / 1000;
  function parseAmount(t) {
    t = String(t ?? '').trim().replace(',', '.');
    if (!t) return '';
    let m;
    if (FR[t] != null) return round(FR[t]);
    if ((m = t.match(/^(\d+)\s*([½¼¾⅓⅔⅛])$/))) return round(+m[1] + FR[m[2]]);
    if ((m = t.match(/^(\d+)\s+(\d+)\/(\d+)$/)) && +m[3]) return round(+m[1] + m[2] / m[3]);
    if ((m = t.match(/^(\d+)\/(\d+)$/)) && +m[2]) return round(m[1] / m[2]);
    if (/^(\d+(\.\d+)?|\.\d+)$/.test(t)) return round(+t);
    return NaN;
  }
  const amtText = a => (a === '' || a == null) ? '' : String(a).replace('.', ',');

  /* ---------- colar lista ---------- */
  const UNIT_WORDS = [
    ['tbsp', ['colheres de sopa', 'colher de sopa', 'colheres sopa', 'colher sopa', 'col. de sopa', 'col. sopa', 'col sopa', 'c. sopa', 'c sopa', 'cs', 'tbsp']],
    ['tsp', ['colheres de chá', 'colher de chá', 'colheres de cha', 'colher de cha', 'col. de chá', 'col. chá', 'col chá', 'col cha', 'c. chá', 'c chá', 'c cha', 'cc', 'tsp']],
    ['cup', ['xícaras', 'xícara', 'xicaras', 'xicara', 'xíc.', 'xíc', 'xic.', 'xic', 'cups', 'cup']],
    ['pinch', ['pitadas', 'pitada']],
    ['kg', ['quilos', 'quilo', 'kg']],
    ['g', ['gramas', 'grama', 'gr', 'g']],
    ['ml', ['mililitros', 'ml']],
    ['l', ['litros', 'litro', 'l']]
  ].flatMap(([u, ws]) => ws.map(w => [w, u])).sort((a, b) => b[0].length - a[0].length)
    .map(([w, u]) => [new RegExp('^' + w.replace(/[.]/g, '\\.') + '(?=$|[\\s.])', 'i'), u]);
  function parseLines(text) {
    const out = [];
    for (let line of String(text || '').split(/\r?\n/)) {
      line = line.replace(/^\s*[-•*·]\s*/, '').trim();
      if (!line) continue;
      if (/^#/.test(line) || /:$/.test(line)) { out.push({ group: true, name: line.replace(/^#+\s*/, '').replace(/:$/, '').trim() }); continue; }
      const m = line.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛])?\s*(.*)$/);
      const q = (m[1] || '').trim();
      let rest = m[2], unit = '';
      if (q) for (const [re, u] of UNIT_WORDS) { const mm = rest.match(re); if (mm) { unit = u; rest = rest.slice(mm[0].length).replace(/^\.?\s*/, ''); break; } }
      rest = rest.replace(/^(de|do|da|of)\s+/i, '').trim();
      out.push({ amountText: q.replace('.', ','), unit, name: rest || line });
    }
    return out;
  }

  /* ---------- rascunho <-> receita ---------- */
  function fromRecipe(r) {
    r = r || {};
    const ings = (r.ingredients || []).map(i => String(i.name || '').startsWith('## ')
      ? { id: String(i.id), group: true, name: i.name.slice(3) }
      : { id: String(i.id), name: i.name || '', amountText: amtText(i.amount), unit: i.unit || '' });
    const byId = {}; ings.forEach(i => { if (!i.group) byId[i.id] = i; });
    const steps = (r.steps || []).map(s => ({
      title: s.title || '', timer: Number(s.timer) || 0,
      content: String(s.content || '').replace(/\{(\w+)\}/g, (m, id) => byId[id] ? '{' + byId[id].name + '}' : m)
    }));
    const extra = {}; Object.keys(r).forEach(k => { if (!MANAGED.includes(k)) extra[k] = r[k]; });
    return {
      title: r.title || '', category: r.category || '', description: r.description || '',
      servings: Number(r.servings) || 1, yieldLabel: r.yieldLabel || '', scale: r.scale !== false,
      ingredients: ings, steps, notes: r.notes || '', source: r.source || '',
      images: (r.images || []).map(im => ({ src: im.src, caption: im.caption || '' })),
      isPublic: !!r.isPublic, extra
    };
  }
  function toRecipe(d) {
    const errors = [];
    if (!d.title.trim()) errors.push({ section: 'basico', field: 'title', msg: 'Dê um nome à receita.' });
    const ings = [];
    d.ingredients.forEach((i, ix) => {
      if (i.group) { if (i.name.trim()) ings.push({ id: i.id, name: '## ' + i.name.trim(), amount: '', unit: '' }); return; }
      if (!i.name.trim()) return;
      const a = parseAmount(i.amountText);
      if (Number.isNaN(a)) errors.push({ section: 'ingredientes', idx: ix, msg: `Quantidade inválida em “${i.name.trim()}”. Use números como 2, 0,5 ou 1/2.` });
      ings.push({ id: i.id, name: i.name.trim(), amount: Number.isNaN(a) ? '' : a, unit: i.unit || '' });
    });
    const byName = {};
    ings.forEach(i => { if (!i.name.startsWith('## ')) { const k = i.name.toLowerCase(); if (!(k in byName)) byName[k] = i.id; } });
    const steps = d.steps.filter(s => s.title.trim() || s.content.trim()).map(s => {
      const o = { title: s.title.trim(), content: s.content.trim().replace(/\{([^{}\n]+)\}/g, (m, n) => { const id = byName[n.trim().toLowerCase()]; return id != null ? '{' + id + '}' : n; }) };
      if (s.timer > 0) o.timer = Math.round(s.timer);
      return o;
    });
    const recipe = {
      ...d.extra, title: d.title.trim(), category: d.category.trim(), description: d.description.trim(),
      servings: Math.max(1, Math.round(Number(d.servings) || 1)), yieldLabel: d.yieldLabel.trim() || 'porções', scale: !!d.scale,
      ingredients: ings, steps, notes: d.notes.trim(),
      images: d.images.filter(im => im.src).map(im => im.caption.trim() ? { src: im.src, caption: im.caption.trim() } : { src: im.src })
    };
    if (d.source.trim()) recipe.source = d.source.trim();
    return { recipe, errors };
  }
  function nextId(d) {
    const used = new Set(d.ingredients.map(i => String(i.id)));
    let n = d.ingredients.reduce((mx, i) => Math.max(mx, parseInt(i.id, 10) || 0), 0) + 1;
    while (used.has(String(n))) n++;
    return String(n);
  }

  /* ---------- fotos ---------- */
  function shrink(file, max = 1600) {
    return new Promise((res, rej) => {
      if (!/^image\//.test(file.type || 'image/')) return rej(new Error('Escolha um arquivo de imagem.'));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? res(b) : rej(new Error('Não foi possível ler a foto.')), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(`Não foi possível abrir “${file.name}”. Use JPG ou PNG.`)); };
      img.src = url;
    });
  }

  /* ---------- tela ---------- */
  function mount(view, ctx) {
    const d = ctx.draft;
    let sec = ctx.section || 'basico';
    let showNewCat = !!d.category && !ctx.categories.concat(DEFAULT_CATS).includes(d.category);
    const dirty = () => ctx.onDirty();
    view.innerHTML = '<div class="editor" id="ed"></div>';
    const wrap = view.querySelector('#ed');
    const q = s => wrap.querySelector(s);
    const msg = (t, err) => { const m = q('#edMsg'); if (m) { m.textContent = t || ''; m.classList.toggle('err', !!err); } };
    const ingName = i => i.name.trim();
    const refNames = () => [...new Set(d.ingredients.filter(i => !i.group && ingName(i)).map(ingName))];

    function previewHTML(content) {
      if (!/\{[^{}\n]+\}/.test(content)) return '';
      const map = {}; d.ingredients.forEach(i => { if (!i.group && ingName(i)) { const k = ingName(i).toLowerCase(); if (!(k in map)) map[k] = i; } });
      const html = esc(content).replace(/\{([^{}\n]+)\}/g, (m, n) => {
        const i = map[n.trim().toLowerCase()];
        if (!i) return `<span class="ref-miss" title="Não há ingrediente com esse nome">${n}</span>`;
        const a = i.amountText.trim(), u = UNIT_SHORT[i.unit] || '';
        return `<b class="ref">${esc(a ? (u ? a + ' ' + u + ' de ' : a + ' ') : '')}${esc(ingName(i))}</b>`;
      }).replace(/\n/g, '<br>');
      return '<span class="k">fica assim</span> ' + html;
    }

    const T = {
      basico() {
        const cats = [...new Set([...ctx.categories, ...DEFAULT_CATS])].sort((a, b) => a.localeCompare(b, 'pt'));
        return `
        <div class="ed-field"><span class="k">fotos</span>
          <div class="ed-photos">${d.images.map((im, ix) => `<figure class="ed-ph"><img src="${esc(im.src)}" alt="">
            <button type="button" class="x" data-act="delImg" data-im="${ix}" aria-label="Remover foto ${ix + 1}">×</button>${ix === 0 ? '<span class="cover">capa</span>' : ''}
            <input class="field sm" data-im="${ix}" value="${esc(im.caption)}" placeholder="Legenda (opcional)" aria-label="Legenda da foto ${ix + 1}"></figure>`).join('')}
            <label class="ed-add-photo"><input type="file" accept="image/*" multiple id="edFiles" hidden><span class="plus" aria-hidden="true">+</span><span>Adicionar fotos</span></label>
          </div><p class="status" id="photoMsg" role="status"></p></div>
        <label class="ed-field"><span class="k">título</span><input class="field" data-f="title" value="${esc(d.title)}" placeholder="Molho bechamel" autocomplete="off"><span class="err-msg" id="errTitle"></span></label>
        <div class="ed-field"><span class="k">categoria</span>
          <div class="chips">${cats.map(c => `<button type="button" class="chip" data-act="cat" data-cat="${esc(c)}" aria-pressed="${d.category === c}">${esc(c)}</button>`).join('')}<button type="button" class="chip ac" data-act="newcat" aria-pressed="${showNewCat}">+ nova</button></div>
          ${showNewCat ? `<input class="field" id="newCat" value="${esc(cats.includes(d.category) ? '' : d.category)}" placeholder="Nome da nova categoria" aria-label="Nova categoria">` : ''}</div>
        <label class="ed-field"><span class="k">descrição curta</span><textarea class="field" rows="2" data-f="description" placeholder="Uma ou duas frases que aparecem no cartão.">${esc(d.description)}</textarea></label>
        <div class="ed-field"><span class="k">rendimento</span>
          <div class="ed-yield"><div class="stepper"><button type="button" data-act="srv-" aria-label="Menos">−</button><output>${d.servings}</output><button type="button" data-act="srv+" aria-label="Mais">+</button></div>
          <input class="field" data-f="yieldLabel" value="${esc(d.yieldLabel)}" placeholder="porções" aria-label="Unidade do rendimento (porções, fatias, receita…)"></div></div>
        <label class="switch-row"><span>Ajustar porções na receita</span><input type="checkbox" class="switch" data-f="scale" ${d.scale ? 'checked' : ''}></label>
        <span class="hint">Desligue para técnicas sem rendimento fixo.</span>`;
      },
      ingredientes() {
        return `
        <div class="ed-paste"><b>Colar lista</b><span class="hint">Cole do jeito que você anota, um por linha. Eu separo quantidade, unidade e nome. Uma linha terminada em “:” vira grupo.</span>
          <textarea class="field mono" id="pasteBox" rows="4" placeholder="16g manteiga&#10;2 col sopa farinha&#10;400ml leite&#10;sal a gosto"></textarea>
          <button type="button" class="btn sm" data-act="parse">Adicionar à lista</button></div>
        ${d.ingredients.length ? `<div class="ing-row head" aria-hidden="true"><span></span><span>qtd</span><span>unid.</span><span>ingrediente</span><span></span></div>` : ''}
        <div class="ed-list" data-list="ing">${d.ingredients.map((i, ix) => i.group
          ? `<div class="ing-row grp" data-idx="${ix}"><span class="grip" title="Arraste para mudar a ordem" aria-hidden="true">⠿</span><input class="field grp-name" data-i="${ix}" data-k="name" value="${esc(i.name)}" placeholder="Nome do grupo (ex.: Cobertura)" aria-label="Nome do grupo"><button type="button" class="x" data-act="delIng" data-i="${ix}" aria-label="Remover grupo">×</button></div>`
          : `<div class="ing-row" data-idx="${ix}"><span class="grip" title="Arraste para mudar a ordem" aria-hidden="true">⠿</span>
              <input class="field mono" data-i="${ix}" data-k="amountText" value="${esc(i.amountText)}" inputmode="decimal" placeholder="—" aria-label="Quantidade">
              <select class="field" data-i="${ix}" data-k="unit" aria-label="Unidade">${UNIT_OPTS.map(([v, l]) => `<option value="${v}"${v === i.unit ? ' selected' : ''}>${l}</option>`).join('')}</select>
              <input class="field" data-i="${ix}" data-k="name" value="${esc(i.name)}" placeholder="ingrediente" aria-label="Ingrediente">
              <button type="button" class="x" data-act="delIng" data-i="${ix}" aria-label="Remover ingrediente">×</button></div>`).join('')}</div>
        ${d.ingredients.length ? '' : '<p class="hint">Nenhum ingrediente ainda. Cole uma lista acima ou adicione um por um.</p>'}
        <div class="row2"><button type="button" class="add" data-act="addIng">+ Ingrediente</button><button type="button" class="add" data-act="addGrp">+ Grupo</button></div>
        <span class="hint">Sem quantidade (ex.: “sal a gosto”)? Deixe a quantidade vazia. Medidas como lata ou dente vão no nome, com unidade “—”.</span>`;
      },
      passos() {
        const names = refNames();
        return `<div class="ed-list" data-list="step">${d.steps.map((s, ix) => `
          <div class="step-card" data-idx="${ix}">
            <div class="step-top"><span class="grip" title="Arraste para mudar a ordem" aria-hidden="true">⠿</span><span class="num">${ix + 1}</span>
              <input class="field" data-s="${ix}" data-k="title" value="${esc(s.title)}" placeholder="Título curto (ex.: Fazer o roux)" aria-label="Título do passo ${ix + 1}">
              <button type="button" class="x" data-act="delStep" data-s="${ix}" aria-label="Remover passo ${ix + 1}">×</button></div>
            <textarea class="field" rows="3" data-s="${ix}" data-k="content" placeholder="O que fazer neste passo…" aria-label="Texto do passo ${ix + 1}">${esc(s.content)}</textarea>
            <div class="ref-prev" id="prev${ix}">${previewHTML(s.content)}</div>
            ${names.length ? `<span class="k">inserir ingrediente</span><div class="chips">${names.map(n => `<button type="button" class="chip" data-act="ins" data-s="${ix}" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
            ${(s.timer > 0 || s._timerOn) ? `<div class="timer-row"><span>⏱ Timer</span>
              <input class="field mono" data-s="${ix}" data-k="min" value="${Math.floor(s.timer / 60)}" inputmode="numeric" aria-label="Minutos"><span class="hint">min</span>
              <input class="field mono" data-s="${ix}" data-k="sec" value="${s.timer % 60}" inputmode="numeric" aria-label="Segundos"><span class="hint">s</span>
              <button type="button" class="x" data-act="delTimer" data-s="${ix}" aria-label="Remover timer">×</button></div>`
            : `<div><button type="button" class="chip" data-act="addTimer" data-s="${ix}">+ timer</button></div>`}
          </div>`).join('')}</div>
        ${d.steps.length ? '' : '<p class="hint">Nenhum passo ainda.</p>'}
        <button type="button" class="add" data-act="addStep">+ Passo</button>
        <span class="hint">Toque num ingrediente para citá-lo no texto: na receita ele aparece com a quantidade já ajustada às porções.</span>`;
      },
      notas() {
        return `
        <label class="ed-field"><span class="k">notas e dicas</span><textarea class="field" rows="5" data-f="notes" placeholder="Dicas, variações, substituições…">${esc(d.notes)}</textarea></label>
        <label class="ed-field"><span class="k">fonte (opcional)</span><input class="field" data-f="source" value="${esc(d.source)}" placeholder="livro, site, vídeo, pessoa…"></label>
        <div class="ed-field"><span class="k">quem vê esta receita</span>
          <label class="opt"><input type="radio" name="vis" value="0" ${d.isPublic ? '' : 'checked'}><span><b>Privada</b><br><span class="hint">Só você vê.</span></span></label>
          <label class="opt"><input type="radio" name="vis" value="1" ${d.isPublic ? 'checked' : ''}><span><b>Pública</b><br><span class="hint">Aparece em Descubra com o seu @.</span></span></label></div>
        <div class="row2"><button type="button" class="btn" data-act="preview">Pré-visualizar</button><button type="button" class="btn primary" data-act="save">Salvar receita</button></div>
        ${ctx.isNew ? '' : '<button type="button" class="btn danger del" data-act="delete">Apagar receita</button>'}`;
      }
    };

    function render() {
      ctx.section = sec;
      wrap.innerHTML = `
        <div class="ed-head"><button type="button" class="linkbtn" data-act="cancel">Cancelar</button><span class="t">${ctx.isNew ? 'Nova receita' : 'Editar receita'}</span><button type="button" class="btn primary sm" data-act="save">Salvar</button></div>
        <div class="seg" role="tablist" aria-label="Partes da receita">${SECTIONS.map(([k, l, full]) => `<button type="button" role="tab" aria-selected="${k === sec}" aria-label="${full}" data-act="sec" data-sec="${k}">${l}</button>`).join('')}</div>
        <p class="status" id="edMsg" role="status" aria-live="polite"></p>
        <div class="ed-body">${T[sec]()}</div>`;
    }
    const focusLast = sel => { const els = wrap.querySelectorAll(sel); if (els.length) els[els.length - 1].focus(); };

    async function save() {
      const { recipe, errors } = toRecipe(d);
      if (errors.length) {
        sec = errors[0].section; render();
        errors.forEach(e => {
          if (e.field === 'title') { q('#errTitle').textContent = e.msg; q('[data-f="title"]').focus(); }
          if (e.idx != null) { const row = wrap.querySelector(`.ing-row[data-idx="${e.idx}"]`); if (row) row.classList.add('err'); }
        });
        msg(errors.map(e => e.msg).join(' '), true); return;
      }
      wrap.querySelectorAll('[data-act="save"]').forEach(b => { b.disabled = true; });
      msg('Salvando…');
      try { await ctx.onSave(recipe, d.isPublic); }
      catch (e) { msg(e.message, true); wrap.querySelectorAll('[data-act="save"]').forEach(b => { b.disabled = false; }); }
    }

    wrap.addEventListener('input', e => {
      const t = e.target;
      if (t.dataset.f) { d[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; if (t.dataset.f === 'title') q('#errTitle').textContent = ''; return dirty(); }
      if (t.id === 'newCat') { d.category = t.value; wrap.querySelectorAll('[data-act="cat"]').forEach(b => b.setAttribute('aria-pressed', 'false')); return dirty(); }
      if (t.dataset.im != null) { d.images[+t.dataset.im].caption = t.value; return dirty(); }
      if (t.dataset.i != null) {
        const ing = d.ingredients[+t.dataset.i], k = t.dataset.k;
        if (k === 'name' && !ing.group && ing.name) d.steps.forEach(s => { s.content = s.content.split('{' + ing.name + '}').join('{' + t.value + '}'); });
        ing[k] = t.value; t.closest('.ing-row').classList.remove('err'); return dirty();
      }
      if (t.dataset.s != null) {
        const s = d.steps[+t.dataset.s], k = t.dataset.k;
        if (k === 'min' || k === 'sec') {
          const row = t.closest('.timer-row');
          s.timer = Math.max(0, (parseInt(row.querySelector('[data-k="min"]').value, 10) || 0) * 60 + (parseInt(row.querySelector('[data-k="sec"]').value, 10) || 0));
        } else s[k] = t.value;
        if (k === 'content') { const p = q('#prev' + t.dataset.s); if (p) p.innerHTML = previewHTML(s.content); }
        return dirty();
      }
    });

    wrap.addEventListener('change', async e => {
      const t = e.target;
      if (t.name === 'vis') { d.isPublic = t.value === '1'; return dirty(); }
      if (t.id !== 'edFiles') return;
      const files = [...t.files]; t.value = '';
      if (!files.length) return;
      q('#photoMsg').textContent = files.length > 1 ? `Enviando ${files.length} fotos…` : 'Enviando a foto…';
      let ok = 0, err = '';
      for (const f of files) {
        try { const url = await ctx.upload(await shrink(f)); d.images.push({ src: url, caption: '' }); ok++; dirty(); }
        catch (x) { err = x.message; }
      }
      if (sec !== 'basico') return;
      render();
      const pm = q('#photoMsg');
      pm.textContent = err || (ok === 1 ? 'Foto adicionada.' : `${ok} fotos adicionadas.`);
      pm.classList.toggle('err', !!err);
    });

    wrap.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
      const a = b.dataset.act, i = +b.dataset.i, s = +b.dataset.s;
      switch (a) {
        case 'sec': sec = b.dataset.sec; render(); window.scrollTo(0, 0); break;
        case 'cancel': ctx.onCancel(); break;
        case 'save': save(); break;
        case 'preview': ctx.onPreview(); break;
        case 'delete':
          b.disabled = true;
          try { await ctx.onDelete(); } catch (x) { msg(x.message, true); }
          b.disabled = false; break;
        case 'cat': d.category = d.category === b.dataset.cat ? '' : b.dataset.cat; showNewCat = false; dirty(); render(); break;
        case 'newcat': showNewCat = !showNewCat; if (showNewCat) d.category = ''; render(); if (showNewCat) q('#newCat').focus(); break;
        case 'srv-': d.servings = Math.max(1, (+d.servings || 1) - 1); dirty(); render(); break;
        case 'srv+': d.servings = (+d.servings || 1) + 1; dirty(); render(); break;
        case 'addIng': d.ingredients.push({ id: nextId(d), name: '', amountText: '', unit: '' }); dirty(); render(); focusLast('.ing-row:not(.grp) [data-k="amountText"]'); break;
        case 'addGrp': d.ingredients.push({ id: nextId(d), group: true, name: '' }); dirty(); render(); focusLast('.grp-name'); break;
        case 'delIng': d.ingredients.splice(i, 1); dirty(); render(); break;
        case 'parse': {
          const rows = parseLines(q('#pasteBox').value);
          if (!rows.length) { msg('Cole pelo menos uma linha na caixa.', true); break; }
          rows.forEach(r => d.ingredients.push({ id: nextId(d), ...r }));
          dirty(); render(); msg(rows.length === 1 ? '1 item adicionado. Confira abaixo.' : `${rows.length} itens adicionados. Confira abaixo.`); break;
        }
        case 'addStep': d.steps.push({ title: '', content: '', timer: 0 }); dirty(); render(); focusLast('.step-card [data-k="title"]'); break;
        case 'delStep': d.steps.splice(s, 1); dirty(); render(); break;
        case 'ins': {
          const ta = wrap.querySelector(`textarea[data-s="${s}"]`), st = d.steps[s];
          const tok = '{' + b.dataset.name + '}';
          const p0 = ta.selectionStart ?? ta.value.length, p1 = ta.selectionEnd ?? p0;
          const before = ta.value.slice(0, p0), sp = before && !/\s$/.test(before) ? ' ' : '';
          ta.value = before + sp + tok + ta.value.slice(p1);
          st.content = ta.value; dirty();
          const pos = p0 + sp.length + tok.length; ta.focus(); ta.setSelectionRange(pos, pos);
          q('#prev' + s).innerHTML = previewHTML(st.content); break;
        }
        case 'addTimer': d.steps[s]._timerOn = true; render(); { const el = wrap.querySelector(`[data-s="${s}"][data-k="min"]`); if (el) { el.focus(); el.select(); } } break;
        case 'delTimer': d.steps[s].timer = 0; d.steps[s]._timerOn = false; dirty(); render(); break;
        case 'delImg': d.images.splice(+b.dataset.im, 1); dirty(); render(); break;
      }
    });

    // Arrastar pela alça (⠿) para reordenar ingredientes e passos; funciona com dedo e mouse.
    wrap.addEventListener('pointerdown', e => {
      const g = e.target.closest('.grip'); if (!g) return;
      const list = g.closest('[data-list]'), row = g.closest('[data-idx]'); if (!list || !row) return;
      e.preventDefault(); g.setPointerCapture(e.pointerId); row.classList.add('dragging');
      const move = ev => {
        for (const r of [...list.children]) {
          if (r === row) continue;
          const bx = r.getBoundingClientRect();
          if (ev.clientY < bx.top + bx.height / 2) { if (r.previousElementSibling !== row) list.insertBefore(row, r); return; }
        }
        if (list.lastElementChild !== row) list.appendChild(row);
      };
      const up = () => {
        g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
        row.classList.remove('dragging');
        const arr = list.dataset.list === 'ing' ? d.ingredients : d.steps;
        const order = [...list.children].map(r => +r.dataset.idx);
        if (order.some((v, k) => v !== k)) { const copy = order.map(k => arr[k]); arr.splice(0, arr.length, ...copy); dirty(); }
        render();
      };
      g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    });

    render();
  }

  window.Editor = { fromRecipe, toRecipe, mount, parseLines, parseAmount };
})();
