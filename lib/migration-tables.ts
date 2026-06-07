// Single source of truth for the project-to-project migration flow.
// Both the export and import endpoints (and the matching SQL helpers in
// scripts/25-db-migration.sql) iterate this list. Update it whenever a new
// table is added to the app.

// Insert order is FK-safe (parents first). Truncate happens through the SQL
// helper migration_truncate_all() with session_replication_role=replica anyway,
// but a sane order helps when troubleshooting and keeps the JSON readable.
export const MIGRATION_TABLES: string[] = [
  // Identity (parents of almost everything)
  'clubs',
  'users',
  // Players + their auxiliary tables
  'players',
  'player_emails',
  // Seasons/competitions tree
  'seasons',
  'competitions',
  'competition_clubs',
  'competition_stages',
  'matches',
  'standings',
  'player_competition_stats',
  'match_annotations',
  // Market + global tables
  'market_offers',
  'market_history',
  'notifications',
  'user_push_tokens',
  // Misc features
  'diffusions',
  'trophies',
  'club_trophies',
  'match_appeals',
  // Season awards / gala
  'season_awards',
  'season_award_weights',
  'season_gala_publish',
  'award_votes',
  // Recent features
  'season_prizes',
  'club_bonuses',
  'player_creation_requests',
]

// Columns that store absolute public URLs to Supabase Storage objects. Used by
// /api/admin/storage-migrate to re-upload images into the destination bucket
// and rewrite the URLs in-place after a DB import.
export interface ImageColumn {
  table: string
  column: string
}

export const IMAGE_COLUMNS: ImageColumn[] = [
  { table: 'clubs', column: 'shield_url' },
  { table: 'players', column: 'photo_url' },
  { table: 'trophies', column: 'image_url' },
  { table: 'diffusions', column: 'image_url' },
  { table: 'player_creation_requests', column: 'photo_url' },
]

export const STORAGE_BUCKET = 'pifa-assets'
