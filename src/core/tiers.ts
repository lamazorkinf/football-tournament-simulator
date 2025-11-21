import type { Team, SkillTier } from '../types';

/**
 * Calculate skill tier based on team skill rating
 * Elite: 80-100
 * Strong: 65-79
 * Average: 50-64
 * Weak: 0-49
 */
export function calculateTier(skill: number): SkillTier {
  if (skill >= 80) return 'Elite';
  if (skill >= 65) return 'Strong';
  if (skill >= 50) return 'Average';
  return 'Weak';
}

/**
 * Get tier color for UI display
 */
export function getTierColor(tier: SkillTier): string {
  switch (tier) {
    case 'Elite':
      return 'text-yellow-600 bg-yellow-50 border-yellow-300';
    case 'Strong':
      return 'text-blue-600 bg-blue-50 border-blue-300';
    case 'Average':
      return 'text-green-600 bg-green-50 border-green-300';
    case 'Weak':
      return 'text-gray-600 bg-gray-50 border-gray-300';
  }
}

/**
 * Get tier badge icon
 */
export function getTierIcon(tier: SkillTier): string {
  switch (tier) {
    case 'Elite':
      return '⭐';
    case 'Strong':
      return '🔷';
    case 'Average':
      return '🟢';
    case 'Weak':
      return '⚪';
  }
}

/**
 * Group teams by skill tier
 */
export function groupTeamsByTier(teams: Team[]): Record<SkillTier, Team[]> {
  const grouped: Record<SkillTier, Team[]> = {
    Elite: [],
    Strong: [],
    Average: [],
    Weak: [],
  };

  teams.forEach((team) => {
    const tier = calculateTier(team.skill);
    grouped[tier].push(team);
  });

  return grouped;
}

/**
 * Get tier distribution statistics
 */
export function getTierStats(teams: Team[]): Record<SkillTier, number> {
  const stats: Record<SkillTier, number> = {
    Elite: 0,
    Strong: 0,
    Average: 0,
    Weak: 0,
  };

  teams.forEach((team) => {
    const tier = calculateTier(team.skill);
    stats[tier]++;
  });

  return stats;
}

/**
 * Update all teams with their current tier
 */
export function updateTeamsTiers(teams: Team[]): Team[] {
  return teams.map((team) => ({
    ...team,
    tier: calculateTier(team.skill),
  }));
}
