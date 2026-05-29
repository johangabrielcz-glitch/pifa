// Control de acceso del rol "moderador" en el panel admin.
// Fuente única usada por el guard del layout y por la navegación.

export const MODERATOR_ALLOWED_ROUTES = ['/admin', '/admin/players', '/admin/trophies', '/admin/clubs', '/admin/users']

export function canModeratorAccess(pathname: string): boolean {
  return MODERATOR_ALLOWED_ROUTES.some((r) =>
    r === '/admin' ? pathname === '/admin' : pathname.startsWith(r)
  )
}
