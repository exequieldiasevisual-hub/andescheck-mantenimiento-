-- =====================================================================
-- AndesCheck Mantenimiento — Esquema Postgres / Supabase
-- MULTI-TENANT COMPARTIDO: un solo proyecto Supabase, N empresas.
-- Cada tabla de negocio lleva empresa_id; RLS filtra automáticamente por
-- la empresa del usuario logueado (empresa_actual()) además de por rol
-- (rol_actual()). Reglas finas de transición → RPC security definer
-- (ver rpc_ot.sql), igual que el patrón usado en LB Hidráulica.
--
-- LOGIN EN 2 PASOS (usuario simple, no email, como en el sistema GAS actual):
--   1) Pantalla de alias: el usuario ingresa el código de su empresa.
--      El frontend valida contra la vista pública `empresas_login`.
--   2) Pantalla de usuario/contraseña: el frontend arma un email sintético
--      `usuario@<alias>.andescheck.internal` y llama a
--      supabase.auth.signInWithPassword({email, password}).
--   Supabase Auth exige email único global; el alias es lo que permite que
--   "jperez" exista en dos empresas distintas sin colisionar.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- ENUMS
-- ---------------------------------------------------------------------
create type rol_usuario as enum ('administrador','supervisor','tecnico','auditor');
create type estado_ot as enum ('Abierta','En_Curso','Cerrada','Cerrada_Vencida','Anulada');
create type estado_tarea as enum ('Pendiente','En_Curso','Completada');
create type estado_novedad as enum ('Pendiente','Derivada_a_OT','Cerrada');
create type tipo_trigger_preventivo as enum ('km','hs','dias');
create type tipo_movimiento_stock as enum ('ingreso','egreso');

-- ---------------------------------------------------------------------
-- EMPRESAS (tenants)
-- ---------------------------------------------------------------------
create table empresas (
  id uuid primary key default gen_random_uuid(),
  alias text not null unique,        -- slug usado en la pantalla 1 de login (ej. "lb", "andes")
  razon_social text not null,
  logo_url text,
  activo boolean not null default true,
  fecha_alta timestamptz not null default now()
);

-- Vista pública mínima para resolver el alias ANTES de loguearse
-- (no expone nada sensible; se usa con la anon key, sin sesión).
create view empresas_login as
  select id, alias, razon_social, logo_url
  from empresas
  where activo = true;

grant select on empresas_login to anon, authenticated;

-- ---------------------------------------------------------------------
-- USUARIOS (referencia auth.users; email sintético usuario@alias.andescheck.internal)
-- ---------------------------------------------------------------------
create table usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  empresa_id uuid not null references empresas(id),
  nombre text not null,
  usuario text not null,             -- único DENTRO de la empresa, no global
  rol rol_usuario not null,
  activo boolean not null default true,
  fecha_alta timestamptz not null default now(),
  unique (empresa_id, usuario)
);
create index idx_usuarios_empresa on usuarios(empresa_id);

-- Perfil extendido de técnicos (Tecnicos_Perfil): 1 a 1 con usuarios rol=tecnico
create table tecnicos_perfil (
  id_usuario uuid primary key references usuarios(id) on delete cascade,
  telefono text,
  tel_emergencia text,
  direccion text,
  especialidad text
);

-- ---------------------------------------------------------------------
-- Helpers de sesión — se leen 1 sola vez por transacción
-- ---------------------------------------------------------------------
create or replace function rol_actual() returns rol_usuario as $$
  select rol from usuarios where auth_user_id = auth.uid();
$$ language sql stable security definer;

create or replace function empresa_actual() returns uuid as $$
  select empresa_id from usuarios where auth_user_id = auth.uid();
$$ language sql stable security definer;

-- ---------------------------------------------------------------------
-- MAESTROS (todas llevan empresa_id — datos de una empresa nunca se mezclan
-- ni se ven entre sí, aislados por RLS)
-- ---------------------------------------------------------------------

create table unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  descripcion text not null,
  tipo text,                      -- configurable vía Configuracion.tipos_unidad
  patente_serie text,
  marca text,
  modelo text,
  anio int,
  centro_costo text,
  ciudad text,
  tipo_mision text,
  km_actuales numeric(12,2),
  hs_actuales numeric(12,2),
  activo boolean not null default true,
  fecha_alta timestamptz not null default now()
);
create index idx_unidades_empresa on unidades(empresa_id);
create index idx_unidades_activo on unidades(empresa_id, activo);
create index idx_unidades_patente on unidades using gin (patente_serie gin_trgm_ops);

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  razon_social text not null,
  cuit text,
  mail text,
  telefono text,
  direccion text,
  ubicacion text,
  observaciones text,
  activo boolean not null default true
);
create index idx_proveedores_empresa on proveedores(empresa_id);

create table catalogo_trabajos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  categoria text not null,        -- Motor, Frenos, Suspensión, Transmisión, Eléctrico, Hidráulico, Neumáticos, General
  descripcion text not null,
  tiempo_estimado_hs numeric(8,2),
  activo boolean not null default true
);
create index idx_catalogo_trabajos_empresa on catalogo_trabajos(empresa_id);

create table secuencias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  nombre text not null,
  descripcion text,
  tipo_unidad text,
  activo boolean not null default true,
  fecha_alta timestamptz not null default now()
);
create index idx_secuencias_empresa on secuencias(empresa_id);

create table secuencias_tareas (
  id uuid primary key default gen_random_uuid(),
  id_secuencia uuid not null references secuencias(id) on delete cascade,
  orden int not null,
  descripcion text not null,
  tiempo_estimado_hs numeric(8,2)
);
create index idx_secuencias_tareas_secuencia on secuencias_tareas(id_secuencia);

-- Configuración multi-sección (params, centros_costo, tipos_unidad, ciudades,
-- tipos_novedad, unidades_medida, especialidades_tecnico, tipos_documento)
create table configuracion (
  empresa_id uuid not null references empresas(id),
  seccion text not null,
  clave text not null,
  valor text,
  primary key (empresa_id, seccion, clave)
);

-- ---------------------------------------------------------------------
-- STOCK
-- ---------------------------------------------------------------------

create table stock (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  codigo text not null,
  descripcion text not null,
  stock_actual numeric(12,2) not null default 0,
  stock_minimo numeric(12,2) not null default 0,
  unidad_medida text not null,
  activo boolean not null default true,
  unique (empresa_id, codigo)
);
create index idx_stock_empresa on stock(empresa_id);

-- ---------------------------------------------------------------------
-- ÓRDENES DE TRABAJO
-- ---------------------------------------------------------------------

-- Contador de numero_ot por año Y por empresa (cada empresa arranca su propia
-- numeración OT-2026-0001). UPDATE atómico, sin LockService.
create table ot_numero_contador (
  empresa_id uuid not null references empresas(id),
  anio int not null,
  contador int not null default 0,
  primary key (empresa_id, anio)
);

create or replace function generar_numero_ot(p_empresa_id uuid) returns text as $$
declare
  v_anio int := extract(year from now());
  v_contador int;
begin
  insert into ot_numero_contador (empresa_id, anio, contador) values (p_empresa_id, v_anio, 1)
    on conflict (empresa_id, anio) do update set contador = ot_numero_contador.contador + 1
    returning contador into v_contador;
  return 'OT-' || v_anio || '-' || lpad(v_contador::text, 4, '0');
end;
$$ language plpgsql;

create table novedades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_unidad uuid not null references unidades(id) on delete restrict,
  fecha timestamptz not null default now(),
  descripcion text not null,
  tipo text,                      -- configurable vía Configuracion.tipos_novedad
  estado estado_novedad not null default 'Pendiente',
  id_ot_vinculada uuid,           -- FK a ot_cabecera definida más abajo (orden de creación)
  usuario_carga uuid references usuarios(id),
  sync_pendiente boolean not null default false
);
create index idx_novedades_empresa on novedades(empresa_id);
create index idx_novedades_unidad on novedades(id_unidad);
create index idx_novedades_estado on novedades(empresa_id, estado);

create table ot_cabecera (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  numero_ot text not null,
  id_unidad uuid not null references unidades(id) on delete restrict,
  tipo text not null,              -- Correctivo / Preventivo / Predictivo
  estado estado_ot not null default 'Abierta',
  prioridad text,
  fecha_apertura timestamptz not null default now(),
  fecha_cierre timestamptz,
  supervisor uuid references usuarios(id),
  descripcion text,
  id_secuencia uuid references secuencias(id),
  id_novedad_origen uuid references novedades(id),
  observaciones text,
  fecha_est_cierre timestamptz,
  proveedor uuid references proveedores(id),
  motivo_anulacion text,
  tecnicos_asignados uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (empresa_id, numero_ot)
);
create index idx_ot_cabecera_empresa on ot_cabecera(empresa_id);
create index idx_ot_cabecera_unidad on ot_cabecera(id_unidad);
create index idx_ot_cabecera_estado on ot_cabecera(empresa_id, estado);

alter table novedades
  add constraint fk_novedades_ot foreign key (id_ot_vinculada) references ot_cabecera(id);

create table ot_tareas (
  id uuid primary key default gen_random_uuid(),
  id_ot uuid not null references ot_cabecera(id) on delete cascade,
  orden int not null,
  descripcion text not null,
  tecnico_asignado uuid references usuarios(id),
  estado estado_tarea not null default 'Pendiente',
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  observaciones text
);
create index idx_ot_tareas_ot on ot_tareas(id_ot);
create index idx_ot_tareas_tecnico on ot_tareas(tecnico_asignado);

create table ot_seguimiento (
  id uuid primary key default gen_random_uuid(),
  id_ot uuid not null references ot_cabecera(id) on delete cascade,
  fecha timestamptz not null default now(),
  usuario uuid references usuarios(id),
  descripcion text not null,
  foto_url text                   -- Supabase Storage, ya no Drive
);
create index idx_ot_seguimiento_ot on ot_seguimiento(id_ot);

create table costos (
  id uuid primary key default gen_random_uuid(),
  id_ot uuid not null references ot_cabecera(id) on delete cascade,
  tipo text,
  descripcion text,
  monto numeric(12,2) not null,
  fecha timestamptz not null default now(),
  usuario uuid references usuarios(id)
);
create index idx_costos_ot on costos(id_ot);

create table stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  id_repuesto uuid not null references stock(id),
  tipo tipo_movimiento_stock not null,
  cantidad numeric(12,2) not null,
  id_ot uuid references ot_cabecera(id),
  fecha timestamptz not null default now(),
  usuario uuid references usuarios(id),
  observacion text
);
create index idx_stock_mov_repuesto on stock_movimientos(id_repuesto);

-- ---------------------------------------------------------------------
-- PREVENTIVOS
-- ---------------------------------------------------------------------

create table preventivos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  id_unidad uuid not null references unidades(id) on delete cascade,
  descripcion text not null,
  tipo_trigger tipo_trigger_preventivo not null,
  valor_trigger numeric(12,2) not null,
  km_hs_ultimo numeric(12,2),
  fecha_ultimo date,
  km_hs_proximo numeric(12,2),
  fecha_proxima date,
  estado text not null default 'Activo',
  activo boolean not null default true
);
create index idx_preventivos_empresa on preventivos(empresa_id);
create index idx_preventivos_unidad on preventivos(id_unidad);

-- Estado real-time (Vencido / Vigente) — se calcula al leer, igual que en gs.js,
-- nunca se guarda un valor derivado que pueda desincronizarse.
create view preventivos_calculado as
  select *,
    case when fecha_proxima < current_date then 'Vencido' else 'Vigente' end as estado_calculado
  from preventivos;

-- ---------------------------------------------------------------------
-- ALERTAS (generadas por pg_cron, reemplaza triggerDiario() de GAS)
-- ---------------------------------------------------------------------

create table alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id),
  tipo text not null,
  id_referencia uuid,
  descripcion text,
  fecha_generacion timestamptz not null default now(),
  estado text not null default 'Pendiente',
  destinatario_mail text,
  link_wsp text
);
create index idx_alertas_empresa on alertas(empresa_id);

-- ---------------------------------------------------------------------
-- DOCUMENTACIÓN DE UNIDADES
-- ---------------------------------------------------------------------

create table unidad_docs (
  id uuid primary key default gen_random_uuid(),
  id_unidad uuid not null references unidades(id) on delete cascade,
  tipo text not null,
  numero text,
  fecha_vigencia_desde date,
  fecha_vigencia_hasta date,
  archivo_url text,                -- Supabase Storage, ya no Drive
  observaciones text,
  fecha_alta timestamptz not null default now(),
  usuario uuid references usuarios(id)
);
create index idx_unidad_docs_unidad on unidad_docs(id_unidad);

-- Estado calculado (Vigente / Por vencer ≤30d / Vencido / Sin fecha) al leer
create view unidad_docs_calculado as
  select *,
    case
      when fecha_vigencia_hasta is null then 'Sin fecha'
      when fecha_vigencia_hasta < current_date then 'Vencido'
      when fecha_vigencia_hasta <= current_date + interval '30 days' then 'Por vencer'
      else 'Vigente'
    end as estado_calculado
  from unidad_docs;

-- =====================================================================
-- RLS — dos capas obligatorias en TODA policy de tablas de negocio:
--   1) empresa_id = empresa_actual()  → aislamiento de tenant (nunca se omite)
--   2) rol_actual() in (...)          → permisos por rol dentro de esa empresa
-- Reglas finas de transición (cerrar OT, anular OT, derivar novedad, etc.)
-- viven en funciones RPC security definer — ver rpc_ot.sql.
-- =====================================================================

alter table empresas enable row level security;
alter table usuarios enable row level security;
alter table tecnicos_perfil enable row level security;
alter table unidades enable row level security;
alter table proveedores enable row level security;
alter table catalogo_trabajos enable row level security;
alter table secuencias enable row level security;
alter table secuencias_tareas enable row level security;
alter table configuracion enable row level security;
alter table stock enable row level security;
alter table stock_movimientos enable row level security;
alter table novedades enable row level security;
alter table ot_cabecera enable row level security;
alter table ot_tareas enable row level security;
alter table ot_seguimiento enable row level security;
alter table costos enable row level security;
alter table preventivos enable row level security;
alter table alertas enable row level security;
alter table unidad_docs enable row level security;
alter table ot_numero_contador enable row level security;

-- Empresas: sin acceso directo autenticado a la tabla completa (se usa la
-- vista pública empresas_login para el paso 1 del login). El propio usuario
-- solo necesita ver el nombre/logo de SU empresa ya logueado.
create policy "lectura_empresa_propia" on empresas for select using (id = empresa_actual());

-- Usuarios: se ven entre sí solo dentro de la misma empresa.
create policy "lectura_usuarios" on usuarios for select using (empresa_id = empresa_actual());
create policy "escritura_usuarios" on usuarios for all using (empresa_id = empresa_actual() and rol_actual() = 'administrador');

create policy "lectura_tecnicos_perfil" on tecnicos_perfil for select using (
  exists (select 1 from usuarios u where u.id = tecnicos_perfil.id_usuario and u.empresa_id = empresa_actual())
);
create policy "escritura_tecnicos_perfil" on tecnicos_perfil for all using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from usuarios u where u.id = tecnicos_perfil.id_usuario and u.empresa_id = empresa_actual())
);

-- Maestros: lectura = cualquier rol logueado de la misma empresa (auditor incluido).
create policy "lectura_unidades" on unidades for select using (empresa_id = empresa_actual());
create policy "lectura_proveedores" on proveedores for select using (empresa_id = empresa_actual());
create policy "lectura_catalogo" on catalogo_trabajos for select using (empresa_id = empresa_actual());
create policy "lectura_secuencias" on secuencias for select using (empresa_id = empresa_actual());
create policy "lectura_secuencias_tareas" on secuencias_tareas for select using (
  exists (select 1 from secuencias s where s.id = secuencias_tareas.id_secuencia and s.empresa_id = empresa_actual())
);
create policy "lectura_configuracion" on configuracion for select using (empresa_id = empresa_actual());
create policy "lectura_stock" on stock for select using (empresa_id = empresa_actual());
create policy "lectura_stock_mov" on stock_movimientos for select using (
  exists (select 1 from stock s where s.id = stock_movimientos.id_repuesto and s.empresa_id = empresa_actual())
);
create policy "lectura_novedades" on novedades for select using (empresa_id = empresa_actual());
create policy "lectura_ot_cabecera" on ot_cabecera for select using (empresa_id = empresa_actual());
create policy "lectura_ot_tareas" on ot_tareas for select using (
  exists (select 1 from ot_cabecera o where o.id = ot_tareas.id_ot and o.empresa_id = empresa_actual())
);
create policy "lectura_ot_seguimiento" on ot_seguimiento for select using (
  exists (select 1 from ot_cabecera o where o.id = ot_seguimiento.id_ot and o.empresa_id = empresa_actual())
);
create policy "lectura_costos" on costos for select using (
  exists (select 1 from ot_cabecera o where o.id = costos.id_ot and o.empresa_id = empresa_actual())
);
create policy "lectura_preventivos" on preventivos for select using (empresa_id = empresa_actual());
create policy "lectura_alertas" on alertas for select using (empresa_id = empresa_actual());
create policy "lectura_unidad_docs" on unidad_docs for select using (
  exists (select 1 from unidades u where u.id = unidad_docs.id_unidad and u.empresa_id = empresa_actual())
);

-- Unidades: alta/edición = admin, supervisor (guardarUnidad). Baja = solo admin.
create policy "escritura_unidades" on unidades for insert with check (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "edicion_unidades" on unidades for update using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "baja_unidades" on unidades for delete using (empresa_id = empresa_actual() and rol_actual() = 'administrador');

-- Proveedores, catálogo, secuencias: admin + supervisor gestionan (maestros operativos)
create policy "escritura_proveedores" on proveedores for all using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "escritura_catalogo" on catalogo_trabajos for all using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "escritura_secuencias" on secuencias for all using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "escritura_secuencias_tareas" on secuencias_tareas for all using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from secuencias s where s.id = secuencias_tareas.id_secuencia and s.empresa_id = empresa_actual())
);

-- Configuración: solo admin de esa empresa.
create policy "escritura_configuracion" on configuracion for all using (empresa_id = empresa_actual() and rol_actual() = 'administrador');

-- Stock: alta/edición = admin, supervisor. Movimientos: admin, supervisor, tecnico (consumo en taller).
create policy "escritura_stock" on stock for insert with check (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "edicion_stock" on stock for update using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "baja_stock" on stock for delete using (empresa_id = empresa_actual() and rol_actual() = 'administrador');
create policy "escritura_stock_mov" on stock_movimientos for insert with check (
  rol_actual() in ('administrador','supervisor','tecnico')
  and exists (select 1 from stock s where s.id = stock_movimientos.id_repuesto and s.empresa_id = empresa_actual())
);

-- Novedades: cualquier rol logueado (menos auditor) puede cargar (técnico incluido).
create policy "escritura_novedades" on novedades for insert with check (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor','tecnico'));
create policy "edicion_novedades" on novedades for update using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));

-- OT_Cabecera: crear/editar = admin, supervisor. Transiciones finas (cerrar/anular/derivar)
-- viven en RPC — esta policy de UPDATE es deliberadamente amplia porque el frontend
-- llama a las funciones RPC, no hace UPDATE directo sobre estos campos.
create policy "creacion_ot" on ot_cabecera for insert with check (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));
create policy "edicion_ot" on ot_cabecera for update using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));

-- OT_Tareas: supervisor asigna/crea; técnico solo actualiza el estado de SU tarea asignada.
create policy "escritura_ot_tareas" on ot_tareas for insert with check (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from ot_cabecera o where o.id = ot_tareas.id_ot and o.empresa_id = empresa_actual())
);
create policy "edicion_ot_tareas_supervisor" on ot_tareas for update using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from ot_cabecera o where o.id = ot_tareas.id_ot and o.empresa_id = empresa_actual())
);
create policy "edicion_ot_tareas_tecnico" on ot_tareas for update using (
  rol_actual() = 'tecnico'
  and tecnico_asignado = (select id from usuarios where auth_user_id = auth.uid())
);

-- OT_Seguimiento: cualquier rol logueado (menos auditor) puede agregar seguimiento.
create policy "escritura_ot_seguimiento" on ot_seguimiento for insert with check (
  rol_actual() in ('administrador','supervisor','tecnico')
  and exists (select 1 from ot_cabecera o where o.id = ot_seguimiento.id_ot and o.empresa_id = empresa_actual())
);

-- Costos: admin, supervisor cargan costos de OT.
create policy "escritura_costos" on costos for insert with check (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from ot_cabecera o where o.id = costos.id_ot and o.empresa_id = empresa_actual())
);
create policy "edicion_costos" on costos for update using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from ot_cabecera o where o.id = costos.id_ot and o.empresa_id = empresa_actual())
);

-- Preventivos: admin, supervisor gestionan.
create policy "escritura_preventivos" on preventivos for all using (empresa_id = empresa_actual() and rol_actual() in ('administrador','supervisor'));

-- Alertas: generadas por el sistema (pg_cron / Edge Function con service_role, bypassea RLS).
-- Sin policy de escritura para roles de la app.

-- Unidad_Docs: admin, supervisor cargan/eliminan documentación.
create policy "escritura_unidad_docs" on unidad_docs for all using (
  rol_actual() in ('administrador','supervisor')
  and exists (select 1 from unidades u where u.id = unidad_docs.id_unidad and u.empresa_id = empresa_actual())
);
