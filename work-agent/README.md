# `work-agent/` — Documentación del proyecto CCM

Toda la documentación para **entender el proyecto, dónde estamos y cómo continuar** — pensada para retomar el trabajo en un chat nuevo, sin contexto previo.

## 👉 Empezá por acá

**[`HANDOFF-COMPLETO.md`](./HANDOFF-COMPLETO.md)** — el documento maestro y autosuficiente: qué es CCM, la arquitectura, qué está hecho, qué falta (y qué lo bloquea), todos los accesos/URLs/comandos, y cómo retomar paso a paso. **Si vas a pasar esto a otro chat, ese es el archivo.**

## Estado en una línea

Backend **EN VIVO en Railway** ([health](https://ccm-api-production-91a9.up.railway.app/api/v1/health)), **5 fases completas** (0, A, B, E, G) end-to-end y verificadas. Lo que falta (pagos C/D/F, uploads, login OTP, acreditación H) está **bloqueado por insumos externos** — el #1 es la **cuenta de Mercado Pago de Gastón**. Código en la rama `feat/backend-foundation` (sin pushear). Tarea pendiente: chip `task_d44abe3b`.

## Mapa de la carpeta

| Archivo / carpeta | Qué es |
|---|---|
| **`HANDOFF-COMPLETO.md`** | **Empezá acá.** Estado completo + cómo continuar. |
| `backend/00-README.md` | Índice + **decisiones canónicas** del backend. |
| `backend/01`–`13` | El plan de arquitectura por tema (estado, stack, modelo de datos, API, auth, pagos, analytics, infra, migración por fases, riesgos, roadmap, acreditación). |
| `backend/build/` | Prompts para construir el backend con un agente: `PROMPT-MAESTRO.md`, `PROMPTS-POR-FASE.md`, `CONTEXTO-Y-PLAN-ESTRATEGICO.md`. |

> Los docs `backend/01`–`13` son el **plan** (escrito antes de implementar). Lo **realmente construido y sus desvíos** están en `HANDOFF-COMPLETO.md` (que manda en caso de duda) y en los mensajes de commit de la rama.
