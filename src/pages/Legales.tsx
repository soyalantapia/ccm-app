import { SectionTitle } from '../components/ui'
import { config } from '../config'

const CONTENT = {
  terminos: {
    title: 'Términos y Condiciones',
    sections: [
      {
        h: 'Sobre la plataforma',
        p: 'Esta plataforma es el canal oficial de Córdoba Corazón de Moda (CCM) para inscripciones, entradas, contenido y comunidad. El uso de la plataforma implica la aceptación de estos términos.',
      },
      {
        h: 'Inscripciones y entradas',
        p: 'La entrada general es gratuita con inscripción previa obligatoria y sujeta a cupos. Las entradas VIP se abonan a través de Mercado Pago; la confirmación de la operación se realiza según los términos de dicha plataforma de pago.',
      },
      {
        h: 'Acreditación',
        p: 'El código QR personal es la acreditación de ingreso. Es personal e intransferible y puede ser requerido junto con una identificación en el acceso al evento.',
      },
      {
        h: 'Contenido',
        p: 'Las fotografías y videos del evento pueden incluir la imagen de los asistentes. Al participar del evento, el asistente acepta que dicho material pueda ser utilizado con fines de difusión de CCM.',
      },
    ],
  },
  privacidad: {
    title: 'Política de Privacidad',
    sections: [
      {
        h: 'Qué datos tratamos',
        p: 'Tratamos los datos que vos nos das al usar la plataforma (nombre, email, profesión, teléfono y los datos que completes en postulaciones) y datos de uso (inscripciones, descargas e interacciones), conforme a la Ley 25.326 de Protección de Datos Personales.',
      },
      {
        h: 'Para qué los usamos',
        p: 'Para gestionar tu participación en los eventos, comunicarte novedades si lo aceptaste, y elaborar métricas agregadas del evento. Nunca entregamos datos personales crudos a terceros: los sponsors solo reciben información agregada o leads con tu consentimiento explícito.',
      },
      {
        h: 'Tus derechos',
        p: 'Podés ejercer tus derechos de acceso, rectificación y supresión escribiéndonos por Instagram a ' + config.instagramHandle + '. La Agencia de Acceso a la Información Pública es el órgano de control de la Ley 25.326.',
      },
      {
        h: 'Consentimientos',
        p: 'Cada consentimiento (términos, novedades, beneficios de sponsors) se registra con fecha y hora y podés revisarlos desde tu perfil.',
      },
    ],
  },
} as const

export default function Legales({ kind }: { kind: 'terminos' | 'privacidad' }) {
  const content = CONTENT[kind]
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 md:py-20">
      <SectionTitle eyebrow="Legales" title={content.title} />
      <div className="mt-10 space-y-8">
        {content.sections.map((s) => (
          <section key={s.h}>
            <h2 className="type-serif text-xl text-ink">{s.h}</h2>
            <p className="mt-2.5 text-[15px] leading-relaxed text-ink-soft">{s.p}</p>
          </section>
        ))}
        <p className="border-t border-line pt-6 text-xs text-ink-soft/70">
          Documento editable desde el panel de administración en fases siguientes. Última
          actualización: junio de 2026.
        </p>
      </div>
    </div>
  )
}
