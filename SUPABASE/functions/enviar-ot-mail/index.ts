import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// Reemplaza GmailApp.sendEmail() de gs.js. Usa Resend (RESEND_API_KEY como
// secret de la función) porque Supabase no incluye envío de mail transaccional.
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

    const { id_ot, destinatario } = await req.json()
    if (!id_ot || !destinatario) {
      return new Response(JSON.stringify({ error: 'Faltan id_ot o destinatario' }), { status: 400, headers: corsHeaders })
    }

    // get_ot_para_imprimir ya está acotada a empresa_actual() vía RLS/RPC —
    // si la OT no pertenece a la empresa del usuario, esto devuelve ok:false.
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_ot_para_imprimir', { p_id_ot: id_ot })
    if (rpcError || !rpcData?.ok) {
      return new Response(JSON.stringify({ error: rpcData?.msg ?? rpcError?.message ?? 'OT no encontrada' }), { status: 404, headers: corsHeaders })
    }

    const { ot, unidad, tareas, empresa } = rpcData
    const html = `
      <h2>${empresa.razon_social} — Orden de Trabajo ${ot.numero_ot}</h2>
      <p><b>Unidad:</b> ${unidad.descripcion} (${unidad.patente_serie ?? ''})</p>
      <p><b>Descripción:</b> ${ot.descripcion ?? ''}</p>
      <p><b>Estado:</b> ${ot.estado}</p>
      <h3>Tareas</h3>
      <ul>${tareas.map(t => `<li>${t.descripcion} — ${t.estado}</li>`).join('')}</ul>
    `

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY') ?? ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM') ?? 'noreply@andescheck.app',
        to: [destinatario],
        subject: `OT ${ot.numero_ot} — ${empresa.razon_social}`,
        html,
      }),
    })

    if (!resendResp.ok) {
      const errBody = await resendResp.text()
      return new Response(JSON.stringify({ error: `Error enviando mail: ${errBody}` }), { status: 502, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders })
  }
})
