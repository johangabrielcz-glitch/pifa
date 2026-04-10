# PIFA Project Context Backup

**Última actualización:** 2026-04-10 16:40 (Local)
**Estado Actual:** Sistema de Notificaciones Push REDISEÑADO para APK (Desacoplado). Mercado, Storage y Match Engine estables.

## Tareas Completadas ✅
- [x] Gestión de Dashboard y Clubes (RefreshData fix).
- [x] Sistema de Mercado (Completo).
- [x] Storage & Assets (Image Upload completo).
- [x] Match Engine (Calendario 24h y TS fixes).
- [x] **Push Notifications (APK Fix):** Captura de token desacoplada de la sincronización para evitar bloqueos en el inicio del APK.
- [x] **Depuración Visual:** Integración de "Toasts" para confirmar el estado de sincronización del token en tiempo real.

## Contexto de Desarrollo 🛠️
- **Push Notifications:** El `PushTokenHandler` ahora es puramente síncrono (solo captura y guarda en `localStorage`). La sincronización real ocurre en el Dashboard/Admin una vez que la app ha cargado, evitando que el APK se quede en la pantalla de carga.

## Pendientes Próximos 📋
- [ ] Verificar con el usuario si los mensajes de confirmación (toasts) aparecen correctamente en el APK.
- [ ] Eliminar los mensajes de depuración una vez confirmada la estabilidad.
