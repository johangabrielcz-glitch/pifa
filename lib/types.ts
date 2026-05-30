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
      season_prizes: {
        Row: SeasonPrize
        Insert: Partial<SeasonPrize>
        Update: Partial<SeasonPrize>
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
      market_offers: {
        Row: MarketOffer
        Insert: MarketOfferInsert
        Update: Partial<MarketOffer>
      }
      notifications: {
        Row: Notification
        Insert: NotificationInsert
        Update: Partial<Notification>
      }
      market_history: {
        Row: MarketHistory
        Insert: MarketHistoryInsert
        Update: Partial<MarketHistory>
      }
      user_push_tokens: {
        Row: UserPushToken
        Insert: UserPushTokenInsert
        Update: UserPushTokenUpdate
      }
      match_appeals: {
        Row: MatchAppeal
        Insert: MatchAppealInsert
        Update: Partial<MatchAppeal>
      }
    }
  }
}

export interface Club {
  id: string
  name: string
  shield_url: string | null
  budget: number
  default_lineup: any | null
  red_card_check_counter: number
  created_at: string
  updated_at: string
}

export interface ClubInsert {
  id?: string
  name: string
  shield_url?: string | null
  budget?: number
  default_lineup?: any | null
  red_card_check_counter?: number
  created_at?: string
  updated_at?: string
}

export interface ClubUpdate {
  id?: string
  name?: string
  shield_url?: string | null
  budget?: number
  default_lineup?: any | null
  red_card_check_counter?: number
  updated_at?: string
}

// User types
export type UserRole = 'user' | 'admin' | 'moderator'

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

export type SquadRole = 'essential' | 'important' | 'rotation'
export type ContractStatus = 'active' | 'free_agent' | 'renewal_pending'
export type DtTab = 'home' | 'competitions' | 'stats' | 'calendar' | 'squad' | 'market' | 'news' | 'chat' | 'announcements' | 'hall_of_fame' | 'galas'
export type PlayerEmailType = 'complaint' | 'apology' | 'demand' | 'farewell' | 'general' | 'promotion_demand' | 'plea'

export interface Player {
  id: string
  club_id: string
  name: string
  position: string
  number: number | null
  age: number | null
  nationality: string | null
  photo_url: string | null
  is_on_sale: boolean
  sale_price: number | null
  stamina: number
  injury_matches_left: number
  injury_reason: string | null
  red_card_matches_left: number
  red_card_reason: string | null
  // Contract & Salary
  contract_seasons_left: number
  salary: number
  squad_role: SquadRole | null
  morale: number
  salary_paid_this_season: boolean
  wants_to_leave: boolean
  contract_status: ContractStatus
  release_clause: number
  is_one_club_man: boolean
  created_at: string
  updated_at: string
  // Relations
  club?: Club
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
  is_on_sale?: boolean
  sale_price?: number | null
  stamina?: number
  injury_matches_left?: number
  injury_reason?: string | null
  red_card_matches_left?: number
  red_card_reason?: string | null
  contract_seasons_left?: number
  salary?: number
  squad_role?: SquadRole | null
  morale?: number
  salary_paid_this_season?: boolean
  wants_to_leave?: boolean
  contract_status?: ContractStatus
  release_clause?: number
  is_one_club_man?: boolean
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
  is_on_sale?: boolean
  sale_price?: number | null
  stamina?: number
  injury_matches_left?: number
  injury_reason?: string | null
  red_card_matches_left?: number
  red_card_reason?: string | null
  contract_seasons_left?: number
  salary?: number
  squad_role?: SquadRole | null
  morale?: number
  salary_paid_this_season?: boolean
  wants_to_leave?: boolean
  contract_status?: ContractStatus
  release_clause?: number
  is_one_club_man?: boolean
  updated_at?: string
}

// ... (rest of the file until the end)

// =============================================
// MARKET & SYSTEM TYPES
// =============================================

export type MarketOfferStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'cancelled'
export type NotificationType = 
  | 'offer_received' 
  | 'offer_accepted' 
  | 'offer_rejected' 
  | 'offer_countered' 
  | 'offer_cancelled'
  | 'injury'
  | 'red_card'
  | 'player_email'
  | 'contract_expired'
  | 'player_unhappy'
  | 'player_seeking_transfer'
  | 'season_active'
  | 'appeal_accepted'
  | 'appeal_rejected'
  | 'appeal_resolved'

export interface MarketOffer {
  id: string
  player_id: string
  buyer_club_id: string
  seller_club_id: string
  amount: number
  status: MarketOfferStatus
  previous_offer_id: string | null
  created_at: string
  updated_at: string
  // Relations
  player?: Player
  buyer_club?: Club
  seller_club?: Club
}

export interface MarketOfferInsert {
  id?: string
  player_id: string
  buyer_club_id: string
  seller_club_id: string
  amount: number
  status?: MarketOfferStatus
  previous_offer_id?: string | null
}

export interface Notification {
  id: string
  club_id: string
  title: string
  message: string
  type: NotificationType
  data: any
  is_read: boolean
  created_at: string
}

export interface NotificationInsert {
  id?: string
  club_id: string
  title: string
  message: string
  type: NotificationType
  data?: any
  is_read?: boolean
}

export type ClauseNegotiationStatus = 'active' | 'blocked' | 'accepted'

export interface ClauseNegotiation {
  id: string
  player_id: string
  buyer_club_id: string
  season_id: string
  status: ClauseNegotiationStatus
  patience: number
  deal_terms: {
    salary: number
    squad_role: SquadRole
    seasons: number
  } | null
  created_at: string
  updated_at: string
  // Relations
  player?: Player
  buyer_club?: Club
}

export interface MarketHistory {
  id: string
  player_id: string
  from_club_id: string | null
  to_club_id: string | null
  amount: number
  type: string
  created_at: string
  // Relations
  player?: Player
  from_club?: Club
  to_club?: Club
}

export interface MarketHistoryInsert {
  id?: string
  player_id: string
  from_club_id?: string | null
  to_club_id?: string | null
  amount: number
  type?: string
}

// =============================================
// MATCH APPEALS TYPES
// =============================================

export type MatchAppealStatus = 'pending' | 'accepted' | 'rejected'

export interface AppealAnnotationPayload {
  goals: GoalEntry[]
  assists: AssistEntry[]
  mvp_player_id: string | null
  starting_xi: string[]
  substitutes_in: SubstitutionEntry[] | string[]
}

export interface MatchAppeal {
  id: string
  match_id: string
  club_id: string
  submitted_by: string | null
  original_home_score: number
  original_away_score: number
  original_home_annotation: AppealAnnotationPayload | null
  original_away_annotation: AppealAnnotationPayload | null
  proposed_home_score: number
  proposed_away_score: number
  proposed_home_annotation: AppealAnnotationPayload
  proposed_away_annotation: AppealAnnotationPayload
  reason: string
  status: MatchAppealStatus
  admin_notes: string | null
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  // Relations
  match?: Match & { home_club?: Club; away_club?: Club; competition?: Competition }
  club?: Club
}

export interface MatchAppealInsert {
  id?: string
  match_id: string
  club_id: string
  submitted_by?: string | null
  original_home_score: number
  original_away_score: number
  original_home_annotation?: AppealAnnotationPayload | null
  original_away_annotation?: AppealAnnotationPayload | null
  proposed_home_score: number
  proposed_away_score: number
  proposed_home_annotation: AppealAnnotationPayload
  proposed_away_annotation: AppealAnnotationPayload
  reason: string
  status?: MatchAppealStatus
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
  archived_at: string | null
  transfer_window_open: boolean
  contracts_decremented: boolean
  // Deadline scheduling (see lib/match-engine.ts computeSeasonSchedule)
  deadline_anchor: string | null // null => anchored to activation time (relative)
  deadline_gap_hours: number     // hours between consecutive day-slots (default 24)
  deadline_overrides: Record<string, string> // slotKey -> ISO deadline
  prizes_paid: boolean           // season-end prize money distributed once
  prizes_paid_at: string | null
  created_at: string
  updated_at: string
}

export interface SeasonInsert {
  id?: string
  name: string
  status?: SeasonStatus
  start_date?: string | null
  end_date?: string | null
  transfer_window_open?: boolean
}

export interface SeasonUpdate {
  name?: string
  status?: SeasonStatus
  start_date?: string | null
  end_date?: string | null
  activated_at?: string | null
  archived_at?: string | null
  transfer_window_open?: boolean
  contracts_decremented?: boolean
  deadline_anchor?: string | null
  deadline_gap_hours?: number
  deadline_overrides?: Record<string, string>
  prizes_paid?: boolean
  prizes_paid_at?: string | null
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

// Season-end prize configuration (per competition; see lib/prize-engine.ts)
export interface PrizeConfig {
  per_win: number          // amount per match won
  title_bonus: number      // extra bonus for the champion
  // League: amounts by final table position (index 0 = 1st). Missing positions
  // fall back to the last entry. Used when competition.type === 'league'.
  positions: number[]
  // Cup / groups_knockout: amount by round reached. Keys are tier ids.
  rounds: Record<string, number> // champion|finalist|semifinal|quarterfinal|round_16|round_32|group_stage
}

// Competition types
export interface Competition {
  id: string
  season_id: string
  name: string
  type: CompetitionType
  status: CompetitionStatus
  config: CompetitionConfig
  prize_config: PrizeConfig | null // null => computed defaults
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
  prize_config?: PrizeConfig | null
}

// Season prize payout audit row
export interface SeasonPrize {
  id: string
  season_id: string
  club_id: string
  competition_id: string | null
  category: 'match_won' | 'classification' | 'title'
  detail: string
  amount: number
  created_at: string
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

export interface SubstitutionEntry {
  player_in: string
  player_out: string
}

export interface MatchAnnotation {
  id: string
  match_id: string
  club_id: string
  goals: GoalEntry[]
  assists: AssistEntry[]
  mvp_player_id: string | null
  starting_xi: string[]
  substitutes_in: SubstitutionEntry[] | string[]
  created_at: string
  updated_at: string
}

export interface MatchAnnotationInsert {
  match_id: string
  club_id: string
  goals?: GoalEntry[]
  assists?: AssistEntry[]
  mvp_player_id?: string | null
  starting_xi?: string[]
  substitutes_in?: string[]
  updated_at?: string
}

// =============================================
// PUSH NOTIFICATION TYPES
// =============================================

export interface UserPushToken {
  user_id: string
  expo_push_token: string
  device_info: any | null
  created_at: string
}

export interface UserPushTokenInsert {
  user_id: string
  expo_push_token: string
  device_info?: any | null
  created_at?: string
}

export interface UserPushTokenUpdate {
  user_id?: string
  expo_push_token?: string
  device_info?: any | null
}

// =============================================
// PLAYER EMAIL / BRAIN TYPES
// =============================================

export interface PlayerEmail {
  id: string
  player_id: string
  club_id: string
  subject: string
  body: string
  email_type: PlayerEmailType
  is_read: boolean
  action_data: { requested_role?: string; requested_salary?: number } | null
  action_taken: boolean
  created_at: string
  // Relations
  player?: Player
}

export interface PlayerEmailInsert {
  id?: string
  player_id: string
  club_id: string
  subject: string
  body: string
  email_type?: PlayerEmailType
  is_read?: boolean
  action_data?: { requested_role?: string; requested_salary?: number } | null
  action_taken?: boolean
}
export interface Diffusion {
  id: string
  title: string
  content: string
  image_url: string | null
  created_at: string
  updated_at: string
}

export interface DiffusionInsert {
  id?: string
  title: string
  content: string
  image_url?: string | null
}
export interface Trophy {
  id: string
  name: string
  image_url: string
  created_at: string
  updated_at: string
}

export interface ClubTrophy {
  id: string
  club_id: string
  trophy_id: string
  quantity: number
  created_at: string
  updated_at: string
  trophies?: Trophy
}

// =============================================
// SEASON AWARDS (gala — premios reales)
// =============================================

export type AwardKey =
  | 'ballon_dor'
  | 'the_best'
  | 'best_playmaker'
  | 'golden_boot'
  | 'oliver_kahn'
  | 'club_year'
  | 'dt_year'

export type AwardWinnerType = 'player' | 'club' | 'user'

export interface AwardNomineeRef {
  type: AwardWinnerType
  id: string
}

export interface SeasonAward {
  id: string
  season_id: string
  award_key: AwardKey
  winner_type: AwardWinnerType
  winner_id: string | null
  nominees: AwardNomineeRef[]
  created_at: string
  updated_at: string
}

export interface SeasonAwardWeight {
  id: string
  season_id: string
  competition_id: string
  weight: number
}

export interface SeasonGalaPublish {
  id: string
  season_id: string
  is_open: boolean
  results_visible: boolean
  payload: any // GalaPayload (definido en lib/award-engine.ts)
  opened_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
}

export interface AwardVote {
  id: string
  season_id: string
  award_key: AwardKey
  voter_user_id: string
  voter_name: string | null
  first_id: string | null
  second_id: string | null
  third_id: string | null
  created_at: string
  updated_at: string
}
