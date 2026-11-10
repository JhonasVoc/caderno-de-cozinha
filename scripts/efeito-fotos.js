// Efeito "cores arrastadas" (light painting) das fotos da página inicial: fundo de pedra escura,
// uma faixa curva feita das cores da própria foto esticadas, e o prato nítido num círculo no centro.
// Roda no navegador: dragArt(urlDaFoto, { fx, fy, zoom, curve, w, h }) devolve um <canvas>.
// fx/fy = centro do prato na foto (0 a 1); zoom aproxima; curve = 4 pontos da curva em S.
window.dragArt = async function (src, o = {}) {
  const W = o.w || 1200, H = o.h || 1500;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');

  // 1. pedra escura com luz suave e granulado
  g.fillStyle = '#0c1114'; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W * .62, H * .42, 40, W * .62, H * .42, W * .95);
  rg.addColorStop(0, '#3a3f45'); rg.addColorStop(.45, '#1d2328'); rg.addColorStop(1, '#0a0e10');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  const n = g.getImageData(0, 0, W, H), d = n.data;
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let p = 0; p < d.length; p += 4) { const v = (rnd() - .5) * 22; d[p] += v; d[p + 1] += v; d[p + 2] += v; }
  g.putImageData(n, 0, 0);
  // veios da pedra
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1.2;
  for (let k = 0; k < 5; k++) { g.beginPath(); let x = rnd() * W, y = rnd() * H; g.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (rnd() - .3) * 160; y += (rnd() - .5) * 120; g.lineTo(x, y); } g.stroke(); }

  // 2. faixa de cores arrastadas: colunas da foto esticadas na horizontal (slit-scan)
  const RW = 1600, RH = 260;
  const r = document.createElement('canvas'); r.width = RW; r.height = RH;
  const rc = r.getContext('2d');
  const segs = 28, fx = o.fx ?? .5, fy = o.fy ?? .5, span = o.span ?? .5;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const sx = Math.min(iw - 1, Math.max(0, iw * (fx + (t - .5) * span)));
    const sy0 = ih * Math.max(0, fy - .3), sh = ih * .6;
    rc.globalAlpha = i === 0 ? 1 : .55;
    rc.drawImage(img, sx, sy0, 1, sh, (i - 1) * RW / (segs - 1), 0, RW / (segs - 1) * 2.2, RH);
  }
  rc.globalAlpha = 1;
  // brilho: realça as cores e escurece as bordas da faixa
  rc.globalCompositeOperation = 'overlay';
  const lg = rc.createLinearGradient(0, 0, 0, RH);
  lg.addColorStop(0, 'rgba(0,0,0,.9)'); lg.addColorStop(.35, 'rgba(255,255,255,.35)'); lg.addColorStop(.5, 'rgba(255,255,255,.6)'); lg.addColorStop(.65, 'rgba(255,255,255,.35)'); lg.addColorStop(1, 'rgba(0,0,0,.9)');
  rc.fillStyle = lg; rc.fillRect(0, 0, RW, RH);
  rc.globalCompositeOperation = 'source-over';

  // desenha a faixa ao longo de uma curva em S, afinando nas pontas
  const P = o.curve || [[-.15, .02], [.35, .28], [.65, .72], [1.15, .98]];
  const pt = t => { const u = 1 - t; const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [k.reduce((a, kk, j) => a + kk * P[j][0], 0) * W, k.reduce((a, kk, j) => a + kk * P[j][1], 0) * H]; };
  const steps = 900;
  g.save(); g.filter = 'blur(1.2px)';
  for (let i = 0; i < steps; i++) {
    const t = i / steps, [x, y] = pt(t), [x2, y2] = pt(Math.min(1, t + 1 / steps));
    const ang = Math.atan2(y2 - y, x2 - x), thick = (o.thick || 300) * (.25 + .75 * Math.sin(Math.PI * t));
    g.save(); g.translate(x, y); g.rotate(ang);
    g.drawImage(r, t * RW, 0, Math.max(1, RW / steps * 3), RH, -2, -thick / 2, Math.hypot(x2 - x, y2 - y) + 4, thick);
    g.restore();
  }
  g.restore();

  // 3. o prato nítido num círculo, com sombra
  const R = (o.r || .34) * W, cx = W * (o.cx ?? .5), cy = H * (o.cy ?? .5);
  g.save(); g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = 70; g.shadowOffsetY = 24;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill(); g.restore();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  const z = o.zoom || 1, sc = Math.max(2 * R / iw, 2 * R / ih) * z;
  g.drawImage(img, cx - iw * sc * fx, cy - ih * sc * fy, iw * sc, ih * sc);
  // leve reflexo de vidro
  const hl = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  hl.addColorStop(0, 'rgba(255,255,255,.14)'); hl.addColorStop(.4, 'rgba(255,255,255,0)');
  g.fillStyle = hl; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  g.restore();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3; g.stroke();
  return c;
};
