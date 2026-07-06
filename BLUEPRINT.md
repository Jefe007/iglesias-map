# Blueprint — Red de Distribución La Guaira v2

> Documento de planificación generado por entrevista (El Arquitecto). Describe el estado deseado del sistema **antes** de escribir código. Si algo aquí no refleja lo que quieres, se ajusta este documento, no el código.
>
> Fecha: 2026-07-06

---

## 1. Resumen ejecutivo

Hoy la app es un **mapa de iglesias** con un modo de edición compartido. El pivote pedido: pasa a ser un **sistema de gestión de distribución multi-proyecto**, donde el mapa es una función más entre varias. El nuevo centro de gravedad son los **puntos de distribución**, organizados alrededor de 3 proyectos activos (**Water, Food, NFI**), con:

- Registro de entregas por item y proyecto en cada centro.
- Un flujo de **solicitudes** entre el equipo de supervisión (en campo) y el depósito (que las prepara).
- Choferes y rutas reales (distancia/tiempo/camino sugerido) para moverse entre la Base, el depósito, el hospital, el desalinizador y los centros.
- Una vista de **métricas** con gráficas y descarga (PDF/Excel).

## 2. Objetivos y alcance

**En alcance (este blueprint):**
- Reestructurar la navegación: Inicio = lista de puntos de distribución, Mapa = sección aparte.
- Catálogo de items editable por proyecto (Water/Food/NFI), con unidad de medida.
- Registro de entregas multi-línea (varios items/proyectos en una sola visita).
- Marcado manual de qué proyectos tiene activos cada centro.
- Solicitudes de campo → depósito, con estado y urgencia.
- Choferes (nombre/teléfono/disponibilidad) administrados por un coordinador de base.
- Rutas reales en auto (OSRM) desde la ubicación GPS del usuario hacia cualquier punto marcado.
- Nuevos puntos informativos en el mapa: Base (Hotel Eurobuilding), Depósito, Desalinizador de agua (mismo tratamiento que el Hospital hoy: pin + foto + info, sin métricas propias).
- Vista de métricas por centro/proyecto/item con gráficas y export PDF + Excel/CSV.
- Dos passcodes (Supervisión / Depósito-Admin) reemplazando el passcode único actual.

**Fuera de alcance (explícitamente, por ahora):**
- Inventario real con conteo de stock en depósito (se decidió que las solicitudes son un tablero de pendientes, no un sistema de existencias).
- Cuentas individuales de usuario / login por persona (se usan passcodes de rol).
- Choferes actualizando su propia disponibilidad desde un celular.
- Rutas entre dos puntos arbitrarios elegidos libremente (el origen siempre es la ubicación GPS actual).
- Reconciliación fila-por-fila de los 10 centros contra la base de datos actual (queda como tarea de migración a ejecutar en la fase de implementación, ver §11).

## 3. Usuarios y roles

| Rol | Passcode | Puede hacer |
|---|---|---|
| **Público / campo (sin passcode)** | — | Ver Inicio, Mapa, Métricas, lista de Choferes y Solicitudes (solo lectura) |
| **Supervisión** | `SUPERVISION_PASSCODE` | Todo lo público + crear solicitudes, ver rutas y elegir destino en el mapa |
| **Depósito / Admin** | `DEPOSITO_PASSCODE` | Todo lo de Supervisión + avanzar el estado de solicitudes, gestionar catálogo de items, registrar entregas, marcar proyectos activos por centro, crear/editar/eliminar iglesias/centros/puntos especiales, gestionar choferes y su disponibilidad |

El passcode de Depósito/Admin es superconjunto del de Supervisión (si tienes el de Depósito, también puedes hacer lo de Supervisión). No hay registro de "quién exactamente" hizo cada acción — solo qué rol.

## 4. Stack tecnológico

Se mantiene el stack actual, con dos incorporaciones puntuales:

- **Next.js 16 (App Router) + React 19** — sin cambios.
- **Supabase** (Postgres + Storage) — sin cambios, se agregan tablas nuevas (§6).
- **react-leaflet / Leaflet** — sin cambios, se agregan capas y un control de ruta.
- **idb (IndexedDB)** — se extiende el esquema offline con los nuevos stores (§15).
- **html2canvas-pro + jsPDF** — se reutiliza para exportar PDF de Métricas (ya se usa para exportar el mapa).
- **Nuevo:** una librería de gráficas ligera para Métricas — se recomienda **Chart.js** (vía `react-chartjs-2` o uso directo) por ser liviana y no requerir SVG pesado; alternativa: **Recharts**. Cualquiera funciona con los datos ya definidos en §6.
- **Nuevo:** export a CSV — no requiere librería nueva (se genera un blob de texto a mano, igual de simple que un JSON.stringify). Si más adelante se quiere `.xlsx` real con formato, se puede añadir `xlsx` (SheetJS), pero no es necesario para arrancar.
- **Nuevo:** **OSRM** (`router.project-osrm.org`, servidor público) para calcular rutas en auto — sin SDK, es un `fetch` a una URL con lat/lng (ver §14).
- **Nuevo:** Geolocation API del navegador (`navigator.geolocation`) para el origen de la ruta.

## 5. Arquitectura general

Se mantiene la asimetría lectura/escritura ya documentada en `CLAUDE.md`: el cliente lee de Supabase directo con la clave anónima; toda escritura pasa por `app/api/*/route.ts` con la clave de servicio, verificando el passcode de rol en el header `x-edit-passcode`.

```
Cliente (Next.js, offline-first)
 ├─ Lecturas ──────────────► Supabase (anon key) ─── espejo en IndexedDB
 ├─ Escrituras ────────────► /api/* (valida passcode+rol) ─► Supabase (service role)
 ├─ Sin red (cualquiera) ──► IndexedDB (snapshot + cola de mutaciones pendientes)
 ├─ Rutas en auto ─────────► OSRM público (requiere internet, no tiene fallback offline)
 └─ Service Worker ────────► cachea tiles del mapa + shell de la app (sin cambios de fondo)
```

Las tres capas offline (IndexedDB + cola, replay al reconectar, service worker) que ya existen se **extienden**, no se reemplazan, a las tablas nuevas (items, entregas por línea, solicitudes, choferes).

## 6. Base de datos

Se mantiene la tabla `churches` (no se renombra a `locations`: minimiza el riesgo de migración y todo el código existente que hace `.from('churches')` sigue funcionando). Se amplía su significado: ahora representa "todo punto marcado en el mapa", no solo iglesias.

```sql
-- 1. Ampliar marker_type para los nuevos puntos informativos
alter table churches
  drop constraint if exists churches_marker_type_check,
  add constraint churches_marker_type_check
    check (marker_type in ('church', 'hospital', 'base', 'deposito', 'desalinizador'));

-- 2. Qué proyectos tiene activos cada centro (marcado manual)
create table center_projects (
  church_id  uuid references churches(id) on delete cascade,
  project    text not null check (project in ('water', 'food', 'nfi')),
  primary key (church_id, project)
);

-- 3. Catálogo de items por proyecto (editable/eliminable desde la app)
create table items (
  id         uuid primary key default gen_random_uuid(),
  project    text not null check (project in ('water', 'food', 'nfi')),
  name       text not null,
  unit       text not null check (unit in ('litros', 'kg', 'unidades', 'cajas', 'paquetes')),
  active     boolean not null default true,  -- soft-delete: no rompe entregas/solicitudes históricas
  created_at timestamptz not null default now()
);

-- 4. Líneas de una entrega (la tabla `distributions` existente pasa a ser la "cabecera": fecha, centro, familias, notas)
create table distribution_items (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid references distributions(id) on delete cascade,
  project         text not null check (project in ('water', 'food', 'nfi')),
  item_id         uuid references items(id),
  quantity        numeric not null,
  created_at      timestamptz not null default now()
);
-- Nota: el campo `items` (texto libre) que ya existe en `distributions` se conserva
-- como campo legado/nota adicional, pero deja de ser obligatorio para entregas nuevas.

-- 5. Solicitudes de campo → depósito
create table requests (
  id               uuid primary key default gen_random_uuid(),
  church_id        uuid references churches(id) not null,
  project          text not null check (project in ('water', 'food', 'nfi')),
  item_id          uuid references items(id) not null,
  quantity_needed  numeric,
  note             text,
  urgency          text not null default 'normal' check (urgency in ('normal', 'urgente')),
  status           text not null default 'pendiente' check (status in ('pendiente', 'preparada', 'entregada')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 6. Choferes
create table drivers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  available  boolean not null default true,
  updated_at timestamptz not null default now()
);
```

Tipos TypeScript nuevos/ajustados en `lib/supabase.ts`:

```ts
export type Project = 'water' | 'food' | 'nfi'
export type Unit = 'litros' | 'kg' | 'unidades' | 'cajas' | 'paquetes'
export type Urgency = 'normal' | 'urgente'
export type RequestStatus = 'pendiente' | 'preparada' | 'entregada'

export type Church = {
  // ...campos existentes sin cambios...
  marker_type: 'church' | 'hospital' | 'base' | 'deposito' | 'desalinizador'
}

export type CenterProject = { church_id: string; project: Project }
export type Item = { id: string; project: Project; name: string; unit: Unit; active: boolean; created_at: string }
export type DistributionItem = { id: string; distribution_id: string; project: Project; item_id: string; quantity: number; created_at: string }
export type ServiceRequest = {
  id: string; church_id: string; project: Project; item_id: string
  quantity_needed: number | null; note: string | null
  urgency: Urgency; status: RequestStatus
  created_at: string; updated_at: string
}
export type Driver = { id: string; name: string; phone: string; available: boolean; updated_at: string }
```

`PROJECT_LABELS` sugerido para UI: `{ water: 'Agua', food: 'Alimentos', nfi: 'NFI' }`.

## 7. Variables de entorno

```
NEXT_PUBLIC_SUPABASE_URL=            # sin cambios
NEXT_PUBLIC_SUPABASE_ANON_KEY=       # sin cambios
SUPABASE_SERVICE_ROLE_KEY=           # sin cambios

SUPERVISION_PASSCODE=                # nuevo — reemplaza a EDIT_PASSCODE
DEPOSITO_PASSCODE=                   # nuevo — superconjunto de permisos
```

`EDIT_PASSCODE` se retira (o se deja como alias temporal de `DEPOSITO_PASSCODE` durante la transición, a decidir en la implementación).

## 8. Rutas (páginas + endpoints)

**Páginas (App Router):**

| Ruta | Sección | Reemplaza a |
|---|---|---|
| `/` | Inicio — lista de puntos de distribución | Antiguo `/` (que era el mapa) |
| `/mapa` | Mapa (todo lo que hoy vive en `/`) | — |
| `/solicitudes` | Tablero de solicitudes | — (nuevo) |
| `/metricas` | Métricas con gráficas y export | `/dashboard` (se absorbe/reemplaza) |
| `/catalogo` | Catálogo de items por proyecto | — (nuevo) |
| `/choferes` | Lista de choferes | — (nuevo) |
| `/debug` | Diagnóstico offline | sin cambios |

**Endpoints API (siguiendo el patrón `isAuthorized` existente):**

| Endpoint | Métodos | Rol requerido |
|---|---|---|
| `/api/churches` | POST/PATCH/DELETE | Depósito/Admin (sin cambios) |
| `/api/distributions` | POST (ahora acepta `items: {project,item_id,quantity}[]`) | Depósito/Admin |
| `/api/requests` | POST (crear) | Supervisión |
| `/api/requests` | PATCH (cambiar estado) | Depósito/Admin |
| `/api/items` | POST/PATCH/DELETE (soft-delete vía `active`) | Depósito/Admin |
| `/api/drivers` | POST/PATCH/DELETE | Depósito/Admin |
| `/api/center-projects` | PATCH (marcar proyectos activos de un centro) | Depósito/Admin |
| `/api/upload` | sin cambios | Depósito/Admin |
| `/api/verify` | ahora recibe `{ passcode }` y responde `{ ok, role }` probando contra ambos passcodes | público |

No se crea un endpoint propio para rutas OSRM: el servidor público de OSRM acepta `fetch` directo desde el navegador (soporta CORS), así que se llama desde el cliente sin pasar por Next.js.

## 9. Secciones de la página

### Inicio (`/`)
- Lista/tarjetas de **centros de distribución** (no de todas las iglesias): nombre, parroquia, contacto, badges de color por proyecto activo, fecha de última entrega, conteo de solicitudes pendientes (destacando si hay alguna urgente).
- Buscador y filtro por parroquia/proyecto (evolución del filtro actual).
- Tocar una tarjeta abre el detalle del centro: entregas recientes, solicitudes asociadas, proyectos activos.
- En modo Depósito/Admin: botón para agregar iglesia/centro/hospital/punto especial (mismo formulario de siempre, ahora con checkboxes de proyecto activo si es centro de distribución).
- Las iglesias que no son centro de distribución no aparecen aquí — se gestionan desde el Mapa, como hoy.

### Mapa (`/mapa`)
- Todo lo que existe hoy: capas Mapa/Satélite/Satélite+Nombres, marcadores de iglesias/centros/hospital, rutas centro→iglesia asignada, export a PDF, `?tiledebug=1`.
- Nuevo: capas/pines de Base, Depósito y Desalinizador (icono propio + foto, mismo tratamiento visual que el Hospital hoy — ver §13).
- Nuevo: botón "Cómo llegar" en el popup de cualquier punto → pide permiso de ubicación → traza ruta OSRM (línea + distancia + tiempo estimado en auto) desde la posición actual del usuario.
- Nuevo: panel de choferes disponibles (nombre + teléfono), accesible desde un botón sobre el mapa.

### Solicitudes (`/solicitudes`)
- Lista con badges de estado (Pendiente/Preparada/Entregada) y urgencia (Urgente resaltado en rojo, ordenado primero).
- Filtros por centro, proyecto, estado.
- Supervisión: botón "Nueva solicitud" — selecciona centro, proyecto → item (filtrado por ese proyecto) → cantidad aproximada, urgencia, nota opcional.
- Depósito/Admin: botones para avanzar el estado (Pendiente → Preparada → Entregada).

### Métricas (`/metricas`)
- Selectores: centro (o todos), proyecto (o todos), rango de fechas.
- Tabla de totales entregados por item (con su unidad) + fecha de última entrega.
- Gráfica de tendencia (barras/líneas) por semana o mes.
- Botones "Descargar PDF" y "Descargar Excel/CSV".
- Reemplaza al `/dashboard` actual (mismo espíritu, ahora con el desglose por proyecto/item y gráficas).

### Catálogo de items (`/catalogo`)
- Solo Depósito/Admin.
- Items agrupados por proyecto (Water/Food/NFI), cada uno con su unidad.
- Crear, editar, eliminar (soft-delete: un item con entregas/solicitudes históricas no se borra físicamente, se desactiva).
- Semilla inicial (ver §11): cobijas, linternas, lonas azules, kits de limpieza (NFI) · harina, lentejas, aceite (Food) · filtros de agua, compra de cisternas (Water).

### Choferes (`/choferes`)
- Lista con nombre, teléfono, estado (disponible/ocupado como toggle visual).
- Depósito/Admin (coordinador de base) crea, edita, cambia disponibilidad.
- Supervisión y público: solo lectura (para saber a quién llamar).

## 10. Flujos clave

**Crear una solicitud (Supervisión, en campo):**
1. Entra a Solicitudes → "Nueva solicitud".
2. Elige el centro de distribución (o ya viene preseleccionado si entró desde el detalle del centro).
3. Elige proyecto → la lista de items se filtra a ese proyecto.
4. Elige item, cantidad aproximada, urgencia, nota opcional.
5. Si no hay red, la solicitud se encola en IndexedDB como cualquier otra mutación y se sincroniza al reconectar.

**Resolver una solicitud (Depósito):**
1. Ve la lista ordenada (urgentes primero, luego por antigüedad).
2. Marca "Preparada" cuando ya está lista en depósito.
3. Marca "Entregada" cuando ya llegó al punto.

**Registrar una entrega multi-línea (Depósito, o quien visite el centro):**
1. Desde el detalle del centro → "Registrar entrega".
2. Fecha + familias atendidas (una vez, para toda la visita).
3. Agrega líneas: proyecto → item → cantidad (tantas líneas como items se hayan entregado ese día).
4. Guarda: crea una fila en `distributions` + N filas en `distribution_items`.

**Ver ruta hacia un punto (cualquiera, en el Mapa):**
1. Toca un punto en el mapa → "Cómo llegar".
2. El navegador pide permiso de ubicación (si no lo dio antes).
3. Se llama a OSRM con origen = GPS actual, destino = el punto tocado.
4. Se dibuja la línea de ruta sugerida + se muestra distancia y tiempo estimado en auto.
5. Si no hay red, se muestra un aviso de que la función de rutas necesita conexión (a diferencia del resto de la app).

**Marcar proyectos activos de un centro (Depósito):**
1. Desde el detalle del centro (en Inicio o Mapa) → checkboxes Water/Food/NFI.
2. Se guarda en `center_projects` — puede tener 0, 1, 2 o 3 marcados.

## 11. Plan de migración y reconciliación de datos

Ya existen **6 iglesias marcadas como centro de distribución** en la base actual, y 5 de ellas coinciden por nombre/parroquia con tu lista de 10:

| Tu lista (2026) | Registro existente | Coincide |
|---|---|---|
| 1. Familia de Dios Unida (Catia La Mar) | Familia de Dios Unida | ✅ |
| 2. Ararat (La Guaira/Urimare) | Ministerio Internacional Ararat | ✅ |
| 4. Bethesda (Catia La Mar) | Iglesia Bautista Bethesda | ✅ |
| 6. Las Palmas (Caracas) | Ministerio Acompañamiento | ✅ |
| 7. Plaza Los Chorros (Caracas) | Iglesia Grupo Cristiano Apostólico | ✅ |
| — (no mencionado esta vez) | Iglesia Camino a la Nueva Jerusalén (Morón) | Marcado hoy como centro, no está en tu lista nueva |
| 3. El Shadai (Caribe) | Hay dos candidatos sin marcar: "El Shadai el Caribe" y "Iglesia El Shadai" (Caribe) | ⚠️ requiere decidir cuál es |
| 5. Primera Iglesia Bautista (Caraballeda) | No existe con ese nombre | Falta crear |
| 8. Morón — Centro Visión Cristiana | No existe con ese nombre (existe otra iglesia marcada como centro en Morón con nombre distinto) | ⚠️ requiere decidir si es la misma o una nueva |
| 9. Fuente de Vida / Centro Cristiano para la Familia (Caraballeda) | No existe con esos nombres | Falta crear |
| 10. Estadio de Baseball / Iglesia Zuriel | No existe | Falta crear |

Ya se acordó: **se suma a lo existente**, nada se desmarca automáticamente. Esta tabla se resuelve caso por caso durante la implementación (probablemente con tu confirmación centro por centro), no requiere una decisión más en este blueprint.

**Semilla del catálogo de items** (a insertar en `items` al implementar):
- NFI: Cobijas, Linternas, Lonas azules, Kits de limpieza
- Food: Harina, Lentejas, Aceite
- Water: Filtros de agua, Compra de cisternas

(Unidad de cada uno se define al implementar, usando la lista fija: Litros / Kg / Unidades / Cajas / Paquetes.)

**Puntos especiales a crear** (`marker_type`): Base (Hotel Eurobuilding La Guaira), Depósito, Desalinizador de agua. Coordenadas/dirección/foto pendientes — quedaste en enviarlas.

## 12. Textos (copy en español)

Un muestreo representativo — el resto sigue el mismo tono directo y en español que ya usa la app:

- Nav: **Inicio · Mapa · Solicitudes · Métricas · Catálogo · Choferes**
- Inicio: `"{n} centros de distribución"`, `"Proyectos activos"`, `"Última entrega: hace {x} días"`, `"{n} solicitudes pendientes"`
- Proyectos: **Agua** · **Alimentos** · **NFI**
- Solicitudes — estados: **Pendiente** · **Preparada** · **Entregada**
- Solicitudes — urgencia: **Normal** · **Urgente**
- Botones: `"Nueva solicitud"`, `"Marcar como preparada"`, `"Marcar como entregada"`, `"Registrar entrega"`, `"Agregar línea"`, `"Cómo llegar"`, `"Descargar PDF"`, `"Descargar Excel"`
- Mapa — aviso sin red: `"Las rutas necesitan conexión a internet"`
- Catálogo: `"Agregar item"`, `"Desactivar item"` (en vez de "eliminar", ya que es soft-delete)
- Choferes: `"Disponible"` · `"Ocupado"`

## 13. Dirección de diseño

Se reutilizan los tokens ya definidos en `app/globals.css` (`--navy`, `--olive`, `font-sans-pro`, `font-data`) — no se introduce una paleta nueva de marca.

**Colores por proyecto** (reutilizando la paleta que ya existe para las rutas del mapa, `ROUTE_COLORS`, para mantener consistencia visual):
- Agua (Water): `#0891b2` (cian)
- Alimentos (Food): `#ea580c` (naranja)
- NFI: `#7c3aed` (violeta)

**Nuevos pines del mapa** (mismo tratamiento circular con foto que ya usa `makeHospitalIcon` en `components/ChurchMap.tsx`, solo cambia el color del anillo y el icono de respaldo):
- Base: anillo navy (`--navy`), icono de respaldo tipo bandera/brújula.
- Depósito: anillo slate/gris, icono de respaldo tipo caja/almacén.
- Desalinizador: anillo cian (mismo tono que el proyecto Agua), icono de respaldo tipo gota de agua.

**Badges de proyecto activo** (en las tarjetas de Inicio y en Métricas): píldora de color sólido por proyecto (los 3 colores de arriba), mismo estilo de badge redondeado que ya usan `is_distribution_center`/`geocode_status` en `app/page.tsx`.

**Gráficas de Métricas:** una serie por proyecto usando los mismos 3 colores, para que un usuario que ya vio el mapa reconozca "cian = Agua" sin tener que releer la leyenda cada vez.

## 14. Integraciones externas

- **OSRM** (`https://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson`) — sin API key, llamada directa desde el cliente. Devuelve distancia (metros), duración (segundos) y la geometría de la ruta para dibujarla como `Polyline`. Es un servicio público de demostración: válido para el volumen de uso de este equipo, pero sin garantía de SLA — si en el futuro falla mucho, la alternativa es un OSRM propio o Mapbox.
- **Geolocation API del navegador** (`navigator.geolocation.getCurrentPosition`) — requiere permiso explícito del usuario, HTTPS (ya lo tiene por estar en Vercel).
- **html2canvas-pro + jsPDF** — ya en `package.json`, se reutiliza tal cual para el PDF de Métricas.
- **Export CSV** — sin librería nueva: se arma un string CSV a mano a partir de los datos ya cargados y se descarga como blob.

## 15. Comportamiento offline

Se extiende el patrón de 3 capas que ya existe (`lib/offlineDb.ts`, `lib/offlineStore.ts`, `lib/api.ts`, `lib/offlineSync.ts`, `public/sw.js`) a las tablas nuevas:

**Funciona offline (lectura + cola de escritura, igual que hoy con iglesias):**
- Catálogo de items (lectura; alta/edición se encola).
- Entregas multi-línea (se encola como una mutación compuesta: cabecera + líneas).
- Solicitudes (crear y cambiar estado se encolan).
- Choferes (lectura; cambios de disponibilidad se encolan).
- Métricas: se calculan sobre los datos ya espejados en IndexedDB, así que los totales/tabla funcionan sin red (las gráficas también, sobre esos mismos datos).

**NO funciona offline (requiere red sí o sí):**
- Calcular una ruta nueva con OSRM (no hay forma de enrutar por calles sin el servicio externo). Se muestra un aviso claro en vez de fallar en silencio.
- Obtener la ubicación GPS en sí normalmente sí funciona sin red (es hardware del teléfono), pero de nada sirve sin poder llamar a OSRM después.

## 16. Roadmap de implementación sugerido

Orden sugerido para construirlo sin romper lo que ya funciona en campo — **no es una decisión final, es un punto de partida para cuando pasemos a programar**:

1. **Modelo de datos + roles** — nuevas tablas, nuevos passcodes, `isAuthorized` con rol.
2. **Catálogo de items + proyectos activos por centro** — funcionalidad autocontenida, no rompe nada existente.
3. **Registro de entregas multi-línea** — evoluciona `DistributionForm` y `/api/distributions`.
4. **Solicitudes** — nueva sección completa, no depende de las demás.
5. **Choferes + rutas GPS/OSRM en el mapa** — nueva sección + integración externa.
6. **Reestructura de navegación** — mover el mapa de `/` a `/mapa`, construir el nuevo Inicio como lista de centros. Se deja para después de que las piezas de datos (2-5) ya existan, para no reconstruir la navegación dos veces.
7. **Métricas con gráficas + export** — depende de que ya haya datos reales en `distribution_items`.
8. **Migración/reconciliación de los 10 centros + puntos especiales** — en paralelo a cualquiera de las fases anteriores, en cuanto tengas las coordenadas de Base/Depósito/Desalinizador.

---

*Fin del blueprint. Cuando lo revises, dime qué ajustar — no se escribe código hasta que confirmes esto.*
