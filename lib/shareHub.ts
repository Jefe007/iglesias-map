import type { Church } from './supabase'

// Message is in Spanish regardless of the (English) app UI — it's read by
// pastors/drivers/field staff in the field, who communicate in Spanish.
//
// No emoji here on purpose: wa.me's redirect to api.whatsapp.com has been
// observed mangling astral-plane characters (e.g. 📍, a surrogate pair) into
// a replacement character mid-flight, before WhatsApp itself ever renders
// the message — verified by reading the actual post-redirect URL, not just
// the link this app generates (which encodes it correctly).
export function buildHubShareText(church: Church, activeProjectLabels: string[]): string {
  const lines = [`*${church.name}*`]
  if (church.pastor_name) lines.push(`Encargado: ${church.pastor_name}`)
  if (church.phone) lines.push(`Teléfono: +58 ${church.phone}`)
  lines.push(`Parroquia: ${church.parish}`)
  if (activeProjectLabels.length) lines.push(`Proyectos activos: ${activeProjectLabels.join(', ')}`)
  lines.push(`Starlink: ${church.has_starlink ? 'Instalado' : 'No instalado'}`)
  if (church.lat != null && church.lng != null) {
    lines.push('', `Ubicación (Google Maps): https://www.google.com/maps/search/?api=1&query=${church.lat},${church.lng}`)
  }
  return lines.join('\n')
}

// No phone number — wa.me opens WhatsApp's own contact/chat picker so the
// user chooses who to send it to, instead of us guessing a recipient.
export function whatsappShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
