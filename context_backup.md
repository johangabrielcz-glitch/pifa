# PIFA Project Context Backup

**Última actualización:** 2026-04-10 16:05 (Local)
**Estado Actual:** Mercado y Storage completados. Enfocándose en corregir errores críticos del motor de partidos y testear Notificaciones Push.

## Tareas Completadas ✅
- [x] Corregida la carga inicial del Dashboard (refreshData).
- [x] Resuelto el error "Sin Club Asignado".
- [x] Tipado fuerte para `user_push_tokens` en `lib/types.ts`.
- [x] Refactorización de `lib/push-notifications.ts` y `PushTokenHandler.tsx`.
- [x] Resolución del Build Error en `app/(dashboard)/dashboard/page.tsx`.
- [x] **Sistema de Mercado:** SQL, lógica y notificaciones completadas.
- [x] **Storage & Assets:** Bucket `pifa-assets` configurado y componente `ImageUpload` listo.

## Contexto de Desarrollo 🛠️
- **Dashboard:** Funcional con carga persistente desde `localStorage` y Supabase.
- **Mercado:** Flujo de ofertas, contraofertas y compras directas operativo.
- **Storage:** Configurado para subida de fotos de jugadores y escudos.

## Pendientes Próximos 📋
- [ ] **Match Engine:** Resolver errores de TypeScript (tipo `never`) en `lib/match-engine.ts`.
- [ ] **Match Engine:** Arreglar el orden del calendario en partidos de ida y vuelta (deadlines duplicadas).
- [ ] **Push Notifications:** Testeo real del flujo de sincronización y envío.
- [ ] **UI Admin:** Integrar `ImageUpload` en las páginas de edición de Clubes y Jugadores.

