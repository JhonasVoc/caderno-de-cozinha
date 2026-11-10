// Camada de dados do Caderno de Cozinha: contas e receitas.
// Com o Supabase configurado em assets/config.js, usa o banco (tabelas em supabase/schema.sql).
// Sem configuração, roda em "modo demonstração": login simulado, receitas de recipes/ e nada é salvo.
(function () {
  'use strict';
  const CFG = window.CADERNO_CONFIG || {};
  const DATA = window.CADERNO || { recipes: [], videos: [] };
  const ONLINE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const SB_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  const listeners = new Set();
  let user = null; // { id, username, demo? }
  const emit = () => listeners.forEach(f => { try { f(user); } catch (e) { console.error(e); } });

  const staticRecipes = () => (DATA.recipes || []).filter(r => !r.draft);
  const META = ['id', 'owner', 'author', 'isPublic', 'likes', 'liked', 'mine', 'createdAt', 'demoCopy'];
  const strip = r => { const o = { ...r }; META.forEach(k => delete o[k]); return o; };
  const slugify = s => String(s || 'receita').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'receita';
  const here = () => location.origin + location.pathname;

  /* ---------- modo demonstração ---------- */
  function demoStore() {
    const author = CFG.demoAuthor || 'jhonas';
    const st = new Map(); // id -> { isPublic, likes, liked }
    const copies = [];
    const s = id => { if (!st.has(id)) st.set(id, { isPublic: true, likes: 0, liked: false }); return st.get(id); };
    const view = r => ({ ...r, author: r.author || author, isPublic: s(r.id).isPublic, likes: s(r.id).likes, liked: s(r.id).liked, mine: !!user && (r.author || author) === user.username });
    const all = () => [...staticRecipes(), ...copies];
    const login = async () => { user = { id: 'demo', username: author, demo: true }; emit(); };
    return {
      async init() { },
      signInGoogle: login, signInApple: login,
      async sendCode(email) { if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Digite um e-mail válido.'); },
      async verifyCode() { await login(); },
      async signOut() { user = null; emit(); },
      async mine() { return user ? all().map(view).filter(r => r.mine) : []; },
      async discover() { return all().map(view).filter(r => r.isPublic); },
      async get(id) { const r = all().find(x => x.id === id); return r ? view(r) : null; },
      async setPublic(id, v) { s(id).isPublic = !!v; },
      async toggleLike(r) { const x = s(r.id); x.liked = !x.liked; x.likes += x.liked ? 1 : -1; },
      async saveCopy(r) { const id = slugify(r.title) + '-copia-' + (copies.length + 1); copies.push({ ...strip(r), id, author: user.username, source: 'Receita de @' + r.author }); s(id).isPublic = false; return id; },
      canImport() { return false; },
      async importStatic() { return 0; }
    };
  }

  /* ---------- Supabase ---------- */
  function supabaseStore() {
    let sb = null;
    const loadScript = src => new Promise((res, rej) => {
      const el = document.createElement('script'); el.src = src; el.onload = res;
      el.onerror = () => rej(new Error('Não foi possível carregar o Supabase. Verifique a conexão.'));
      document.head.appendChild(el);
    });
    const fail = (error, msg) => { if (error) { console.error(error); throw new Error(msg || error.message || 'Algo deu errado. Tente de novo.'); } };
    const fromRow = row => ({ ...(row.data || {}), id: row.id, owner: row.owner, author: row.username, isPublic: !!row.is_public, likes: row.likes || 0, liked: !!row.liked, mine: !!user && row.owner === user.id, createdAt: row.created_at });

    async function setSession(session) {
      if (!session) { user = null; return; }
      if (user && user.id === session.user.id) return;
      const { data } = await sb.from('profiles').select('username').eq('id', session.user.id).maybeSingle();
      user = { id: session.user.id, username: (data && data.username) || 'voce' };
    }

    return {
      async init() {
        await loadScript(SB_SRC);
        sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });
        const { data: { session } } = await sb.auth.getSession();
        await setSession(session);
        if (/[?&](code|error)=/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash);
        // Chamadas ao Supabase dentro do callback travam a sessão; por isso o setTimeout.
        sb.auth.onAuthStateChange((_e, s) => setTimeout(() => setSession(s).then(emit), 0));
      },
      async signInGoogle() { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: here() } }); fail(error, 'Não foi possível entrar com o Google.'); },
      async signInApple() { const { error } = await sb.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: here() } }); fail(error, 'Não foi possível entrar com a Apple.'); },
      async sendCode(email) {
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Digite um e-mail válido.');
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: here() } });
        fail(error, error && error.status === 429 ? 'Muitas tentativas. Espere um minuto e tente de novo.' : 'Não foi possível enviar o código.');
      },
      async verifyCode(email, token) {
        const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
        fail(error, 'Código inválido ou expirado. Confira o e-mail ou peça outro.');
        await setSession(data.session); emit();
      },
      async signOut() { await sb.auth.signOut(); user = null; emit(); },
      async mine() {
        if (!user) return [];
        const { data, error } = await sb.from('recipe_feed').select('*').eq('owner', user.id);
        fail(error, 'Não foi possível carregar suas receitas.'); return data.map(fromRow);
      },
      async discover() {
        const { data, error } = await sb.from('recipe_feed').select('*').eq('is_public', true).order('created_at', { ascending: false }).limit(300);
        fail(error, 'Não foi possível carregar as receitas da comunidade.'); return data.map(fromRow);
      },
      async get(id) {
        if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
        const { data, error } = await sb.from('recipe_feed').select('*').eq('id', id).maybeSingle();
        fail(error, 'Não foi possível abrir a receita.'); return data ? fromRow(data) : null;
      },
      async setPublic(id, v) {
        const { error } = await sb.from('recipes').update({ is_public: !!v, updated_at: new Date().toISOString() }).eq('id', id);
        fail(error, 'Não foi possível mudar a visibilidade.');
      },
      async toggleLike(r) {
        const q = r.liked
          ? sb.from('recipe_likes').delete().eq('recipe_id', r.id).eq('user_id', user.id)
          : sb.from('recipe_likes').insert({ recipe_id: r.id, user_id: user.id });
        const { error } = await q; fail(error, 'Não foi possível registrar a curtida.');
      },
      async saveCopy(r) {
        const data = { ...strip(r), source: 'Receita de @' + r.author, updatedAt: new Date().toISOString() };
        const { data: row, error } = await sb.from('recipes').insert({ owner: user.id, slug: slugify(r.title) + '-' + Date.now().toString(36), data, is_public: false }).select('id').single();
        fail(error, 'Não foi possível salvar no seu caderno.'); return row.id;
      },
      canImport() { return !!user && !!CFG.ownerId && user.id === CFG.ownerId && staticRecipes().length > 0; },
      async importStatic() {
        const rows = staticRecipes().map(r => ({ owner: user.id, slug: r.id, data: strip(r), is_public: false }));
        const { error } = await sb.from('recipes').upsert(rows, { onConflict: 'owner,slug', ignoreDuplicates: true });
        fail(error, 'Não foi possível importar as receitas.'); return rows.length;
      }
    };
  }

  const impl = ONLINE ? supabaseStore() : demoStore();
  window.Store = {
    online: ONLINE,
    appleEnabled: ONLINE ? !!CFG.appleEnabled : true,
    videos: DATA.videos || [],
    user: () => user,
    onChange(fn) { listeners.add(fn); },
    ...impl
  };
})();
