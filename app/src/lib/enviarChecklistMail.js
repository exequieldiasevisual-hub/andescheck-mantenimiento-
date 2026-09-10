// Dispara el envío por mail del PDF del checklist ya guardado. Es un
// extra sobre el guardado real (que ya sucedió cuando esto se llama) —
// si falla, no bloqueamos ni le mostramos un error duro al usuario, el
// checklist en sí ya quedó guardado correctamente.
export async function enviarChecklistMail(supabase, idEjecucion) {
  if (!idEjecucion) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/enviar-checklist-mail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ id_ejecucion: idEjecucion }),
    })
  } catch {
    // silencioso a propósito, ver comentario arriba
  }
}
