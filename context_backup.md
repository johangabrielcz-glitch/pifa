# PIFA Project Context Backup

**Última actualización:** 2026-04-10 16:32 (Local)
**Estado Actual:** Fallos críticos en Notificaciones Push y Carga de App CORREGIDOS. Motor de partidos y Mercado estables.

## Tareas Completadas ✅
- [x] Gestión de Dashboard y Clubes (RefreshData fix).
- [x] Sistema de Mercado (Completo).
- [x] Storage & Assets (Image Upload integrado y funcional).
- [x] Match Engine (Calendario 24h y TypeScript fixes).
- [x] **Push Notifications:** Corrección de guardado de token (user_name fix) y conflicto de navegación (hang fix).

## Contexto de Desarrollo 🛠️
- **Push Notifications:** Se corrigió el error en `lib/push-notifications.ts` donde faltaba el campo `user_name` en el upsert.
- **Loading Hang:** Se resolvió el bloqueo en la pantalla de carga mediante el uso de `history.replaceState` en el capturador de tokens, eliminando el conflicto de enrutamiento con la página de inicio.

## Pendientes Próximos 📋
- [ ] Verificación final de flujo de usuario post-fix.
