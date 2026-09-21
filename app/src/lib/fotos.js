// Redimensiona y comprime una foto en un canvas; devuelve un Blob jpeg.
// Offline se usa una versión más chica para que la cola de localStorage aguante.
export function comprimirFoto(file, ancho, calidad) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const escala = Math.min(1, ancho / img.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * escala)
      canvas.height = Math.round(img.height * escala)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto'))), 'image/jpeg', calidad)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la foto')) }
    img.src = url
  })
}

export const blobADataUrl = blob => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(new Error('No se pudo leer la foto'))
  r.readAsDataURL(blob)
})
