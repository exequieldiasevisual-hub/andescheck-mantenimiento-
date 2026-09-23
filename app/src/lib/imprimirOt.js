import logoAndesCheck from '../assets/andescheck-logo.svg'

// Abre una pestaña con la OT lista para imprimir — usado tanto desde el
// detalle de la OT como desde la tarjeta en el listado.
export async function imprimirOt(supabase, idOt) {
  const { data, error } = await supabase.rpc('get_ot_para_imprimir', { p_id_ot: idOt })
  if (error || !data?.ok) throw new Error(error?.message ?? data?.msg ?? 'No se pudo imprimir')
  const { ot: o, unidad, tareas: ts, costos: cs, total, empresa } = data
  const w = window.open('', '_blank')
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OT ${o.numero_ot}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:13px;color:#222;padding:24px}
      .logo{text-align:center;margin-bottom:12px}
      .logo img{height:48px}
      .header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #E8821A;padding-bottom:12px;margin-bottom:16px}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#2D3748;color:#fff;padding:7px 10px;text-align:left;font-size:11px}
      td{padding:7px 10px;border-bottom:1px solid #eee}
      .total{text-align:right;font-weight:700;font-size:16px}
      .footer{margin-top:8px;text-align:center;font-size:10px;color:#a0aec0}
      @media print{button{display:none}}
    </style></head><body>
    <div class="logo"><img src="${new URL(logoAndesCheck, window.location.origin).href}" alt="AndesCheck" /></div>
    <div class="header">
      <div><h2 style="margin:0;color:#2D3748">${empresa?.razon_social ?? ''}</h2></div>
      <div style="text-align:right"><strong>ORDEN DE TRABAJO</strong><br><span style="font-size:20px;font-weight:800;color:#E8821A">${o.numero_ot}</span></div>
    </div>
    <div class="info">
      <div><strong>Unidad:</strong> ${unidad?.descripcion ?? ''} — ${unidad?.patente_serie ?? ''}</div>
      <div><strong>Estado:</strong> ${o.estado}</div>
      <div><strong>Tipo:</strong> ${o.tipo}</div>
      <div><strong>Prioridad:</strong> ${o.prioridad ?? '—'}</div>
      <div><strong>Apertura:</strong> ${new Date(o.fecha_apertura).toLocaleDateString()}</div>
      <div><strong>Cierre:</strong> ${o.fecha_cierre ? new Date(o.fecha_cierre).toLocaleDateString() : '—'}</div>
      <div style="grid-column:1/-1"><strong>Descripción:</strong> ${o.descripcion ?? ''}</div>
      ${o.observaciones ? `<div style="grid-column:1/-1"><strong>Observaciones:</strong> ${o.observaciones}</div>` : ''}
    </div>
    <strong>TAREAS</strong>
    <table><thead><tr><th>#</th><th>Descripción</th><th>Estado</th></tr></thead><tbody>
      ${(ts || []).map(t => `<tr><td>${t.orden}</td><td>${t.descripcion}</td><td>${t.estado}</td></tr>`).join('')}
    </tbody></table>
    ${(cs || []).length ? `<strong>COSTOS</strong><table><thead><tr><th>Descripción</th><th>Monto</th></tr></thead><tbody>
      ${cs.map(c => `<tr><td>${c.descripcion ?? ''}</td><td>$${Number(c.monto).toLocaleString('es-AR')}</td></tr>`).join('')}
    </tbody></table><div class="total">Total: $${Number(total || 0).toLocaleString('es-AR')}</div>` : ''}
    <div style="margin-top:40px;border-top:1px solid #ccc;padding-top:16px;font-size:11px;color:#718096;display:flex;justify-content:space-between">
      <span>Firma técnico: ______________________</span>
      <span>Firma supervisor: ______________________</span>
    </div>
    <div class="footer">Powered by AndesCheck</div>
    <script>window.print()<\/script>
    </body></html>`)
  w.document.close()
}
