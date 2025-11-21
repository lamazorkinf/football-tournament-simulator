export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      teams: {
        Row: {
          id: string
          name: string
          flag: string
          region: 'Europe' | 'America' | 'Africa' | 'Asia' | 'Oceania'
          skill: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          flag: string
          region: 'Europe' | 'America' | 'Africa' | 'Asia' | 'Oceania'
          skill: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          flag?: string
          region?: 'Europe' | 'America' | 'Africa' | 'Asia' | 'Oceania'
          skill?: number
          created_at?: string
          updated_at?: string
        }
      }
      match_history: {
        Row: {
          id: string
          home_team_id: string
          away_team_id: string
          home_score: number
          away_score: number
          stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
          group_name: string | null
          region: string | null
          tournament_id: string | null
          home_skill_before: number
          away_skill_before: number
          home_skill_after: number
          away_skill_after: number
          home_skill_change: number
          away_skill_change: number
          played_at: string
          metadata: Json
        }
        Insert: {
          id?: string
          home_team_id: string
          away_team_id: string
          home_score: number
          away_score: number
          stage: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
          group_name?: string | null
          region?: string | null
          tournament_id?: string | null
          home_skill_before: number
          away_skill_before: number
          home_skill_after: number
          away_skill_after: number
          home_skill_change: number
          away_skill_change: number
          played_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          home_team_id?: string
          away_team_id?: string
          home_score?: number
          away_score?: number
          stage?: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
          group_name?: string | null
          region?: string | null
          tournament_id?: string | null
          home_skill_before?: number
          away_skill_before?: number
          home_skill_after?: number
          away_skill_after?: number
          home_skill_change?: number
          away_skill_change?: number
          played_at?: string
          metadata?: Json
        }
      }
      tournaments: {
        Row: {
          id: string
          name: string
          status: 'qualifiers' | 'world-cup' | 'completed'
          created_at: string
          updated_at: string
          metadata: Json
        }
        Insert: {
          id: string
          name: string
          status: 'qualifiers' | 'world-cup' | 'completed'
          created_at?: string
          updated_at?: string
          metadata?: Json
        }
        Update: {
          id?: string
          name?: string
          status?: 'qualifiers' | 'world-cup' | 'completed'
          created_at?: string
          updated_at?: string
          metadata?: Json
        }
      }
      tournaments_new: {
        Row: {
          id: string
          name: string
          year: number
          status: 'qualifiers' | 'world-cup' | 'completed'
          is_qualifiers_complete: boolean
          has_any_match_played: boolean
          champion_team_id: string | null
          runner_up_team_id: string | null
          third_place_team_id: string | null
          fourth_place_team_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          name: string
          year: number
          status?: 'qualifiers' | 'world-cup' | 'completed'
          is_qualifiers_complete?: boolean
          has_any_match_played?: boolean
          champion_team_id?: string | null
          runner_up_team_id?: string | null
          third_place_team_id?: string | null
          fourth_place_team_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          year?: number
          status?: 'qualifiers' | 'world-cup' | 'completed'
          is_qualifiers_complete?: boolean
          has_any_match_played?: boolean
          champion_team_id?: string | null
          runner_up_team_id?: string | null
          third_place_team_id?: string | null
          fourth_place_team_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      qualifier_groups: {
        Row: {
          id: string
          tournament_id: string
          region: 'Europe' | 'America' | 'Africa' | 'Asia' | 'Oceania'
          name: string
          num_qualify: number
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          region: 'Europe' | 'America' | 'Africa' | 'Asia' | 'Oceania'
          name: string
          num_qualify?: number
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          region?: 'Europe' | 'America' | 'Africa' | 'Asia' | 'Oceania'
          name?: string
          num_qualify?: number
          created_at?: string
        }
      }
      qualifier_group_teams: {
        Row: {
          id: string
          group_id: string
          team_id: string
          points: number
          played: number
          won: number
          drawn: number
          lost: number
          goals_for: number
          goals_against: number
          goal_difference: number
          qualified: boolean
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          team_id: string
          points?: number
          played?: number
          won?: number
          drawn?: number
          lost?: number
          goals_for?: number
          goals_against?: number
          qualified?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          team_id?: string
          points?: number
          played?: number
          won?: number
          drawn?: number
          lost?: number
          goals_for?: number
          goals_against?: number
          qualified?: boolean
          created_at?: string
        }
      }
      world_cup_groups: {
        Row: {
          id: string
          tournament_id: string
          name: string
          num_qualify: number
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          name: string
          num_qualify?: number
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          name?: string
          num_qualify?: number
          created_at?: string
        }
      }
      world_cup_group_teams: {
        Row: {
          id: string
          group_id: string
          team_id: string
          points: number
          played: number
          won: number
          drawn: number
          lost: number
          goals_for: number
          goals_against: number
          goal_difference: number
          qualified: boolean
          final_position: number | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          team_id: string
          points?: number
          played?: number
          won?: number
          drawn?: number
          lost?: number
          goals_for?: number
          goals_against?: number
          qualified?: boolean
          final_position?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          team_id?: string
          points?: number
          played?: number
          won?: number
          drawn?: number
          lost?: number
          goals_for?: number
          goals_against?: number
          qualified?: boolean
          final_position?: number | null
          created_at?: string
        }
      }
      matches_new: {
        Row: {
          id: string
          tournament_id: string
          match_type: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
          qualifier_group_id: string | null
          world_cup_group_id: string | null
          knockout_round: string | null
          knockout_position: number | null
          home_team_id: string
          away_team_id: string
          home_score: number | null
          away_score: number | null
          is_played: boolean
          played_at: string | null
          home_penalties: number | null
          away_penalties: number | null
          winner_team_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          match_type: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
          qualifier_group_id?: string | null
          world_cup_group_id?: string | null
          knockout_round?: string | null
          knockout_position?: number | null
          home_team_id: string
          away_team_id: string
          home_score?: number | null
          away_score?: number | null
          is_played?: boolean
          played_at?: string | null
          home_penalties?: number | null
          away_penalties?: number | null
          winner_team_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          match_type?: 'qualifier' | 'world-cup-group' | 'world-cup-knockout'
          qualifier_group_id?: string | null
          world_cup_group_id?: string | null
          knockout_round?: string | null
          knockout_position?: number | null
          home_team_id?: string
          away_team_id?: string
          home_score?: number | null
          away_score?: number | null
          is_played?: boolean
          played_at?: string | null
          home_penalties?: number | null
          away_penalties?: number | null
          winner_team_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      team_tournament_skills: {
        Row: {
          id: string
          tournament_id: string
          team_id: string
          skill_snapshot: number
          created_at: string
        }
        Insert: {
          id?: string
          tournament_id: string
          team_id: string
          skill_snapshot: number
          created_at?: string
        }
        Update: {
          id?: string
          tournament_id?: string
          team_id?: string
          skill_snapshot?: number
          created_at?: string
        }
      }
    }
    Views: {
      team_statistics: {
        Row: {
          id: string
          name: string
          flag: string
          region: string
          skill: number
          total_matches: number
          wins: number
          draws: number
          losses: number
          goals_scored: number
          goals_conceded: number
        }
      }
    }
    Functions: {
      get_team_recent_matches: {
        Args: {
          team_id_param: string
          limit_param?: number
        }
        Returns: {
          match_id: string
          opponent_id: string
          opponent_name: string
          opponent_flag: string
          is_home: boolean
          team_score: number
          opponent_score: number
          result: string
          played_at: string
          stage: string
        }[]
      }
    }
  }
}
