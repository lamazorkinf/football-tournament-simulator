// Banco de pruebas del modelo de energía + oficio + prórroga.
//
//   node scripts/simulate-engine.mjs          → los 6 experimentos
//   node scripts/simulate-engine.mjs final    → comparación de alta precisión
//
// Produjo los números de docs/superpowers/specs/2026-07-24-energia-oficio-prorroga-design.md.
//
// OJO: hoy REPLICA el motor (copia fiel de src/core/engine.ts con DEFAULT_CONFIG)
// en vez de importarlo, porque se escribió antes de que el modelo existiera en
// el código. Al implementar la feature debe pasar a importar src/core/engine.ts,
// o las dos copias se van a desincronizar sin que nadie se entere.
import { TEAMS } from './simulate-engine.teams.js';

const CFG = {
  homeAdvantage: 3,
  importance: {
    qualifier: 0.75, continentalEarly: 0.9, continentalLate: 1.2,
    confedGroup: 1.1, confedKnockout: 1.4, wcGroup: 1.25, wcKnockout: 1.6,
  },
};

const F = {
  energyMax: 100, energyMin: 60,
  penaltyPer: 0.2,        // (100 - e) * 0.2  → -8 en el piso
  clutchGain: 0.35,
  costBase: 6, costDifficulty: 4, costTight: 2, costExtraTime: 7, costPenalties: 2,
  depthMax: 0.25,
  recovery: 4, recoveryQualifiers: 8,
  etShare: (30 / 90) * 0.85,
};

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const normSkill = (s) => clamp01((s - 30) / 70);
const normImp = (i) => clamp01(i / 1.6);

const fatiguePenalty = (e) => (100 - e) * F.penaltyPer;
// Dificultad que activa el oficio: qué tan exigente es el partido PARA EL FAVORITO,
// es decir qué tan bueno es el rival más débil, escalado por la instancia.
// Multiplicativa a propósito: una final contra un equipo flojo no es un partido difícil.
const clutchDifficulty = (hs, as_, imp) => normSkill(Math.min(hs, as_)) * (0.6 + 0.4 * normImp(imp));
const oppDifficulty = (oppSkill, imp) => 0.6 * normSkill(oppSkill) + 0.4 * normImp(imp);

// Palancas conmutables para el barrido de sensibilidad.
const OPT = { fatigue: true, clutch: F.clutchGain, extraTime: true, depth: true };

function poisson(lambda) {
  const l = Math.max(0.05, Math.min(4, lambda));
  const limit = Math.exp(-l);
  let goals = -1, product = 1;
  do { goals++; product *= Math.random(); } while (product > limit);
  return Math.min(goals, 7);
}

function penaltyShootout(hs, as_) {
  const hr = 0.75 + (hs / 100) * 0.15, ar = 0.75 + (as_ / 100) * 0.15;
  let h = 0, a = 0, hRem = 5, aRem = 5;
  const decided = () => h > a + aRem || a > h + hRem;
  while (hRem > 0 || aRem > 0) {
    if (hRem > 0) { if (Math.random() < hr) h++; hRem--; if (decided()) break; }
    if (aRem > 0) { if (Math.random() < ar) a++; aRem--; if (decided()) break; }
  }
  while (h === a) { const g1 = Math.random() < hr, g2 = Math.random() < ar; if (g1) h++; if (g2) a++; }
  return { h, a };
}

/**
 * Un partido. mode 'base' = motor actual; mode 'new' = con energía + oficio.
 * knockout=true habilita prórroga (solo en 'new') y penales.
 */
function playMatch({ hs, as_, he = 100, ae = 100, imp = 1, neutral = true, knockout = false, mode = 'new' }) {
  let eh = hs, ea = as_;
  if (mode === 'new' && OPT.fatigue) { eh -= fatiguePenalty(he); ea -= fatiguePenalty(ae); }
  if (!neutral) eh += CFG.homeAdvantage;

  let diff = eh - ea;
  if (mode === 'new') diff *= 1 + clutchDifficulty(hs, as_, imp) * OPT.clutch;

  const lh = 1.5 + diff / 50, la = 1.5 - diff / 50;
  let h = poisson(lh), a = poisson(la);

  let extraTime = false, pens = null;
  if (knockout && h === a) {
    if (mode === 'new' && OPT.extraTime) {
      extraTime = true;
      h += poisson(lh * F.etShare);
      a += poisson(la * F.etShare);
    }
    if (h === a) { const p = penaltyShootout(hs, as_); pens = p; }
  }
  return { h, a, extraTime, pens };
}

/** Costo de energía de un partido para un equipo. */
function energyCost({ skill, oppSkill, imp, tight, extraTime, pens }) {
  let c = F.costBase + F.costDifficulty * oppDifficulty(oppSkill, imp);
  if (tight) c += F.costTight;
  if (extraTime) c += F.costExtraTime;
  if (pens) c += F.costPenalties;
  return c * (1 - (OPT.depth ? F.depthMax : 0) * normSkill(skill));
}

const applyCost = (e, c) => Math.max(F.energyMin, e - c);
const recover = (e, amount) => Math.min(F.energyMax, e + amount);

// ---------------------------------------------------------------- utilidades
const pct = (x, n) => ((100 * x) / n).toFixed(1) + '%';
const fx = (x, d = 1) => x.toFixed(d);
const byName = Object.fromEntries(TEAMS.map((t) => [t.name, t]));
const S = (n) => byName[n].skill;

function line(title) { console.log('\n' + '─'.repeat(78) + '\n' + title + '\n' + '─'.repeat(78)); }

// ============================================================ EXPERIMENTO 1
// Duelos puntuales: cómo cambia la probabilidad de ganar.
function winProb({ hs, as_, he, ae, imp, mode, knockout = true, n = 200000 }) {
  let wins = 0, draws90 = 0, ets = 0, pens = 0;
  for (let i = 0; i < n; i++) {
    const r = playMatch({ hs, as_, he, ae, imp, neutral: true, knockout, mode });
    if (r.extraTime) ets++;
    if (r.pens) pens++;
    if (r.h > r.a) wins++;
    else if (r.h === r.a) { draws90++; if (r.pens && r.pens.h > r.pens.a) wins++; }
    else if (r.pens && r.pens.h > r.pens.a) wins++;
  }
  return { win: wins / n, et: ets / n, pen: pens / n };
}

function exp1() {
  line('EXPERIMENTO 1 — Duelos puntuales (200.000 repeticiones cada uno)');
  const cases = [
    ['Bélgica 96,2 vs Argentina 90,2 — semifinal, ambos frescos', 'Belgium', 'Argentina', 100, 100, CFG.importance.wcKnockout],
    ['Bélgica 96,2 vs Argentina 90,2 — semifinal, Bélgica viene de 2 prórrogas', 'Belgium', 'Argentina', 62, 90, CFG.importance.wcKnockout],
    ['Bélgica 96,2 vs Argentina 90,2 — semifinal, Argentina la fundida', 'Belgium', 'Argentina', 90, 62, CFG.importance.wcKnockout],
    ['Brasil 85,4 vs Alemania 77,7 — fase de grupos, frescos', 'Brazil', 'Germany', 100, 100, CFG.importance.wcGroup],
    ['Brasil 85,4 vs Alemania 77,7 — final, frescos (mismo cruce, más oficio)', 'Brazil', 'Germany', 100, 100, CFG.importance.wcKnockout],
    ['Croacia 94,1 vs Japón 83,0 — octavos, Croacia gastada (70)', 'Croatia', 'Japan', 70, 95, CFG.importance.wcKnockout],
    ['Marruecos 94,8 vs Ghana 60,0 — octavos, Marruecos en el piso (60)', 'Morocco', 'Ghana', 60, 100, CFG.importance.wcKnockout],
  ];
  console.log('Cruce'.padEnd(62) + 'base'.padStart(8) + 'nuevo'.padStart(8) + '   Δ');
  for (const [label, hn, an, he, ae, imp] of cases) {
    const b = winProb({ hs: S(hn), as_: S(an), he: 100, ae: 100, imp, mode: 'base' });
    const n = winProb({ hs: S(hn), as_: S(an), he, ae, imp, mode: 'new' });
    const d = (n.win - b.win) * 100;
    console.log(label.padEnd(62) + pct(b.win, 1).padStart(8) + pct(n.win, 1).padStart(8) + '   ' + (d >= 0 ? '+' : '') + fx(d) + ' pts');
  }
  const ref = winProb({ hs: S('Brazil'), as_: S('Germany'), he: 100, ae: 100, imp: CFG.importance.wcKnockout, mode: 'new' });
  console.log(`\nCruce parejo tipo (Brasil-Alemania, KO): prórroga ${pct(ref.et, 1)} de los partidos, penales ${pct(ref.pen, 1)}.`);
}

// ============================================================ MUNDIAL
function seedGroups(qualified) {
  // 16 grupos de 4, bombos por skill como hace seeding.ts
  const pots = [0, 1, 2, 3].map((p) => qualified.slice(p * 16, p * 16 + 16));
  for (const pot of pots) for (let i = pot.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pot[i], pot[j]] = [pot[j], pot[i]]; }
  return Array.from({ length: 16 }, (_, g) => pots.map((pot) => pot[g]));
}

function playWorldCup(qualified, mode) {
  const st = new Map(qualified.map((t) => [t.name, { t, e: 100, played: 0, et: 0 }]));
  const trace = [];
  const groups = seedGroups(qualified);

  // ---- fase de grupos: 3 jornadas
  const tables = groups.map((g) => g.map((t) => ({ t, pts: 0, gf: 0, ga: 0 })));
  const rounds = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  for (let md = 0; md < 3; md++) {
    for (let gi = 0; gi < 16; gi++) {
      for (const [i, j] of rounds[md]) {
        const A = tables[gi][i], B = tables[gi][j];
        const sa = st.get(A.t.name), sb = st.get(B.t.name);
        const r = playMatch({ hs: A.t.skill, as_: B.t.skill, he: sa.e, ae: sb.e, imp: CFG.importance.wcGroup, neutral: true, knockout: false, mode });
        A.gf += r.h; A.ga += r.a; B.gf += r.a; B.ga += r.h;
        if (r.h > r.a) A.pts += 3; else if (r.h < r.a) B.pts += 3; else { A.pts++; B.pts++; }
        if (mode === 'new') {
          const tight = Math.abs(r.h - r.a) <= 1;
          sa.e = applyCost(sa.e, energyCost({ skill: A.t.skill, oppSkill: B.t.skill, imp: CFG.importance.wcGroup, tight, extraTime: false, pens: false }));
          sb.e = applyCost(sb.e, energyCost({ skill: B.t.skill, oppSkill: A.t.skill, imp: CFG.importance.wcGroup, tight, extraTime: false, pens: false }));
        }
        sa.played++; sb.played++;
      }
    }
    if (mode === 'new') for (const s of st.values()) s.e = recover(s.e, F.recovery);
  }

  // ---- clasificados: 1º y 2º de cada grupo
  const advance = [];
  for (const tb of tables) {
    tb.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || b.t.skill - a.t.skill);
    advance.push(tb[0].t, tb[1].t);
  }
  // cruce 1A-2B, 1B-2A, 1C-2D...
  let bracket = [];
  for (let g = 0; g < 16; g += 2) {
    bracket.push([advance[2 * g], advance[2 * (g + 1) + 1]]);
    bracket.push([advance[2 * (g + 1)], advance[2 * g + 1]]);
  }

  const roundNames = ['R32', 'R16', 'CF', 'SF', 'Final'];
  for (let r = 0; r < 5; r++) {
    if (mode === 'new') {
      for (const [A, B] of bracket) for (const t of [A, B]) trace.push({ round: roundNames[r], name: t.name, skill: t.skill, e: st.get(t.name).e });
    }
    const next = [];
    for (const [A, B] of bracket) {
      const sa = st.get(A.name), sb = st.get(B.name);
      const res = playMatch({ hs: A.skill, as_: B.skill, he: sa.e, ae: sb.e, imp: CFG.importance.wcKnockout, neutral: true, knockout: true, mode });
      let winner;
      if (res.h > res.a) winner = A; else if (res.a > res.h) winner = B;
      else winner = res.pens.h > res.pens.a ? A : B;
      if (mode === 'new') {
        const tight = Math.abs(res.h - res.a) <= 1;
        const common = { imp: CFG.importance.wcKnockout, tight, extraTime: res.extraTime, pens: !!res.pens };
        sa.e = applyCost(sa.e, energyCost({ skill: A.skill, oppSkill: B.skill, ...common }));
        sb.e = applyCost(sb.e, energyCost({ skill: B.skill, oppSkill: A.skill, ...common }));
        if (res.extraTime) { sa.et++; sb.et++; }
      }
      st.get(A.name).stats = res; st.get(B.name).stats = res;
      next.push({ winner, res });
    }
    const winners = next.map((n) => n.winner);
    if (mode === 'new') for (const s of st.values()) s.e = recover(s.e, F.recovery);
    if (r === 4) return { champion: winners[0], st, trace, koStats: next };
    bracket = [];
    for (let i = 0; i < winners.length; i += 2) bracket.push([winners[i], winners[i + 1]]);
  }
}

function exp2and3(N = 8000) {
  const qualified = TEAMS.slice(0, 64);
  line(`EXPERIMENTO 2 — ${N.toLocaleString('es')} Mundiales completos (los 64 mejores del ranking, 127 partidos c/u)`);

  const run = (mode) => {
    const titles = new Map(); let etCount = 0, penCount = 0, koCount = 0;
    const energyByRound = new Map(); const champEnergy = [];
    for (let i = 0; i < N; i++) {
      const { champion, st, trace, koStats } = playWorldCup(qualified, mode);
      titles.set(champion.name, (titles.get(champion.name) ?? 0) + 1);
      for (const k of koStats) { koCount++; if (k.res.extraTime) etCount++; if (k.res.pens) penCount++; }
      if (mode === 'new') {
        for (const tr of trace) {
          if (!energyByRound.has(tr.round)) energyByRound.set(tr.round, []);
          energyByRound.get(tr.round).push(tr.e);
        }
        const finalRow = trace.filter((t) => t.round === 'Final').find((t) => t.name === champion.name);
        if (finalRow) champEnergy.push(finalRow.e);
      }
    }
    return { titles, etCount, penCount, koCount, energyByRound, champEnergy };
  };

  const base = run('base');
  const neu = run('new');

  const top = TEAMS.slice(0, 12).map((t) => t.name);
  console.log('Equipo'.padEnd(22) + 'títulos base'.padStart(14) + 'títulos nuevo'.padStart(15) + '   Δ');
  for (const name of top) {
    const b = (base.titles.get(name) ?? 0) / N, n = (neu.titles.get(name) ?? 0) / N;
    console.log(name.padEnd(22) + pct(b, 1).padStart(14) + pct(n, 1).padStart(15) + '   ' + ((n - b) * 100 >= 0 ? '+' : '') + fx((n - b) * 100) + ' pts');
  }
  const share = (t) => { let s = 0; for (const n of TEAMS.slice(0, 8).map((x) => x.name)) s += (t.get(n) ?? 0) / N; return s; };
  console.log('\nTítulos que se lleva el top-8 del ranking:  base ' + pct(share(base.titles), 1) + '   nuevo ' + pct(share(neu.titles), 1));
  console.log('Campeones distintos en ' + N + ' Mundiales:        base ' + base.titles.size + '   nuevo ' + neu.titles.size);
  console.log('\nPartidos de eliminación directa:');
  console.log('  van a prórroga:  base —      nuevo ' + pct(neu.etCount, neu.koCount));
  console.log('  van a penales:   base ' + pct(base.penCount, base.koCount) + '   nuevo ' + pct(neu.penCount, neu.koCount));

  line('EXPERIMENTO 3 — Con cuánta energía se llega a cada ronda (promedio de los que juegan)');
  for (const r of ['R32', 'R16', 'CF', 'SF', 'Final']) {
    const arr = neu.energyByRound.get(r) ?? [];
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const sorted = [...arr].sort((a, b) => a - b);
    const p10 = sorted[(sorted.length * 0.1) | 0], p90 = sorted[(sorted.length * 0.9) | 0];
    const bar = '█'.repeat(Math.round((avg - 55) * 1.2));
    console.log(`  ${r.padEnd(6)} media ${fx(avg)}  (p10 ${fx(p10)} · p90 ${fx(p90)})  → juega como ${fx(-fatiguePenalty(avg))} de skill  ${bar}`);
  }
  const ce = neu.champEnergy;
  const avgCe = ce.reduce((a, b) => a + b, 0) / ce.length;
  const worst = Math.min(...ce);
  console.log(`\n  El campeón disputa la final con ${fx(avgCe)} de energía en promedio (peor caso observado: ${fx(worst)}).`);
  console.log(`  En el piso (60) un equipo juega 8 puntos de skill por debajo: Bélgica 96,2 rinde como 88,2.`);
}

// ============================================================ CONTINENTAL
function exp4(N = 8000) {
  const eu = TEAMS.filter((t) => t.region === 'Europe');
  const byes = Math.max(0, 64 - eu.length);
  line(`EXPERIMENTO 4 — ${N.toLocaleString('es')} Eurocopas (${eu.length} equipos, ${byes} byes, hasta 6 rondas seguidas)`);

  const drain = [];
  for (let it = 0; it < N; it++) {
    const st = new Map(eu.map((t) => [t.name, { t, e: 100 }]));
    let alive = eu.slice(0, byes);
    let pairs = [];
    const r64 = eu.slice(byes);
    for (let i = 0; i < r64.length; i += 2) pairs.push([r64[i], r64[i + 1]]);

    const rounds = ['R64', 'R32', 'R16', 'CF', 'SF', 'Final'];
    for (let r = 0; r < 6; r++) {
      const imp = r >= 3 ? CFG.importance.continentalLate : CFG.importance.continentalEarly;
      const winners = [];
      for (const [A, B] of pairs) {
        const sa = st.get(A.name), sb = st.get(B.name);
        const res = playMatch({ hs: A.skill, as_: B.skill, he: sa.e, ae: sb.e, imp, neutral: true, knockout: true, mode: 'new' });
        const w = res.h > res.a ? A : res.a > res.h ? B : (res.pens.h > res.pens.a ? A : B);
        const tight = Math.abs(res.h - res.a) <= 1;
        const common = { imp, tight, extraTime: res.extraTime, pens: !!res.pens };
        sa.e = applyCost(sa.e, energyCost({ skill: A.skill, oppSkill: B.skill, ...common }));
        sb.e = applyCost(sb.e, energyCost({ skill: B.skill, oppSkill: A.skill, ...common }));
        winners.push(w);
      }
      for (const s of st.values()) s.e = recover(s.e, F.recovery);
      const occupants = r === 0 ? [...alive, ...winners] : winners;
      alive = [];
      pairs = [];
      for (let i = 0; i < occupants.length; i += 2) pairs.push([occupants[i], occupants[i + 1]]);
      if (occupants.length === 1) { drain.push({ champ: occupants[0], e: st.get(occupants[0].name).e }); break; }
      if (r === 5) drain.push({ champ: pairs[0]?.[0] ?? occupants[0], e: st.get((pairs[0]?.[0] ?? occupants[0]).name).e });
    }
  }
  const avg = drain.reduce((a, b) => a + b.e, 0) / drain.length;
  const withBye = drain.filter((d) => eu.slice(0, byes).some((t) => t.name === d.champ.name));
  console.log(`  Energía del campeón continental al terminar: media ${fx(avg)} (piso ${F.energyMin}).`);
  console.log(`  Campeones que habían entrado con bye: ${pct(withBye.length, drain.length)} — un partido menos se nota.`);
  console.log(`  Nota: la continental es el torneo más duro del ciclo, 6 rondas seguidas sin fase de grupos.`);
}

// ============================================================ ¿DETERMINA?
function exp5(N = 400000) {
  line('EXPERIMENTO 5 — ¿El cansancio decide el partido? Cruces de KO entre pares (skill ±3)');
  const buckets = new Map();
  const pool = TEAMS.slice(0, 40);
  for (let i = 0; i < N; i++) {
    const A = pool[(Math.random() * pool.length) | 0];
    const B = pool[(Math.random() * pool.length) | 0];
    if (Math.abs(A.skill - B.skill) > 3) continue;
    const ea = 60 + Math.random() * 40, eb = 60 + Math.random() * 40;
    const res = playMatch({ hs: A.skill, as_: B.skill, he: ea, ae: eb, imp: CFG.importance.wcKnockout, neutral: true, knockout: true, mode: 'new' });
    const w = res.h > res.a ? 'A' : res.a > res.h ? 'B' : (res.pens.h > res.pens.a ? 'A' : 'B');
    const gap = ea - eb;
    const key = gap > 25 ? '+25 o más' : gap > 15 ? '+15 a +25' : gap > 5 ? '+5 a +15' : gap > -5 ? 'parejos' : gap > -15 ? '−5 a −15' : gap > -25 ? '−15 a −25' : '−25 o menos';
    if (!buckets.has(key)) buckets.set(key, { w: 0, n: 0 });
    const b = buckets.get(key); b.n++; if (w === 'A') b.w++;
  }
  const order = ['+25 o más', '+15 a +25', '+5 a +15', 'parejos', '−5 a −15', '−15 a −25', '−25 o menos'];
  console.log('  Ventaja de energía        victorias del equipo A');
  for (const k of order) {
    const b = buckets.get(k); if (!b) continue;
    const p = b.w / b.n;
    console.log('  ' + k.padEnd(24) + pct(p, 1).padStart(7) + '  ' + '▇'.repeat(Math.round(p * 40)));
  }
  console.log('\n  Entre equipos de igual nivel, llegar 25+ puntos de energía más entero mueve la aguja,');
  console.log('  pero nunca convierte el partido en trámite: el fondo del volado sigue estando ahí.');
}

// ============================================================ SENSIBILIDAD
function titleShare(mode, N) {
  const qualified = TEAMS.slice(0, 64);
  const titles = new Map();
  let et = 0, pen = 0, ko = 0;
  for (let i = 0; i < N; i++) {
    const { champion, koStats } = playWorldCup(qualified, mode);
    titles.set(champion.name, (titles.get(champion.name) ?? 0) + 1);
    for (const k of koStats) { ko++; if (k.res.extraTime) et++; if (k.res.pens) pen++; }
  }
  const names = TEAMS.map((t) => t.name);
  const top8 = names.slice(0, 8).reduce((s, n) => s + (titles.get(n) ?? 0), 0) / N;
  const top1 = (titles.get(TEAMS[0].name) ?? 0) / N;
  // "cenicientas": campeones de fuera del top-16 del ranking
  const outsider = names.slice(16, 64).reduce((s, n) => s + (titles.get(n) ?? 0), 0) / N;
  return { top8, top1, outsider, et: et / ko, pen: pen / ko };
}

function exp6(N = 5000) {
  line(`EXPERIMENTO 6 — Qué palanca hace qué (${N.toLocaleString('es')} Mundiales por configuración)`);
  const base = titleShare('base', N);
  const head = 'Configuración'.padEnd(44) + 'top-8'.padStart(8) + 'Bélgica'.padStart(9) + 'cenicienta'.padStart(12);
  console.log(head + '\n' + '·'.repeat(head.length));
  console.log('Motor actual (referencia)'.padEnd(44) + pct(base.top8, 1).padStart(8) + pct(base.top1, 1).padStart(9) + pct(base.outsider, 1).padStart(12));

  const rows = [
    ['Solo prórroga', { fatigue: false, clutch: 0, depth: true }],
    ['Solo energía, sin plantel', { fatigue: true, clutch: 0, depth: false }],
    ['Solo energía, con plantel', { fatigue: true, clutch: 0, depth: true }],
    ['Solo oficio 0,35', { fatigue: false, clutch: 0.35, depth: true }],
    ['Energía + oficio 0,10', { fatigue: true, clutch: 0.10, depth: true }],
    ['Energía + oficio 0,15', { fatigue: true, clutch: 0.15, depth: true }],
    ['Energía + oficio 0,20', { fatigue: true, clutch: 0.20, depth: true }],
    ['Energía + oficio 0,25', { fatigue: true, clutch: 0.25, depth: true }],
    ['Energía + oficio 0,35 (propuesta original)', { fatigue: true, clutch: 0.35, depth: true }],
  ];
  for (const [label, opt] of rows) {
    Object.assign(OPT, { extraTime: true }, opt);
    const r = titleShare('new', N);
    const d = (r.top8 - base.top8) * 100;
    console.log(label.padEnd(44) + pct(r.top8, 1).padStart(8) + pct(r.top1, 1).padStart(9) + pct(r.outsider, 1).padStart(12)
      + '   ' + (d >= 0 ? '+' : '') + fx(d) + ' pts');
  }
  Object.assign(OPT, { fatigue: true, clutch: F.clutchGain, extraTime: true, depth: true });
}

// Comparación final de alta precisión entre los candidatos de oficio.
function expFinal(N = 20000) {
  line(`AJUSTE FINO — ${N.toLocaleString('es')} Mundiales por configuración (margen de error ±0,7 pts)`);
  const base = titleShare('base', N);
  const head = 'Configuración'.padEnd(34) + 'top-8'.padStart(8) + 'cenicienta'.padStart(12) + 'penales KO'.padStart(12);
  console.log(head + '\n' + '·'.repeat(head.length));
  console.log('Motor actual'.padEnd(34) + pct(base.top8, 1).padStart(8) + pct(base.outsider, 1).padStart(12) + pct(base.pen, 1).padStart(12));
  for (const g of [0, 0.15, 0.2, 0.35]) {
    Object.assign(OPT, { fatigue: true, clutch: g, extraTime: true, depth: true });
    const r = titleShare('new', N);
    const label = g === 0 ? 'Energía + prórroga, sin oficio' : `Energía + prórroga + oficio ${fx(g, 2).replace('.', ',')}`;
    console.log(label.padEnd(34) + pct(r.top8, 1).padStart(8) + pct(r.outsider, 1).padStart(12) + pct(r.pen, 1).padStart(12)
      + '   ' + ((r.top8 - base.top8) >= 0 ? '+' : '') + fx((r.top8 - base.top8) * 100) + ' pts');
  }
}

if (process.argv[2] === 'final') {
  expFinal();
} else {
  exp1();
  exp6();
  exp2and3();
  exp4();
  exp5();
}
console.log('');
