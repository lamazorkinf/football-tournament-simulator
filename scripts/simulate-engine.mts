// Banco de pruebas del modelo de energía + oficio + prórroga.
//
//   npm run simulate          → los 6 experimentos
//   npm run simulate final    → comparación de alta precisión
//
// Produjo los números de docs/superpowers/specs/2026-07-24-energia-oficio-prorroga-design.md.
//
// Importa el motor real (src/core/engine.ts y src/core/energy.ts): no hay dos
// copias que puedan desincronizarse. Las palancas del barrido de sensibilidad
// se mueven con useConfigStore.getState().updateFatigue({...}), igual que
// desde la pantalla de Ajustes.
//
// Se corre con `jiti` (ver el script "simulate" de package.json) porque es lo
// que ya hay instalado en el repo para ejecutar TypeScript/ESM sin compilar.
import {
  simulateMatch,
  simulateMatchWithPenalties,
  simulatePenalties,
  type MatchContext,
} from '../src/core/engine';
import { fatiguePenalty, matchEnergyCost, DEFAULT_FATIGUE, ENERGY_MAX, type FatigueConfig } from '../src/core/energy';
import { useConfigStore, DEFAULT_CONFIG } from '../src/store/useConfigStore';
import { TEAMS } from './simulate-engine.teams.js';

interface Team {
  name: string;
  region: string;
  skill: number;
}

const teams = TEAMS as Team[];

/** Pesos de importancia calibrados, los mismos que usa la app (no se barren acá). */
const IMPORTANCE = DEFAULT_CONFIG.importanceByStage;

type Mode = 'base' | 'new';
type KnockoutResult = ReturnType<typeof simulateMatchWithPenalties>;

/**
 * Reemplaza el `OPT` del banco de pruebas viejo: en vez de un objeto local
 * mutable, la config del motor real. `resetToDefaults` primero para que un
 * experimento nunca herede lo que dejó el anterior.
 */
function applyFatigueOverrides(overrides: Partial<FatigueConfig> = {}): void {
  useConfigStore.getState().resetToDefaults();
  if (Object.keys(overrides).length > 0) {
    useConfigStore.getState().updateFatigue(overrides);
  }
}

function ctx(hs: number, as_: number, he: number, ae: number, imp: number): MatchContext {
  return { home: { skill: hs, energy: he }, away: { skill: as_, energy: ae }, importance: imp, neutral: true };
}

/**
 * Partido de eliminación directa. mode 'new' = motor real completo (alargue +
 * penales). mode 'base' = la referencia "motor actual" de antes de esta
 * feature: sin alargue, empate a los 90' define directo por penales. Usa
 * `simulateMatch` y `simulatePenalties` reales igual, sólo que sin el paso
 * intermedio del alargue.
 */
function playKnockout(c: MatchContext, mode: Mode): KnockoutResult {
  if (mode === 'new') return simulateMatchWithPenalties(c);
  const result = simulateMatch(c);
  if (result.homeScore !== result.awayScore) return result;
  return { ...result, penalties: simulatePenalties(c.home.skill, c.away.skill) };
}

const applyCost = (e: number, cost: number, cfg: FatigueConfig) => Math.max(cfg.energyMin, e - cost);
const recover = (e: number, amount: number) => Math.min(ENERGY_MAX, e + amount);

// ---------------------------------------------------------------- utilidades
const pct = (x: number, n: number) => ((100 * x) / n).toFixed(1) + '%';
const fx = (x: number, d = 1) => x.toFixed(d);
const byName = Object.fromEntries(teams.map((t) => [t.name, t]));
const S = (n: string) => byName[n].skill;

function line(title: string) {
  console.log('\n' + '─'.repeat(78) + '\n' + title + '\n' + '─'.repeat(78));
}

// ============================================================ EXPERIMENTO 1
// Duelos puntuales: cómo cambia la probabilidad de ganar.
function winProb({
  hs,
  as_,
  he,
  ae,
  imp,
  mode,
  n = 200000,
}: {
  hs: number;
  as_: number;
  he: number;
  ae: number;
  imp: number;
  mode: Mode;
  n?: number;
}) {
  let wins = 0,
    ets = 0,
    pens = 0;
  const c = ctx(hs, as_, he, ae, imp);
  for (let i = 0; i < n; i++) {
    const r = playKnockout(c, mode);
    if (r.extraTime) ets++;
    if (r.penalties) pens++;
    if (r.homeScore > r.awayScore) wins++;
    else if (r.homeScore === r.awayScore) {
      if (r.penalties && r.penalties.homeScore > r.penalties.awayScore) wins++;
    } else if (r.penalties && r.penalties.homeScore > r.penalties.awayScore) wins++;
  }
  return { win: wins / n, et: ets / n, pen: pens / n };
}

function exp1() {
  line('EXPERIMENTO 1 — Duelos puntuales (200.000 repeticiones cada uno)');
  const cases: Array<[string, string, string, number, number, number]> = [
    ['Bélgica 96,2 vs Argentina 90,2 — semifinal, ambos frescos', 'Belgium', 'Argentina', 100, 100, IMPORTANCE.wcKnockout],
    ['Bélgica 96,2 vs Argentina 90,2 — semifinal, Bélgica viene de 2 prórrogas', 'Belgium', 'Argentina', 62, 90, IMPORTANCE.wcKnockout],
    ['Bélgica 96,2 vs Argentina 90,2 — semifinal, Argentina la fundida', 'Belgium', 'Argentina', 90, 62, IMPORTANCE.wcKnockout],
    ['Brasil 85,4 vs Alemania 77,7 — fase de grupos, frescos', 'Brazil', 'Germany', 100, 100, IMPORTANCE.wcGroup],
    ['Brasil 85,4 vs Alemania 77,7 — final, frescos (mismo cruce, más oficio)', 'Brazil', 'Germany', 100, 100, IMPORTANCE.wcKnockout],
    ['Croacia 94,1 vs Japón 83,0 — octavos, Croacia gastada (70)', 'Croatia', 'Japan', 70, 95, IMPORTANCE.wcKnockout],
    ['Marruecos 94,8 vs Ghana 60,0 — octavos, Marruecos en el piso (60)', 'Morocco', 'Ghana', 60, 100, IMPORTANCE.wcKnockout],
  ];
  console.log('Cruce'.padEnd(62) + 'base'.padStart(8) + 'nuevo'.padStart(8) + '   Δ');
  for (const [label, hn, an, he, ae, imp] of cases) {
    applyFatigueOverrides({ enabled: false });
    const b = winProb({ hs: S(hn), as_: S(an), he: 100, ae: 100, imp, mode: 'base' });
    applyFatigueOverrides();
    const n = winProb({ hs: S(hn), as_: S(an), he, ae, imp, mode: 'new' });
    const d = (n.win - b.win) * 100;
    console.log(label.padEnd(62) + pct(b.win, 1).padStart(8) + pct(n.win, 1).padStart(8) + '   ' + (d >= 0 ? '+' : '') + fx(d) + ' pts');
  }
  applyFatigueOverrides();
  const ref = winProb({ hs: S('Brazil'), as_: S('Germany'), he: 100, ae: 100, imp: IMPORTANCE.wcKnockout, mode: 'new' });
  console.log(`\nCruce parejo tipo (Brasil-Alemania, KO): prórroga ${pct(ref.et, 1)} de los partidos, penales ${pct(ref.pen, 1)}.`);
}

// ============================================================ MUNDIAL
function seedGroups(qualified: Team[]): Team[][] {
  // 16 grupos de 4, bombos por skill como hace seeding.ts
  const pots = [0, 1, 2, 3].map((p) => qualified.slice(p * 16, p * 16 + 16));
  for (const pot of pots)
    for (let i = pot.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [pot[i], pot[j]] = [pot[j], pot[i]];
    }
  return Array.from({ length: 16 }, (_, g) => pots.map((pot) => pot[g]));
}

interface TeamState {
  t: Team;
  e: number;
  played: number;
  et: number;
}

function playWorldCup(qualified: Team[], mode: Mode, cfg: FatigueConfig) {
  const st = new Map<string, TeamState>(qualified.map((t) => [t.name, { t, e: ENERGY_MAX, played: 0, et: 0 }]));
  const trace: Array<{ round: string; name: string; skill: number; e: number }> = [];
  const groups = seedGroups(qualified);

  // ---- fase de grupos: 3 jornadas
  const tables = groups.map((g) => g.map((t) => ({ t, pts: 0, gf: 0, ga: 0 })));
  const rounds = [
    [[0, 1], [2, 3]],
    [[0, 2], [1, 3]],
    [[0, 3], [1, 2]],
  ];
  for (let md = 0; md < 3; md++) {
    for (let gi = 0; gi < 16; gi++) {
      for (const [i, j] of rounds[md]) {
        const A = tables[gi][i],
          B = tables[gi][j];
        const sa = st.get(A.t.name)!,
          sb = st.get(B.t.name)!;
        const r = simulateMatch(ctx(A.t.skill, B.t.skill, sa.e, sb.e, IMPORTANCE.wcGroup));
        A.gf += r.homeScore;
        A.ga += r.awayScore;
        B.gf += r.awayScore;
        B.ga += r.homeScore;
        if (r.homeScore > r.awayScore) A.pts += 3;
        else if (r.homeScore < r.awayScore) B.pts += 3;
        else {
          A.pts++;
          B.pts++;
        }
        if (mode === 'new') {
          const tight = Math.abs(r.homeScore - r.awayScore) <= 1;
          sa.e = applyCost(
            sa.e,
            matchEnergyCost({ skill: A.t.skill, oppSkill: B.t.skill, importance: IMPORTANCE.wcGroup, tight, extraTime: false, penalties: false }, cfg),
            cfg,
          );
          sb.e = applyCost(
            sb.e,
            matchEnergyCost({ skill: B.t.skill, oppSkill: A.t.skill, importance: IMPORTANCE.wcGroup, tight, extraTime: false, penalties: false }, cfg),
            cfg,
          );
        }
        sa.played++;
        sb.played++;
      }
    }
    if (mode === 'new') for (const s of st.values()) s.e = recover(s.e, cfg.recovery);
  }

  // ---- clasificados: 1º y 2º de cada grupo
  const advance: Team[] = [];
  for (const tb of tables) {
    tb.sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || b.t.skill - a.t.skill);
    advance.push(tb[0].t, tb[1].t);
  }
  // cruce 1A-2B, 1B-2A, 1C-2D...
  let bracket: Array<[Team, Team]> = [];
  for (let g = 0; g < 16; g += 2) {
    bracket.push([advance[2 * g], advance[2 * (g + 1) + 1]]);
    bracket.push([advance[2 * (g + 1)], advance[2 * g + 1]]);
  }

  const roundNames = ['R32', 'R16', 'CF', 'SF', 'Final'];
  for (let r = 0; r < 5; r++) {
    if (mode === 'new') {
      for (const [A, B] of bracket)
        for (const t of [A, B]) trace.push({ round: roundNames[r], name: t.name, skill: t.skill, e: st.get(t.name)!.e });
    }
    const next: Array<{ winner: Team; res: KnockoutResult }> = [];
    for (const [A, B] of bracket) {
      const sa = st.get(A.name)!,
        sb = st.get(B.name)!;
      const res = playKnockout(ctx(A.skill, B.skill, sa.e, sb.e, IMPORTANCE.wcKnockout), mode);
      let winner: Team;
      if (res.homeScore > res.awayScore) winner = A;
      else if (res.awayScore > res.homeScore) winner = B;
      else winner = res.penalties!.homeScore > res.penalties!.awayScore ? A : B;
      if (mode === 'new') {
        const tight = Math.abs(res.homeScore - res.awayScore) <= 1;
        const common = { importance: IMPORTANCE.wcKnockout, tight, extraTime: !!res.extraTime, penalties: !!res.penalties };
        sa.e = applyCost(sa.e, matchEnergyCost({ skill: A.skill, oppSkill: B.skill, ...common }, cfg), cfg);
        sb.e = applyCost(sb.e, matchEnergyCost({ skill: B.skill, oppSkill: A.skill, ...common }, cfg), cfg);
        if (res.extraTime) {
          sa.et++;
          sb.et++;
        }
      }
      next.push({ winner, res });
    }
    const winners = next.map((n) => n.winner);
    if (mode === 'new') for (const s of st.values()) s.e = recover(s.e, cfg.recovery);
    if (r === 4) return { champion: winners[0], st, trace, koStats: next };
    bracket = [];
    for (let i = 0; i < winners.length; i += 2) bracket.push([winners[i], winners[i + 1]]);
  }
  throw new Error('playWorldCup: no se alcanzó la final');
}

function titleShare(mode: Mode, N: number, overrides: Partial<FatigueConfig> = {}) {
  applyFatigueOverrides(mode === 'base' ? { enabled: false } : overrides);
  const cfg = useConfigStore.getState().config.fatigue;
  const qualified = teams.slice(0, 64);
  const titles = new Map<string, number>();
  let et = 0,
    pen = 0,
    ko = 0;
  for (let i = 0; i < N; i++) {
    const { champion, koStats } = playWorldCup(qualified, mode, cfg);
    titles.set(champion.name, (titles.get(champion.name) ?? 0) + 1);
    for (const k of koStats) {
      ko++;
      if (k.res.extraTime) et++;
      if (k.res.penalties) pen++;
    }
  }
  const names = teams.map((t) => t.name);
  const top8 = names.slice(0, 8).reduce((s, n) => s + (titles.get(n) ?? 0), 0) / N;
  const top1 = (titles.get(teams[0].name) ?? 0) / N;
  // "cenicientas": campeones de fuera del top-16 del ranking
  const outsider = names.slice(16, 64).reduce((s, n) => s + (titles.get(n) ?? 0), 0) / N;
  return { top8, top1, outsider, et: et / ko, pen: pen / ko };
}

function exp2and3(N = 8000) {
  const qualified = teams.slice(0, 64);
  line(`EXPERIMENTO 2 — ${N.toLocaleString('es')} Mundiales completos (los 64 mejores del ranking, 127 partidos c/u)`);

  const run = (mode: Mode) => {
    applyFatigueOverrides(mode === 'base' ? { enabled: false } : {});
    const cfg = useConfigStore.getState().config.fatigue;
    const titles = new Map<string, number>();
    let etCount = 0,
      penCount = 0,
      koCount = 0;
    const energyByRound = new Map<string, number[]>();
    const champEnergy: number[] = [];
    for (let i = 0; i < N; i++) {
      const { champion, trace, koStats } = playWorldCup(qualified, mode, cfg);
      titles.set(champion.name, (titles.get(champion.name) ?? 0) + 1);
      for (const k of koStats) {
        koCount++;
        if (k.res.extraTime) etCount++;
        if (k.res.penalties) penCount++;
      }
      if (mode === 'new') {
        for (const tr of trace) {
          if (!energyByRound.has(tr.round)) energyByRound.set(tr.round, []);
          energyByRound.get(tr.round)!.push(tr.e);
        }
        const finalRow = trace.filter((t) => t.round === 'Final').find((t) => t.name === champion.name);
        if (finalRow) champEnergy.push(finalRow.e);
      }
    }
    return { titles, etCount, penCount, koCount, energyByRound, champEnergy };
  };

  const base = run('base');
  const neu = run('new');

  const top = teams.slice(0, 12).map((t) => t.name);
  console.log('Equipo'.padEnd(22) + 'títulos base'.padStart(14) + 'títulos nuevo'.padStart(15) + '   Δ');
  for (const name of top) {
    const b = (base.titles.get(name) ?? 0) / N,
      n = (neu.titles.get(name) ?? 0) / N;
    console.log(name.padEnd(22) + pct(b, 1).padStart(14) + pct(n, 1).padStart(15) + '   ' + ((n - b) * 100 >= 0 ? '+' : '') + fx((n - b) * 100) + ' pts');
  }
  const share = (t: Map<string, number>) => {
    let s = 0;
    for (const n of teams.slice(0, 8).map((x) => x.name)) s += (t.get(n) ?? 0) / N;
    return s;
  };
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
    const p10 = sorted[(sorted.length * 0.1) | 0],
      p90 = sorted[(sorted.length * 0.9) | 0];
    const bar = '█'.repeat(Math.round((avg - 55) * 1.2));
    console.log(`  ${r.padEnd(6)} media ${fx(avg)}  (p10 ${fx(p10)} · p90 ${fx(p90)})  → juega como ${fx(-fatiguePenalty(avg, DEFAULT_FATIGUE))} de skill  ${bar}`);
  }
  const ce = neu.champEnergy;
  const avgCe = ce.reduce((a, b) => a + b, 0) / ce.length;
  const worst = Math.min(...ce);
  console.log(`\n  El campeón disputa la final con ${fx(avgCe)} de energía en promedio (peor caso observado: ${fx(worst)}).`);
  console.log(`  En el piso (60) un equipo juega 8 puntos de skill por debajo: Bélgica 96,2 rinde como 88,2.`);
}

// ============================================================ CONTINENTAL
function exp4(N = 8000) {
  applyFatigueOverrides();
  const cfg = useConfigStore.getState().config.fatigue;
  const eu = teams.filter((t) => t.region === 'Europe');
  const byes = Math.max(0, 64 - eu.length);
  line(`EXPERIMENTO 4 — ${N.toLocaleString('es')} Eurocopas (${eu.length} equipos, ${byes} byes, hasta 6 rondas seguidas)`);

  const drain: Array<{ champ: Team; e: number }> = [];
  for (let it = 0; it < N; it++) {
    const st = new Map<string, { t: Team; e: number }>(eu.map((t) => [t.name, { t, e: ENERGY_MAX }]));
    let alive = eu.slice(0, byes);
    let pairs: Array<[Team, Team]> = [];
    const r64 = eu.slice(byes);
    for (let i = 0; i < r64.length; i += 2) pairs.push([r64[i], r64[i + 1]]);

    for (let r = 0; r < 6; r++) {
      const imp = r >= 3 ? IMPORTANCE.continentalLate : IMPORTANCE.continentalEarly;
      const winners: Team[] = [];
      for (const [A, B] of pairs) {
        const sa = st.get(A.name)!,
          sb = st.get(B.name)!;
        const res = playKnockout(ctx(A.skill, B.skill, sa.e, sb.e, imp), 'new');
        const w = res.homeScore > res.awayScore ? A : res.awayScore > res.homeScore ? B : res.penalties!.homeScore > res.penalties!.awayScore ? A : B;
        const tight = Math.abs(res.homeScore - res.awayScore) <= 1;
        const common = { importance: imp, tight, extraTime: !!res.extraTime, penalties: !!res.penalties };
        sa.e = applyCost(sa.e, matchEnergyCost({ skill: A.skill, oppSkill: B.skill, ...common }, cfg), cfg);
        sb.e = applyCost(sb.e, matchEnergyCost({ skill: B.skill, oppSkill: A.skill, ...common }, cfg), cfg);
        winners.push(w);
      }
      for (const s of st.values()) s.e = recover(s.e, cfg.recovery);
      const occupants = r === 0 ? [...alive, ...winners] : winners;
      alive = [];
      pairs = [];
      for (let i = 0; i < occupants.length; i += 2) pairs.push([occupants[i], occupants[i + 1]]);
      if (occupants.length === 1) {
        drain.push({ champ: occupants[0], e: st.get(occupants[0].name)!.e });
        break;
      }
      if (r === 5) drain.push({ champ: pairs[0]?.[0] ?? occupants[0], e: st.get((pairs[0]?.[0] ?? occupants[0]).name)!.e });
    }
  }
  const avg = drain.reduce((a, b) => a + b.e, 0) / drain.length;
  const withBye = drain.filter((d) => eu.slice(0, byes).some((t) => t.name === d.champ.name));
  console.log(`  Energía del campeón continental al terminar: media ${fx(avg)} (piso ${cfg.energyMin}).`);
  console.log(`  Campeones que habían entrado con bye: ${pct(withBye.length, drain.length)} — un partido menos se nota.`);
  console.log(`  Nota: la continental es el torneo más duro del ciclo, 6 rondas seguidas sin fase de grupos.`);
}

// ============================================================ ¿DETERMINA?
function exp5(N = 400000) {
  applyFatigueOverrides();
  line('EXPERIMENTO 5 — ¿El cansancio decide el partido? Cruces de KO entre pares (skill ±3)');
  const buckets = new Map<string, { w: number; n: number }>();
  const pool = teams.slice(0, 40);
  for (let i = 0; i < N; i++) {
    const A = pool[(Math.random() * pool.length) | 0];
    const B = pool[(Math.random() * pool.length) | 0];
    if (Math.abs(A.skill - B.skill) > 3) continue;
    const ea = 60 + Math.random() * 40,
      eb = 60 + Math.random() * 40;
    const res = playKnockout(ctx(A.skill, B.skill, ea, eb, IMPORTANCE.wcKnockout), 'new');
    const w = res.homeScore > res.awayScore ? 'A' : res.awayScore > res.homeScore ? 'B' : res.penalties!.homeScore > res.penalties!.awayScore ? 'A' : 'B';
    const gap = ea - eb;
    const key =
      gap > 25 ? '+25 o más' : gap > 15 ? '+15 a +25' : gap > 5 ? '+5 a +15' : gap > -5 ? 'parejos' : gap > -15 ? '−5 a −15' : gap > -25 ? '−15 a −25' : '−25 o menos';
    if (!buckets.has(key)) buckets.set(key, { w: 0, n: 0 });
    const b = buckets.get(key)!;
    b.n++;
    if (w === 'A') b.w++;
  }
  const order = ['+25 o más', '+15 a +25', '+5 a +15', 'parejos', '−5 a −15', '−15 a −25', '−25 o menos'];
  console.log('  Ventaja de energía        victorias del equipo A');
  for (const k of order) {
    const b = buckets.get(k);
    if (!b) continue;
    const p = b.w / b.n;
    console.log('  ' + k.padEnd(24) + pct(p, 1).padStart(7) + '  ' + '▇'.repeat(Math.round(p * 40)));
  }
  console.log('\n  Entre equipos de igual nivel, llegar 25+ puntos de energía más entero mueve la aguja,');
  console.log('  pero nunca convierte el partido en trámite: el fondo del volado sigue estando ahí.');
}

// ============================================================ SENSIBILIDAD
function exp6(N = 5000) {
  line(`EXPERIMENTO 6 — Qué palanca hace qué (${N.toLocaleString('es')} Mundiales por configuración)`);
  const base = titleShare('base', N);
  const head = 'Configuración'.padEnd(44) + 'top-8'.padStart(8) + 'Bélgica'.padStart(9) + 'cenicienta'.padStart(12);
  console.log(head + '\n' + '·'.repeat(head.length));
  console.log('Motor actual (referencia)'.padEnd(44) + pct(base.top8, 1).padStart(8) + pct(base.top1, 1).padStart(9) + pct(base.outsider, 1).padStart(12));

  const rows: Array<[string, Partial<FatigueConfig>]> = [
    ['Solo prórroga', { penaltyPerPoint: 0, clutchGain: 0 }],
    ['Solo energía, sin plantel', { clutchGain: 0, depthMax: 0 }],
    ['Solo energía, con plantel', { clutchGain: 0 }],
    ['Solo oficio 0,35', { penaltyPerPoint: 0, clutchGain: 0.35 }],
    ['Energía + oficio 0,10', { clutchGain: 0.1 }],
    ['Energía + oficio 0,15', { clutchGain: 0.15 }],
    ['Energía + oficio 0,20', { clutchGain: 0.2 }],
    ['Energía + oficio 0,25', { clutchGain: 0.25 }],
    ['Energía + oficio 0,35 (propuesta original)', { clutchGain: 0.35 }],
  ];
  for (const [label, overrides] of rows) {
    const r = titleShare('new', N, overrides);
    const d = (r.top8 - base.top8) * 100;
    console.log(
      label.padEnd(44) + pct(r.top8, 1).padStart(8) + pct(r.top1, 1).padStart(9) + pct(r.outsider, 1).padStart(12) + '   ' + (d >= 0 ? '+' : '') + fx(d) + ' pts',
    );
  }
}

// Comparación final de alta precisión entre los candidatos de oficio.
function expFinal(N = 20000) {
  line(`AJUSTE FINO — ${N.toLocaleString('es')} Mundiales por configuración (margen de error ±0,7 pts)`);
  const base = titleShare('base', N);
  const head = 'Configuración'.padEnd(34) + 'top-8'.padStart(8) + 'cenicienta'.padStart(12) + 'penales KO'.padStart(12);
  console.log(head + '\n' + '·'.repeat(head.length));
  console.log('Motor actual'.padEnd(34) + pct(base.top8, 1).padStart(8) + pct(base.outsider, 1).padStart(12) + pct(base.pen, 1).padStart(12));
  for (const g of [0, 0.15, 0.2, 0.35]) {
    const r = titleShare('new', N, { clutchGain: g });
    const label = g === 0 ? 'Energía + prórroga, sin oficio' : `Energía + prórroga + oficio ${fx(g, 2).replace('.', ',')}`;
    console.log(
      label.padEnd(34) +
        pct(r.top8, 1).padStart(8) +
        pct(r.outsider, 1).padStart(12) +
        pct(r.pen, 1).padStart(12) +
        '   ' +
        (r.top8 - base.top8 >= 0 ? '+' : '') +
        fx((r.top8 - base.top8) * 100) +
        ' pts',
    );
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
