# Inventario completo de funciones — Sistema original (gs.js + index.html) vs. Migración Supabase

Estado: ✅ implementado · ⚠️ parcial o distinto · ❌ falta

---

## BACKEND (gs.js) — 100+ funciones

### Auth
| Función original | Estado | Nota |
|---|---|---|
| `login(usuario, password)` | ✅ | Reemplazado por Supabase Auth + alias empresa |
| `logout(token)` | ✅ | `supabase.auth.signOut()` |
| `getSession` / `checkPermiso` | ✅ | RLS + `rol_actual()` / `empresa_actual()` |
| `hashPassword` (SHA-256 + SALT) | ✅ | bcrypt vía `crypt()` en `crear_usuario_admin` |

### Unidades
| Función | Estado | Nota |
|---|---|---|
| `getUnidades(filtros)` | ✅ | Página Unidades. Filtros tipo/centro/ciudad/misión: ⚠️ solo búsqueda de texto, faltan filtros por columna |
| `guardarUnidad` | ✅ | |
| `actualizarKmHs` standalone | ❌ | **FALTA**: botón "Actualizar Km/Hs" desde la fila de unidad (`abrirModalKmHs`) |
| `eliminarUnidad` (baja lógica) | ✅ | |
| `buscarUnidadPorPatente` | ❌ | **FALTA** (usado en OT Rápida) |
| `procesarFotoPatente` (OCR) | ❌ | **FALTA** — requiere Edge Function + Google Vision |

### Órdenes de Trabajo
| Función | Estado | Nota |
|---|---|---|
| `getOTs` + `_filtrarOTsTecnico` | ✅ | Técnico ve solo las suyas |
| `_enriquecerOTs` (estado Vencida + progreso + listo_cierre) | ⚠️ | **FALTA**: estado "Vencida" en tiempo real para OT abiertas, barra de progreso tareas, flag "listo_cierre" / "Cierre técnico" |
| `crearOT` | ✅ | Con km/hs, secuencia, técnicos. ⚠️ falta selector de **proveedor** y campo **observaciones** |
| `actualizarOT` | ⚠️ | Cerrar sí (RPC). Falta editar tipo/prioridad/descripción/proveedor de una OT existente |
| `anularOT` (con motivo, reabre novedad) | ✅ | |
| Vista de OT en **tarjetas** con progreso | ❌ | Hoy es tabla. Original: cards con barra %, badges, "Ver detalle" + "Imprimir" |

### Tareas de OT
| Función | Estado | Nota |
|---|---|---|
| `getTareasOT` | ✅ | |
| `guardarTareaOT` (auto fecha inicio/fin) | ✅ | En OtDetalle |
| `agregarTareaOT` (agregar tarea manual a OT) | ❌ | **FALTA**: botón "+ Tarea" en el detalle |
| `eliminarTareaOT` (con motivo → registra en seguimiento) | ❌ | **FALTA**: botón 🗑 con motivo |
| `editarTarea` (asignar técnico por tarea, observaciones) | ⚠️ | Solo cambio de estado. Falta editar técnico/observaciones por tarea |
| `_generarTareasDesdeSecuencia` | ✅ | |

### Novedades
| Función | Estado | Nota |
|---|---|---|
| `getNovedades` / `guardarNovedad` | ✅ | ⚠️ tipo de novedad es texto libre, falta usar config `tipos_novedad` |
| `derivarNovedadAOT` | ✅ | |
| `convertirTareaANovedad` | ⚠️ | RPC existe, **falta botón "→ Nov"** en el detalle de OT |

### Preventivos
| Función | Estado | Nota |
|---|---|---|
| `getPreventivos` (estado calculado) | ✅ | |
| `guardarPreventivo` (trigger km/hs/dias) | ✅ | |

### Stock
| Función | Estado | Nota |
|---|---|---|
| `getStock` (críticos) | ✅ | + stock comprometido/disponible (feature nueva) |
| `guardarRepuesto` | ✅ | |
| `movimientoStock` (ingreso/egreso) | ⚠️ | RPC existe, **falta UI**: botón movimiento ingreso/egreso en la fila de stock (`abrirMovRepuesto`) |

### Costos
| Función | Estado | Nota |
|---|---|---|
| `getCostosOT` (total) | ⚠️ | Se lee en `get_ot_para_imprimir`, **falta mostrarlo en el detalle** |
| `guardarCosto` (`agregarCostoOT`) | ❌ | **FALTA**: botón "+ Costo" en el detalle de OT + tabla de costos + total |

### Secuencias
| `getSecuencias` / `guardarSecuencia` | ✅ | + checklist + repuestos (features nuevas) |

### Alertas
| `generarAlertasPreventivos` + `triggerDiario` | ✅ | pg_cron |

### Config
| `getConfiguracion` / `guardarConfiguracion` | ✅ | Pestañas General/Técnicos/Catálogo replicadas |

### Endpoints compuestos
| `getBootstrap` | ✅ | RPC |
| `getDashboard` (7 contadores) | ✅ | RPC |

### Exportación
| `exportarDatos` (Excel) | ❌ | **FALTA**: botón "Excel" en cada módulo (Unidades, OT, etc.) |

### Impresión / Mail
| `getOTParaImprimir` | ✅ | RPC |
| `imprimirOT` (ventana de impresión con firma) | ❌ | **FALTA**: botón "Imprimir" que abre layout imprimible |
| `enviarOTPorMail` (`enviarOTMail`) | ⚠️ | Edge Function existe, **falta botón "Enviar" en el detalle** |

### Usuarios
| `getUsuarios` / `guardarUsuario` / `cambiarPassword` | ✅ | + campos apellido/email/dni/puesto. ⚠️ falta **cambiar contraseña** de un usuario existente (`abrirModalCambiarPass`) |

### Documentación de unidades
| `getDocumentosUnidad` / `guardarDocumento` / `eliminarDocumento` | ✅ | Como módulo aparte. ⚠️ original lo abre **por unidad** (`verDocumentosUnidad`), estados: Vigente/Por vencer/Vencido/Sin fecha/**Sin vigencia aún** |
| `getResumenDocumentos` | ✅ | Dashboard |

### Proveedores
| `getProveedores` / `guardarProveedor` / `eliminarProveedor` | ✅ | |

### Seguimiento
| `getSeguimiento` / `guardarSeguimiento` | ✅ | + foto + PDF + quién lo subió |

### Técnicos (perfil)
| `getTecnicosPerfil` (teléfono, emergencia, dirección, especialidad) | ❌ | **FALTA**: gestión de perfil de técnico |
| `getTecnicosConCarga` (tareas pendientes por técnico) | ❌ | **FALTA**: mostrar carga de trabajo al asignar técnicos |
| `crearTecnico` / `toggleActivoTecnico` / `guardarTecnicosPerfil` | ⚠️ | Se crean como usuarios rol=técnico, falta el perfil extendido |

### Catálogo de trabajos
| `getCatalogoTrabajos` (47 trabajos pre-cargados en 8 categorías) | ❌ | **FALTA por completo**: tabla `catalogo_trabajos` vacía, sin seed, sin UI, sin uso en OT |
| `guardarTrabajo` / `eliminarTrabajo` | ❌ | **FALTA**: pestaña Catálogo en Configuración |

---

## FRONTEND (index.html) — features de UI faltantes

### OT Rápida (modal 3 pasos) — ❌ FALTA POR COMPLETO
- Paso 1: cámara → OCR de patente → identifica unidad (o patente manual)
- Paso 2: **grabación de audio** (Web Speech API `es-AR`) que transcribe la descripción del trabajo
- Paso 3: resumen editable + proveedor + fecha estimada + secuencia → crea OT
- Funciones: `abrirOTRapida`, `capturarFoto`, `onFotoSeleccionada`, `mostrarResultadoOCR`, `buscarPatenteManual`, `iniciarAudio`, `detenerAudio`, `limpiarAudio`, `renderResumenOTR`, `otrNavegar`, `confirmarOTRapida`

### Modo Offline — ❌ FALTA POR COMPLETO
- `OfflineDB` (localStorage): cache de OTs/unidades, cola de operaciones
- Banner de offline (detecta `navigator.onLine` + ping)
- `sincronizarCola`, `sincronizarNovedadesOffline`, guardado optimista
- Crear novedades/seguimiento sin conexión y sincronizar al reconectar

### Otras UI faltantes
| Feature | Estado |
|---|---|
| Botón **Excel** por módulo | ❌ |
| Botón **Imprimir OT** (ventana con firma) | ❌ |
| Botón **Enviar OT por mail** en detalle | ❌ |
| **Compresión de foto** antes de subir (`_comprimirFoto`, max 1024px 75%) | ❌ (hoy sube cruda) |
| **Barra de progreso** de tareas en card y detalle | ❌ |
| Badge **Vencida** / **Cierre técnico** | ❌ |
| **Costos** en detalle (tabla + total + "+ Costo") | ❌ |
| **+ Tarea** / **🗑 eliminar tarea con motivo** / **→ Nov** en detalle | ❌ |
| Selector de **proveedor** + **observaciones** en modal OT | ❌ |
| **Actualizar Km/Hs** desde fila de unidad | ❌ |
| **Movimiento de stock** (ingreso/egreso) desde UI | ❌ |
| **Perfil de técnicos** + carga de trabajo | ❌ |
| **Catálogo de 47 trabajos** + su uso | ❌ |
| Multi-select de técnicos con carga (`_tmsHtml`) | ⚠️ (hoy checkboxes simples) |
| Filtros multi-select en OT por centro/ciudad | ✅ (ya agregado) |
| Buscador de unidad predictivo | ✅ (ya agregado) |
| Skeleton screens (loading shimmer) | ❌ |

---

## PRIORIDAD SUGERIDA para emparejar con el original

**Alta (core operativo que falta):**
1. Vista de OT en **tarjetas con progreso** + estado Vencida + listo_cierre
2. **Costos** en el detalle de OT (+ Costo, tabla, total)
3. **+ Tarea / eliminar tarea con motivo / → Novedad** en el detalle
4. **Movimiento de stock** (ingreso/egreso) desde la UI
5. **Proveedor + observaciones** en el alta de OT
6. **Imprimir** y **Enviar por mail** desde el detalle de OT
7. **Actualizar Km/Hs** desde la fila de unidad

**Media:**
8. Botón **Excel** por módulo
9. **Catálogo de trabajos** (seed 47 + pestaña config + uso)
10. **Perfil de técnicos** + carga de trabajo al asignar
11. **Cambiar contraseña** de usuario existente
12. Filtros por columna en Unidades

**Baja / evaluar si vale la pena:**
13. **OT Rápida** (cámara+OCR+audio) — potente pero pesado (Vision API + permisos)
14. **Modo Offline** completo
15. Compresión de foto, skeleton screens
