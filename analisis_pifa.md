# Análisis Quirúrgico y Profundo: PIFA (Pro International Football Association)

## 1. Introducción y Resumen Ejecutivo

**PIFA** es una plataforma web integral de gestión deportiva, diseñada específicamente para simular y administrar una liga de fútbol virtual. Funciona como un "Football Manager" en tiempo real, donde los usuarios asumen el rol de Directores Técnicos (DTs) y los administradores gestionan el ecosistema global.

La aplicación permite la inscripción en competiciones (ligas, copas), gestión exhaustiva de la plantilla (contratos, salarios, moral, fatiga, lesiones, suspensiones), un mercado de fichajes dinámico (ofertas directas, cláusulas de rescisión, agentes libres), y un sistema de partidos con anotaciones detalladas (goles, asistencias, MVP, tácticas). Todo esto operando sobre un sistema de "temporadas" controladas por los administradores.

## 2. Stack Tecnológico y Arquitectura

El proyecto está construido sobre una arquitectura moderna serverless/JAMStack:

*   **Core Framework**: Next.js 16.2.0 (App Router) y React 19.
*   **Base de Datos y Backend**: Supabase (PostgreSQL, Auth, Storage para escudos/fotos, Realtime para chats y noticias).
*   **Estilos y UI**: Tailwind CSS v4, componentes basados en Radix UI (`@radix-ui/react-*`), animaciones complejas con Framer Motion y `tw-animate-css`.
*   **Validación y Formularios**: React Hook Form combinado con Zod.
*   **Gráficos e Iconos**: Recharts para visualización de datos (Ej. Radar del ADN del equipo) y Lucide React.
*   **Notificaciones**: Expo Push Notifications (`syncPushToken`, `sendExpoPush`).

---

## 3. Topología de Directorios y Rutas

### `/app` (Next.js App Router)
*   **(admin)/**: Rutas protegidas exclusivas para el rol `admin`.
    *   `/admin/page.tsx`: "Consola Federal". Dashboard estadístico (total de usuarios, clubes, estado operativo de DB y mercado).
    *   `/admin/[entidades]`: Rutas para CRUD de `clubs`, `players`, `seasons`, `matches`, `trophies`, `users`, `super-dashboard`, `broadcasting`.
*   **(dashboard)/**: Interfaz principal para el usuario regular (DT).
    *   `/dashboard/page.tsx`: Pantalla principal con múltiples "pestañas" virtuales (estado, inbox de jugadores, radar del equipo, fixture, noticias, standing, salón de la fama).
    *   `/dashboard/market`: Interfaz del mercado de fichajes.
    *   `/dashboard/match/[id]`: Interfaz de detalles del partido y submit de resultados/alineaciones.
*   **(auth)/**: Flujos de autenticación.
    *   `/login`: Login para DTs.
    *   `/admin-login`: Login específico para personal administrativo.
*   `api/`: Endpoints de Next.js, por ejemplo `/api/cron/resolve-expired` para automatizaciones de cron jobs.
*   `globals.css`: Variables CSS globales (design tokens) y configuración de Tailwind.

### `/lib` (Motores Lógicos y Tipos)
El núcleo duro del negocio reside aquí, dividido en "motores" (engines) modulares.
*   `types.ts`: Esquemas de TypeScript que mapean 1:1 con las tablas de PostgreSQL (Supabase).
*   `supabase.ts`: Cliente de inicialización de Supabase.
*   `*-engine.ts`: Lógica de transacciones de base de datos compleja (detallada en sección 5).
*   `auth-context.tsx`: Proveedor de estado global para la sesión del usuario autenticado.
*   `push-notifications.ts`: Integración con servicios push.

### `/components/pifa` (Componentes de Negocio)
*   **Navegación**: `admin-navigation.tsx`, `dt-navigation.tsx`, `mobile-nav.tsx`.
*   **Mercado y Jugadores**: `ultimate-card.tsx` (cartas estilo FUT), `player-card.tsx`, `player-management-dialog.tsx`, `clause-chat-drawer.tsx`.
*   **Partidos y Táctica**: `pitch-lineup.tsx` (cancha interactiva), `match-details-drawer.tsx`.
*   **Comunicación**: `global-chat.tsx` (canal global realtime), `player-inbox.tsx` (correos de los jugadores al DT).

### `/scripts` (Migraciones y Configuración DB)
Archivos `.sql` numerados que definen el esquema DDL de la base de datos de Supabase, activadores (triggers) y políticas RLS (Row Level Security).
Ejemplos: `01-create-tables.sql`, `04-create-seasons-competitions.sql`, `09-market-system.sql`.

---

## 4. Base de Datos (Esquema y Relaciones)

Las tablas principales son:
*   **users**: Almacena las cuentas. `role` (admin/user) determina el acceso. Relación 1:1 con `clubs`.
*   **clubs**: Información institucional. Escudos (`shield_url`), presupuesto (`budget`), alineación por defecto (`default_lineup`).
*   **players**: El activo más complejo. Guarda posición, stats (stamina, morale), sanciones (`red_card_matches_left`, `injury_matches_left`), contrato (`salary`, `release_clause`, `contract_seasons_left`, `wants_to_leave`).
*   **seasons & competitions**: Una temporada engloba múltiples competiciones (ligas, copas). Las competiciones tienen un `config` JSON (puntos por victoria, formato de grupos).
*   **matches**: Calendario de encuentros. Guarda scores, fechas límite (`deadline`), y estado (`scheduled`, `finished`, `postponed`).
*   **match_annotations**: Información minuciosa del partido (Alineación titular, cambios, goles, asistencias, MVP). Un partido suele tener dos anotaciones (una por equipo).
*   **market_offers & clause_negotiations**: Registro transaccional de fichajes en curso y terminados.
*   **player_competition_stats & standings**: Tablas de materialización para clasificaciones y tablas de goleadores/asistencias.

---

## 5. Quirófano Lógico: Los Motores (Engines)

El diseño arquitectónico extrae la lógica de negocio densa desde los componentes hacia funciones aisladas en `lib/`.

### A. `match-engine.ts` (Motor de Partidos)
*   Gestiona el envío de resultados (`submitAnnotation`).
*   **Idempotencia**: Contiene salvaguardas para no procesar dos veces el mismo resultado.
*   Aplica goles a la tabla de posiciones (`updateStandings`) calculando Puntos, GF, GC, DG.
*   Actualiza estadísticas individuales (`updatePlayerStats`), sumando goles, asistencias, MVPs y partidos jugados a `player_competition_stats`.
*   Gestiona plazos (`calculateMatchDeadlines`, `checkAndAutoResolveExpired`) para obligar a los DTs a jugar o aplicar W.O. (Walkover).

### B. `market-engine.ts` (Motor de Mercado)
*   **Transferencias Estándar**: `createOffer`, `handleOfferResponse`. Permite pujas de club a club.
*   **Transferencias Directas**: `buyPlayerDirectly` para compras inmediatas autorizadas.
*   **Sistema de Cláusulas**: `startClauseNegotiation`, `transferPlayerByClause`. Si un club paga la cláusula de rescisión (`release_clause`), se ignora al club vendedor y se negocia directamente el salario con el jugador.
*   **Despidos**: `firePlayer`. Rompe el contrato convirtiendo al jugador en Agente Libre, asumiendo posiblemente un costo de penalización.

### C. `injury-engine.ts` (Motor Físico y Disciplinario)
*   Actúa silenciosamente post-partido basándose en las anotaciones.
*   **Fatiga**: `processMatchFatigue` deduce `stamina` a quienes jugaron.
*   **Lesiones**: `processInjuries` aplica probabilidad de lesión. Si la stamina está baja, la probabilidad y gravedad de la lesión se disparan dramáticamente.
*   **Sanciones**: `processRedCards`. Suma partidos de suspensión.
*   **Recuperación**: `processRestRecovery` y `processByeRecovery`. Si un jugador no juega (descansa o suplente sin entrar), recupera `stamina` progresivamente.

### D. `contract-engine.ts` (Motor Financiero y Laboral)
*   **Restricciones de Plantilla**: `canUsePlayer` valida si un jugador es elegible (verificando que no esté lesionado, expulsado, o en huelga por falta de pago).
*   **Salarios**: `paySalary`, `payAllSalaries`. El club debe pagar de su presupuesto la `salary_paid_this_season`. Si no lo hace, baja la moral y el jugador exige salir (`wants_to_leave`).
*   **Cambio de Temporada**: `decrementContracts` reduce los años de contrato al cambiar de temporada, volviendo libres a quienes lleguen a cero.

### E. `morale-engine.ts` (Motor Emocional y de Correos)
*   Genera interacciones "humanas" entre los jugadores virtuales y el DT (`generatePlayerEmailDirect`).
*   Actualiza la moral en base a victorias/derrotas.
*   Si el equipo gana repetidamente, los jugadores clave pueden exigir aumentos de sueldo (`promotion_demand`).
*   Si la moral llega a niveles críticos, el jugador manda un correo de queja (`complaint`) o pide formalmente ser puesto en la lista de transferencias.

---

## 6. Análisis del Funcionamiento Frontend y UI/UX

*   **Dashboards Ricos (Bento Grids)**: El archivo principal `/dashboard/page.tsx` maneja una interfaz masiva que conmuta según `activeTab`. Utiliza Layouts "Bento" para distribuir la información (Noticias, Radar, Próximo Partido, Finanzas) en un lienzo scrolleable.
*   **Optimización de Carga Visual**: Usa técnicas de optimización mediante el almacenamiento de sesión local para evitar saltos. El componente `PifaLogo` y pantallas de carga tipo "Sincronizando Club" dan feedback instantáneo de profesionalidad.
*   **Interactividad "App-like"**: Utiliza librerías como Vaul (Drawers para móviles) y Radix UI Dialogs para abrir modales sin perder contexto. Las alineaciones se construyen en una vista de campo virtual gráfica (`pitch-lineup.tsx`).
*   **Upload Inteligente**: Implementa `resizeImage` del lado del cliente en el frontend de `page.tsx` mediante `canvas` nativo. Redimensiona los escudos pesados a formatos ligeros (250x250 PNG) *antes* de subir a Supabase Storage, ahorrando ancho de banda y costos operativos masivamente.

---

## 7. Flujos Críticos de Negocio

### El Ciclo Vital de una Jornada (Match Flow)
1. El Administrador o el sistema de Cron marca un partido como "in progress" o establece un deadline.
2. Ambos DTs configuran su `pitch-lineup` táctico.
3. El DT local juega el partido de la vida real/FIFA y va al sistema a introducir las estadísticas (Goles, Asistentes, Minutos de los suplentes).
4. El sistema `submitAnnotation` cruza los datos.
5. Inmediatamente el sistema ejecuta los Engines en cadena:
   - `updateStandings`: actualiza puntos.
   - `injury-engine`: baja stamina a titulares y suplentes que entraron, sube a los que descansaron.
   - `injury-engine`: asigna tarjetas rojas y lesiones si sucedieron en el juego.
   - `morale-engine`: incrementa moral al ganador, castiga al perdedor. Revisa si alguien debe quejarse.

### El Cierre del Mercado y Contratos
1. El Administrador abre/cierra la ventana de transferencias (`transfer_window_open` flag en la Temporada).
2. Los DTs renuevan jugadores pagando primas, o despiden lastre.
3. Al finalizar la temporada global, se ejecuta `decrementContracts`. Todos los jugadores con 1 año de contrato restante pasan a estatus `free_agent`.
4. Todos los indicadores de salarios (`salary_paid_this_season`) se resetean a `false`, obligando a los clubes a pagar sus nóminas en la nueva temporada para evitar huelgas.

## 8. Conclusión del Análisis

**PIFA** es una plataforma con un nivel de complejidad altísimo y quirúrgico en el manejo del estado (State Management). Destaca excepcionalmente por:

1. **Desacoplamiento de Lógica**: Aislar los cálculos matemáticos (lesiones, moral, finanzas) en los archivos `*-engine.ts` permite un testeo limpio y reusabilidad tanto en el backend/cron como en llamadas directas del frontend.
2. **Arquitectura Realtime**: Al hacer uso extensivo de los canales de Supabase para chats y noticias, da la sensación de ser una app viva en tiempo real.
3. **Escalabilidad del Modelo de Datos**: El esquema permite N competiciones simultáneas con configuraciones polimórficas (Ligas, Copas a eliminación directa, Fase de Grupos) sin romper el esquema relacional de los jugadores.
4. **Game Design Inmersivo**: Las mecánicas de la fatiga, moral y el sistema de correos eleva el proyecto de ser un simple "creador de torneos" a un simulador de gestión completo.
