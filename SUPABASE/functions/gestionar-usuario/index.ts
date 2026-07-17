import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const ROLES_VALIDOS = ['administrador', 'supervisor', 'tecnico', 'auditor']

// El "usuario" (ej. "jperez") no es único global — el email real en
// auth.users se arma como usuario@<alias-empresa>.andescheck.internal.
// Así dos empresas distintas pueden tener cada una su propio "jperez"
// sin colisionar en Supabase Auth.
function emailSintetico(usuario, alias) {
  return `${usuario.trim().toLowerCase()}@${alias.trim().toLowerCase()}.andescheck.internal`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Sin autorización' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), { status: 401, headers: corsHeaders })
    }

    // Quien llama debe ser administrador — se lee también su empresa_id,
    // porque un admin SOLO puede gestionar usuarios de SU propia empresa.
    const { data: llamador } = await supabase
      .from('usuarios')
      .select('rol, empresa_id')
      .eq('auth_user_id', user.id)
      .single()

    if (llamador?.rol !== 'administrador') {
      return new Response(JSON.stringify({ error: 'Solo el administrador puede gestionar usuarios' }), { status: 403, headers: corsHeaders })
    }
    const empresaId = llamador.empresa_id

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: empresa } = await adminClient
      .from('empresas')
      .select('alias')
      .eq('id', empresaId)
      .single()

    if (!empresa) {
      return new Response(JSON.stringify({ error: 'Empresa no encontrada' }), { status: 400, headers: corsHeaders })
    }

    const body = await req.json()
    const { accion } = body

    // ── CREAR USUARIO ───────────────────────────────────────────────────
    if (accion === 'crear') {
      const { usuario, password, nombre, rol } = body

      if (!usuario || !password || !nombre || !rol) {
        return new Response(JSON.stringify({ error: 'Usuario, contraseña, nombre y rol son obligatorios' }), { status: 400, headers: corsHeaders })
      }
      if (!ROLES_VALIDOS.includes(rol)) {
        return new Response(JSON.stringify({ error: 'Rol no válido' }), { status: 400, headers: corsHeaders })
      }

      const email = emailSintetico(usuario, empresa.alias)

      const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (authError) {
        return new Response(JSON.stringify({ error: authError.message }), { status: 400, headers: corsHeaders })
      }

      const { error: usrError } = await adminClient.from('usuarios').insert({
        auth_user_id: authUser.user.id,
        empresa_id: empresaId,
        usuario,
        nombre,
        rol,
      })

      if (usrError) {
        await adminClient.auth.admin.deleteUser(authUser.user.id)
        const msg = usrError.code === '23505' ? 'Ese usuario ya existe en esta empresa' : usrError.message
        return new Response(JSON.stringify({ error: msg }), { status: 400, headers: corsHeaders })
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── DESACTIVAR USUARIO ──────────────────────────────────────────────
    if (accion === 'desactivar') {
      const { auth_user_id } = body
      if (!auth_user_id) {
        return new Response(JSON.stringify({ error: 'Falta auth_user_id' }), { status: 400, headers: corsHeaders })
      }

      await adminClient.from('usuarios').update({ activo: false }).eq('auth_user_id', auth_user_id).eq('empresa_id', empresaId)
      await adminClient.auth.admin.updateUserById(auth_user_id, { ban_duration: '876600h' })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── REACTIVAR USUARIO ───────────────────────────────────────────────
    if (accion === 'reactivar') {
      const { auth_user_id } = body
      if (!auth_user_id) {
        return new Response(JSON.stringify({ error: 'Falta auth_user_id' }), { status: 400, headers: corsHeaders })
      }

      await adminClient.from('usuarios').update({ activo: true }).eq('auth_user_id', auth_user_id).eq('empresa_id', empresaId)
      await adminClient.auth.admin.updateUserById(auth_user_id, { ban_duration: 'none' })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── CAMBIAR CONTRASEÑA ──────────────────────────────────────────────
    if (accion === 'cambiar_password') {
      const { auth_user_id, password } = body
      if (!auth_user_id || !password) {
        return new Response(JSON.stringify({ error: 'Faltan campos' }), { status: 400, headers: corsHeaders })
      }

      // Verificar que el usuario objetivo pertenece a la misma empresa del admin
      const { data: objetivo } = await adminClient
        .from('usuarios').select('id').eq('auth_user_id', auth_user_id).eq('empresa_id', empresaId).single()
      if (!objetivo) {
        return new Response(JSON.stringify({ error: 'Usuario no encontrado en esta empresa' }), { status: 404, headers: corsHeaders })
      }

      const { error } = await adminClient.auth.admin.updateUserById(auth_user_id, { password })
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders })
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Acción no reconocida' }), { status: 400, headers: corsHeaders })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
