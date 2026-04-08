// Database types for Supabase
export interface Database {
  public: {
    Tables: {
      clubs: {
        Row: Club
        Insert: ClubInsert
        Update: ClubUpdate
      }
      users: {
        Row: User
        Insert: UserInsert
        Update: UserUpdate
      }
      players: {
        Row: Player
        Insert: PlayerInsert
        Update: PlayerUpdate
      }
      seasons: {
        Row: Season
        Insert: SeasonInsert
        Update: SeasonUpdate
      }
      competitions: {
        Row: Competition
        Insert: CompetitionInsert
        Update: CompetitionUpdate
      }
      matches: {
        Row: Match
        Insert: MatchInsert
        Update: MatchUpdate
      }
      standings: {
        Row: Standing
        Insert: Partial<Standing>
        Update: Partial<Standing>
      }
      player_competition_stats: {
        Row: PlayerCompetitionStats
        Insert: Partial<PlayerCompetitionStats>
        Update: Partial<PlayerCompetitionStats>
      }
      competition_clubs: {
        Row: CompetitionClub
        Insert: Partial<CompetitionClub>
        Update: Partial<CompetitionClub>
      }
      competition_stages: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
      match_annotations: {
        Row: MatchAnnotation
        Insert: MatchAnnotationInsert
        Update: Partial<MatchAnnotation>
      }
    }
  }
}

// Club types
export interface Club {
  id: string
  name: string
  shield_url: string | null
  budget: number
  created_at: string
  updated_at: string
}

export interface ClubInsert {
  id?: string
  name: string
  shield_url?: string | null
  budget?: number
  created_at?: string
  updated_at?: string
}

export interface ClubUpdate {
  id?: string
  name?: string
  shield_url?: string | null
  budget?: number
  updated_at?: string
}

// User types
export type UserRole = 'user' | 'admin'

export interface User {
  id: string
  username: string
  password: string
  full_name: string
  role: UserRole
  club_id: string | null
  created_at: string
  updated_at: string
}

export interface UserInsert {
  id?: string
  username: string
  password: string
  full_name: string
  role?: UserRole
  club_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface UserUpdate {
  id?: string
  username?: string
  password?: string
  full_name?: string
  role?: UserRole
  club_id?: string | null
  updated_at?: string
}

// Player types
export type PlayerPosition = 
  | 'GK' 
  | 'CB' 
  | 'LB' 
  | 'RB' 
  | 'CDM' 
  | 'CM' 
  | 'CAM' 
  | 'LM' 
  | 'RM' 
  | 'LW' 
  | 'RW' 
  | 'ST' 
  | 'CF'

export interface Player {
  id: string
  club_id: string
  name: string
  position: string
  number: number | null
  age: number | null
  nationality: string | null
  photo_url: string | null
  created_at: string
  updated_at: string
}

export interface PlayerInsert {
  id?: string
  club_id: string
  name: string
  position: string
  number?: number | null
  age?: number | null
  nationality?: string | null
  photo_url?: string | null
  created_at?: string
  updated_at?: string
}

export interface PlayerUpdate {
  id?: string
  club_id?: string
  name?: string
  position?: string
  number?: number | null
  age?: number | null
  nationality?: string | null
  photo_url?: string | null
  updated_at?: string
}

// =============================================
// SEASON & COMPETITION TYPES
// =============================================

export type SeasonStatus = 'draft' | 'active' | 'finished'
export type CompetitionStatus = 'draft' | 'in_progress' | 'finished'
export type CompetitionType = 'league' | 'cup' | 'groups_knockout'
export type MatchStatus = 'scheduled' | 'in_progress' | 'finished' | 'postponed'
export type StageType = 'group' | 'knockout' | 'league'
export type StageStatus = 'pending' | 'in_progress' | 'finished'

// Season types
export interface Season {
  id: string
  name: string
  status: SeasonStatus
  start_date: string | null
  end_date: string | null
  activated_at: string | null
  created_at: string
  updated_at: string
}

export interface SeasonInsert {
  id?: string
  name: string
  status?: SeasonStatus
  start_date?: string | null
  end_date?: string | null
}

export interface SeasonUpdate {
  name?: string
  status?: SeasonStatus
  start_date?: string | null
  end_date?: string | null
  activated_at?: string | null
  updated_at?: string
}

// Competition config types
export interface LeagueConfig {
  rounds: number // 1 = solo ida, 2 = ida y vuelta
  points_win: number
  points_draw: number
  points_loss: number
}

export interface CupConfig {
  legs: number // 1 = partido único, 2 = ida y vuelta
  extra_time: boolean
  penalties: boolean
}

export interface GroupsKnockoutConfig {
  groups_count: number
  teams_per_group: number
  qualify_per_group: number
  knockout_legs: number
}

export type CompetitionConfig = LeagueConfig | CupConfig | GroupsKnockoutConfig

// Competition types
export interface Competition {
  id: string
  season_id: string
  name: string
  type: CompetitionType
  status: CompetitionStatus
  config: CompetitionConfig
  created_at: string
  updated_at: string
}

export interface CompetitionInsert {
  id?: string
  season_id: string
  name: string
  type: CompetitionType
  status?: CompetitionStatus
  config?: CompetitionConfig
}

export interface CompetitionUpdate {
  name?: string
  type?: CompetitionType
  status?: CompetitionStatus
  config?: CompetitionConfig
}

// Competition Club (inscribed clubs)
export interface CompetitionClub {
  id: string
  competition_id: string
  club_id: string
  group_name: string | null
  seed: number | null
  created_at: string
  club?: Club // Relation
}

// Competition Stage
export interface CompetitionStage {
  id: string
  competition_id: string
  name: string
  type: StageType
  stage_order: number
  status: StageStatus
  created_at: string
  updated_at: string
}

// Match types
export interface Match {
  id: string
  competition_id: string
  stage_id: string | null
  home_club_id: string
  away_club_id: string
  match_order: number
  matchday: number | null
  round_name: string | null
  group_name: string | null
  leg: number
  scheduled_date: string | null
  deadline: string | null
  status: MatchStatus
  home_score: number | null
  away_score: number | null
  played_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Relations
  home_club?: Club
  away_club?: Club
  competition?: Competition
}

export interface MatchInsert {
  id?: string
  competition_id: string
  stage_id?: string | null
  home_club_id: string
  away_club_id: string
  match_order: number
  matchday?: number | null
  round_name?: string | null
  group_name?: string | null
  leg?: number
  scheduled_date?: string | null
  deadline?: string | null
  status?: MatchStatus
  home_score?: number | null
  away_score?: number | null
  played_at?: string | null
  notes?: string | null
  updated_at?: string
}

export interface MatchUpdate {
  stage_id?: string | null
  home_club_id?: string
  away_club_id?: string
  match_order?: number
  matchday?: number | null
  round_name?: string | null
  group_name?: string | null
  leg?: number
  scheduled_date?: string | null
  deadline?: string | null
  status?: MatchStatus
  home_score?: number | null
  away_score?: number | null
  played_at?: string | null
  notes?: string | null
  updated_at?: string
}

// Standings (table positions)
export interface Standing {
  id: string
  competition_id: string
  stage_id: string | null
  club_id: string
  group_name: string | null
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  position: number | null
  updated_at: string
  club?: Club // Relation
}

// Player competition stats
export interface PlayerCompetitionStats {
  id: string
  competition_id: string
  player_id: string
  club_id: string
  matches_played: number
  goals: number
  assists: number
  mvp_count: number
  yellow_cards: number
  red_cards: number
  minutes_played: number
  updated_at: string
  player?: Player // Relation
  club?: Club // Relation
}

// =============================================
// EXTENDED TYPES WITH RELATIONS
// =============================================

// User with club relation
export interface UserWithClub extends User {
  club: Club | null
}

// Club with players and DT
export interface ClubWithDetails extends Club {
  players: Player[]
  dt: User | null
}

// Auth session (stored in localStorage)
export interface AuthSession {
  user: User
  club: Club | null
}

// Season with competitions
export interface SeasonWithCompetitions extends Season {
  competitions: Competition[]
}

// Competition with details
export interface CompetitionWithDetails extends Competition {
  season?: Season
  clubs: CompetitionClub[]
  stages: CompetitionStage[]
  matches: Match[]
}

// Match with full details
export interface MatchWithDetails extends Match {
  home_club: Club
  away_club: Club
  competition: Competition
}

// =============================================
// MATCH ANNOTATION TYPES
// =============================================

export interface GoalEntry {
  player_id: string
  count: number
}

export interface AssistEntry {
  player_id: string
  count: number
}

export interface MatchAnnotation {
  id: string
  match_id: string
  club_id: string
  goals: GoalEntry[]
  assists: AssistEntry[]
  mvp_player_id: string | null
  created_at: string
  updated_at: string
}

export interface MatchAnnotationInsert {
  match_id: string
  club_id: string
  goals?: GoalEntry[]
  assists?: AssistEntry[]
  mvp_player_id?: string | null
  updated_at?: string
}
