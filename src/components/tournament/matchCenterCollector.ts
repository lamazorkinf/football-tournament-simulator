import type { Cycle, Region } from '../../types';
import { getDisplayJornada, type MatchStage, type MatchWithContext } from '../../core/jornada';

// Los tipos viven en core/jornada (el modelo de jornada los necesita sin
// depender de components); se re-exportan para no romper los imports existentes.
export type { MatchStage, MatchWithContext };

/** Recorre todas las fases del ciclo y devuelve los partidos con su contexto. */
export function collectAllMatches(tournament: Cycle): MatchWithContext[] {
  const matches: MatchWithContext[] = [];

  const push = (item: Omit<MatchWithContext, 'displayJornada'>) => {
    matches.push({ ...item, displayJornada: getDisplayJornada(item.stage, item.match) });
  };

  // Clasificatorias
  Object.entries(tournament.qualifiers).forEach(([region, groups]) => {
    groups.forEach((group) => {
      group.matches.forEach((match) => {
        push({ match, stage: 'qualifier', groupId: group.id, groupName: group.name, region: region as Region });
      });
    });
  });

  // Mundial: grupos + knockout
  if (tournament.worldCup) {
    tournament.worldCup.groups.forEach((group) => {
      group.matches.forEach((match) => {
        push({ match, stage: 'world-cup', groupId: group.id, groupName: group.name });
      });
    });
    const knockoutMatches = [
      ...tournament.worldCup.knockout.roundOf32,
      ...tournament.worldCup.knockout.roundOf16,
      ...tournament.worldCup.knockout.quarterFinals,
      ...tournament.worldCup.knockout.semiFinals,
      ...(tournament.worldCup.knockout.thirdPlace ? [tournament.worldCup.knockout.thirdPlace] : []),
      ...(tournament.worldCup.knockout.final ? [tournament.worldCup.knockout.final] : []),
    ];
    knockoutMatches.forEach((match) => {
      push({ match, stage: 'knockout', groupId: 'knockout', groupName: match.round || 'Knockout' });
    });
  }

  // Continental: un bracket por región
  if (tournament.continental?.brackets) {
    (Object.keys(tournament.continental.brackets) as Region[]).forEach((region) => {
      const b = tournament.continental.brackets[region];
      const bracketMatches = [
        ...b.roundOf64, ...b.roundOf32, ...b.roundOf16,
        ...b.quarterFinals, ...b.semiFinals,
        ...(b.final ? [b.final] : []),
        ...(b.thirdPlace ? [b.thirdPlace] : []),
      ];
      bracketMatches.forEach((match) => {
        push({ match, stage: 'continental', groupId: `continental-${region}`, groupName: match.round || 'Continental', region });
      });
    });
  }

  // Confederaciones: grupos + knockout (todo bajo el filtro visual "confederations")
  if (tournament.confederationsCup) {
    tournament.confederationsCup.groups.forEach((group) => {
      group.matches.forEach((match) => {
        push({ match, stage: 'confederations', groupId: group.id, groupName: group.name });
      });
    });
    const ko = tournament.confederationsCup.knockout;
    const koMatches = [
      ...ko.semiFinals,
      ...(ko.final ? [ko.final] : []),
      ...(ko.thirdPlace ? [ko.thirdPlace] : []),
    ];
    koMatches.forEach((match) => {
      push({ match, stage: 'confederations', groupId: 'confed-knockout', groupName: match.round || 'Confederaciones' });
    });
  }

  return matches;
}
