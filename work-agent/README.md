# `work-agent/` — Documentación de trabajo del proyecto CCM

Documentación para **entender el proyecto, dónde estamos y cómo continuar** — pensada para retomar el trabajo en un chat nuevo, sin contexto previo.

## 👉 Empezá por acá

1. **[`../PROJECT.MD`](../PROJECT.MD)** — la **biblia del proyecto** (negocio + producto + arquitectura + modelo de datos + estado real + roadmap). El mapa completo.
2. **[`ESTADO-ACTUAL.md`](./ESTADO-ACTUAL.md)** — el **estado real vivo**: qué fase está hecha, qué hay en prod, qué falta, accesos y comandos. Lo primero para saber dónde estamos hoy.
3. **[`HANDOFF-COMPLETO.md`](./HANDOFF-COMPLETO.md)** — handoff autosuficiente del backend (más narrativo; útil para pasar a otro chat).
4. **[`../README.md`](../README.md)** — onboarding técnico del repo (cómo correr, comandos, deploy).

## Estado en una línea

Plataforma **EN VIVO en Railway como un solo servicio** (front + API): [health](https://ccm-api-production-91a9.up.railway.app/api/v1/health). Fases **0, A, B, D, E, F, G completas** end-to-end + las **4 features de los audios de Gastón** (beneficios, banners, participantes, notas). Falta: checkout MP de entradas (bloqueado por Gastón), acreditación QR (H), login OTP + roles, uploads de imágenes, y **tests** (deuda #1). Rama `feat/backend-foundation`. Detalle en [`ESTADO-ACTUAL.md`](./ESTADO-ACTUAL.md).

## Mapa de la carpeta

| Archivo / carpeta | Qué es |
|---|---|
| **`ONBOARDING-DEV.md`** | 🚀 **Prompt ejecutable** para que un dev senior nuevo recorra TODO el proyecto, lo entienda y proponga "¿con qué seguimos?". Empezá acá si te sumás al equipo. |
| **`ESTADO-ACTUAL.md`** | ⭐ Estado **real** vivo (qué hay en prod, qué falta, accesos). |
| `HANDOFF-COMPLETO.md` | Handoff autosuficiente del backend. |
| `PROMPT-SENIOR-DEV.md` | Prompt para arrancar un chat nuevo como senior dev. |
| `backend/00-README.md` | Índice + **16 decisiones canónicas (LEY)** del backend. |
| `backend/01`–`13` | El **plan** de arquitectura por tema (estado de partida, stack, modelo de datos, API, auth, pagos MP, analytics, infra, plan de fases, riesgos, roadmap, acreditación). |
| `backend/build/` | Prompts de construcción: `PROMPT-MAESTRO.md`, `PROMPTS-POR-FASE.md`, `CONTEXTO-Y-PLAN-ESTRATEGICO.md`. |

> ⚠️ Los docs `backend/01`–`13` son el **plan** (escrito *antes* de implementar) y hablan en futuro de cosas ya hechas. Para el **estado real** mandan `../PROJECT.MD` y `ESTADO-ACTUAL.md`. Los `00` (decisiones canónicas) y `04` (modelo de datos) siguen siendo referencia vigente.
