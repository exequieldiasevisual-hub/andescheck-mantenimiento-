import { supabase } from './supabase'

const ALIAS_KEY = 'andescheck_alias'

// Paso 1 del login: valida el alias de empresa contra la vista pública
// empresas_login (accesible sin sesión, vía RPC anon).
export async function resolverAlias(alias) {
  const { data, error } = await supabase.rpc('resolver_alias_empresa', { p_alias: alias })
  if (error) return { ok: false, msg: error.message }
  if (!data?.ok) return { ok: false, msg: data?.msg ?? 'Empresa no encontrada' }
  localStorage.setItem(ALIAS_KEY, alias.trim().toLowerCase())
  return data
}

export function getAliasGuardado() {
  return localStorage.getItem(ALIAS_KEY) ?? ''
}

// Paso 2: usuario + contraseña. El email real en auth.users es sintético
// (usuario@alias.andescheck.internal) — el usuario nunca lo ve ni lo escribe.
export async function login(usuario, password, alias) {
  const email = `${usuario.trim().toLowerCase()}@${alias.trim().toLowerCase()}.andescheck.internal`
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, msg: 'Usuario o contraseña incorrectos' }
  return { ok: true, session: data.session }
}

export async function logout() {
  await supabase.auth.signOut()
}

export async function getUsuarioActual() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('usuarios')
    .select('*, empresas (id, razon_social, logo_url)')
    .eq('auth_user_id', user.id)
    .single()
  if (error) console.error('Error cargando usuario:', user.id, error)
  return data
}
