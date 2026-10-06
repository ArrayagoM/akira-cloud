---
name: software-engineering-pro
description: Base de conocimiento profesional de ingeniería de software para el proyecto Akira — arquitectura y buenas prácticas, estrategia de testing completa, seguridad ofensiva/defensiva autorizada sobre código e infraestructura propios, y empaquetado/firma legítima de instaladores Windows (.exe/.msi) para distribuir software propio sin falsos positivos de antivirus. Usar para: diseñar o revisar arquitectura, escribir o planear tests, hacer auditorías de seguridad del propio código/infra, o construir y firmar instaladores.
---

# Software Engineering Pro — Akira

Esta skill actúa como un equipo de desarrollo senior completo (arquitecto, QA lead, AppSec engineer, release engineer) aplicado al stack real de este repo: **Node.js/Express + MongoDB/Mongoose (backend)**, **React/Vite (frontend)**, **worker de WhatsApp vía Baileys**, integraciones a **Groq (LLM)**, **MercadoPago** y **Google Calendar**, y scripts de operación en Windows (`ecosystem.config.js`, `scripts/watchdog.ps1`).

No dupliques contenido de estos archivos en tu respuesta al usuario — leélos cuando el trabajo lo requiera y aplicá lo que digan directamente al código.

## Cuándo usar cada referencia

| Situación | Archivo |
|---|---|
| Diseñar una feature nueva, revisar estructura de carpetas/servicios, decidir dónde va una responsabilidad, revisar un PR | [references/architecture.md](references/architecture.md) |
| Escribir tests (unitarios/integración/e2e), decidir qué mockear, evitar regresiones tipo "alucinación de tool" | [references/testing.md](references/testing.md) |
| Auditar seguridad del propio código/infra, revisar auth, inyección, secretos, rate limiting, dependencias | [references/security.md](references/security.md) |
| Empaquetar Akira (bot/worker/watchdog) como .exe/.msi para distribuir sin que Defender/SmartScreen lo marque | [references/packaging-signing.md](references/packaging-signing.md) |

## Principios no negociables

1. **Nunca se prueba seguridad contra sistemas de terceros sin autorización explícita.** Todo lo de `security.md` aplica solo al propio código, propia infra, o entornos con permiso escrito (pentest contratado, bug bounty). Ver el detalle de alcance en ese archivo.
2. **Nunca se ofusca ni empaqueta para evadir detección.** `packaging-signing.md` es sobre firmar y distribuir software *legítimo y propio* correctamente — el objetivo es que Windows confíe en el binario porque es confiable, no simular que lo es. Si en algún momento el pedido deriva hacia "que no lo detecten" sin firma real ni identidad real detrás, frená y preguntá.
3. **Cambios de arquitectura o seguridad que toquen código en producción (`backend/`, `worker/`) se explican antes de aplicarse**, salvo que el usuario ya haya pedido autonomía explícita para esa tarea puntual.
4. **Toda skill/documento que generes queda en español**, salvo identificadores de código (que siguen el idioma ya usado en el repo — mezcla de español/inglés, respetar el existente).

## Cómo trabajar con esta skill

- Para una tarea concreta ("revisá la arquitectura de X", "escribime tests para Y", "auditá la seguridad de Z", "empaquetá el worker como instalador"), leé **solo** el archivo de referencia relevante — no cargues los cuatro si no hacen falta.
- Estos documentos son guías de criterio, no checklists ciegas. Priorizá lo que aplica al tamaño real del proyecto (una app de un founder/equipo chico, no una corporación) — no propongas microservicios, Kubernetes ni un SOC 24/7 para esto.
- Si el pedido del usuario es ambiguo entre "hacé la auditoría/tests/empaquetado ahora" vs. "explicame cómo se hace", asumí que quiere que lo hagas, salvo que el archivo de referencia diga lo contrario para ese caso puntual (p. ej. pentest activo siempre se confirma antes).
