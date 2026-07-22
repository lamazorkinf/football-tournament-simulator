-- ============================================
-- Migration 009: Borrado de datos legacy pre-ciclo
-- ============================================
-- Release del ciclo de 4 años (spec §10/§13): se limpian los torneos previos al
-- ciclo y su historial. `teams` NO se toca (data de referencia). TRUNCATE CASCADE
-- sobre `tournaments_new` limpia los hijos con FK (qualifier_groups,
-- world_cup_groups, matches_new, team_tournament_skills, tournament_cycle_state,
-- team_tournament_performance). `match_history` no tiene FK CASCADE desde
-- tournaments_new, así que se limpia explícitamente.
--
-- ⚠️ DESTRUCTIVO E IRREVERSIBLE. Aplicar SOLO con confirmación explícita.

TRUNCATE TABLE tournaments_new CASCADE;
TRUNCATE TABLE match_history;
