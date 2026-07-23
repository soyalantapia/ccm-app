/**
 * Guarda contra soltar archivos encima de la ventana.
 *
 * Si nadie cancela `dragover` y `drop`, el navegador NAVEGA al archivo soltado: el panel
 * desaparece y el formulario a medio cargar se pierde entero, porque vive sólo en memoria —
 * no hay borrador en disco ni aviso de "salir sin guardar".
 *
 * No es hipotético: quien carga contenido arrastra la foto encima del formulario en vez de
 * buscar el botón "Subir", y hoy no hay nada en pantalla que le avise que eso no es una opción.
 * Pierde media hora de trabajo sin entender qué pasó.
 *
 * Sólo se frenan los arrastres que traen ARCHIVOS: arrastrar texto adentro de un campo sigue
 * funcionando igual. Si algún día hay una zona de drop propia, se marca con `data-dropzone` y
 * queda exenta.
 */

/** Un arrastre de archivos expone `types` con 'Files'. Texto seleccionado, no. */
function traeArchivos(e: DragEvent): boolean {
  const t = e.dataTransfer?.types
  return !!t && Array.prototype.includes.call(t, 'Files')
}

/** true si el destino está dentro de una zona que declara manejar el drop ella misma. */
function enZonaPropia(e: DragEvent): boolean {
  const t = e.target
  return t instanceof Element && !!t.closest('[data-dropzone]')
}

/** Instala la guarda. Devuelve la función para desinstalarla (tests). */
export function instalarDropGuard(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  const frenar = (ev: Event) => {
    const e = ev as DragEvent
    if (!traeArchivos(e) || enZonaPropia(e)) return
    e.preventDefault()
    // 'none' hace que el cursor muestre el círculo tachado: la persona ve que ahí no va.
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
  }
  target.addEventListener('dragover', frenar)
  target.addEventListener('drop', frenar)
  return () => {
    target.removeEventListener('dragover', frenar)
    target.removeEventListener('drop', frenar)
  }
}
