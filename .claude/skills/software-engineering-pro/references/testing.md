# Estrategia de testing — Akira

## 1. Convención actual del repo (respetarla salvo que se decida migrar)

No hay Jest/Vitest instalado. El patrón real es un **test runner casero**:

```js
function assert(condicion, mensaje) {
  if (!condicion) throw new Error(`FAIL: ${mensaje}`);
  console.log(`  ✅ ${mensaje}`);
}
```

Cada archivo `*.test.js` en `backend/tests/` o `worker/tests/` es un script standalone ejecutable con `node archivo.test.js`, encadenado en `package.json` → `"test": "node tests/a.test.js && node tests/b.test.js && ..."`. Al agregar un test nuevo:

1. Crear `backend/tests/<nombre>.test.js` (o `worker/tests/`) siguiendo el mismo patrón de `assert` + `console.log`.
2. Agregarlo a la cadena `&&` en `package.json` → `scripts.test`.
3. Si el módulo cachea estado (como `env.validator`), usar `delete require.cache[require.resolve(...)]` entre casos para forzar releer el módulo — ya es el patrón usado.

## 2. Evolución recomendada (opt-in, no romper lo existente)

El proyecto ya requiere `node >= 20`, que trae **`node:test`** built-in (sin dependencia nueva) con reporter decente, `--watch`, y cobertura (`--experimental-test-coverage`). Si el usuario pide "modernizar los tests":

- Migrar gradualmente reemplazando el `assert` casero por `node:assert/strict` + `describe`/`it` de `node:test`, manteniendo el mismo nombre de archivo para no romper el script de `package.json`.
- No proponer Jest/Mocha a menos que el usuario lo pida explícitamente — agregar una dependencia grande para esto no se justifica en un proyecto que ya tiene el built-in disponible.
- Para frontend (React/Vite), si se pide testing de componentes, la opción liviana y estándar es **Vitest + Testing Library** (Vite ya está en el proyecto, Vitest comparte config).

## 3. Qué testear con prioridad (orden real de riesgo en este proyecto)

1. **Funciones puras del bot** (armado de prompts, decisión de qué tool llamar, parseo de resultado de tool) — son las más fáciles de testear y las que más bugs reales causaron (alucinaciones, listas resumidas, tool_calls huérfanos). Cualquier fix de un bug de este tipo **debe** venir con un test de regresión, siguiendo el patrón ya usado en `tests/tool-hallucination.test.js`.
2. **Aislamiento multi-usuario/multi-slot** — tests que crean 2+ usuarios/slots simulados y verifican que una operación en uno no filtra al otro (ver `tests/multi-slot-routing.test.js` como referencia de qué cubrir).
3. **Cálculo de plata**: cupos de mensajes (`quota.service.js`), gating por plan (`planes.js`), montos de MercadoPago. Bug real ya ocurrido: "cobro 3x — LLM alucinaba hora_fin y multiplicaba precio por horas" — este tipo de cálculo necesita tests con inputs adversariales (horas negativas, `hora_fin` menor a `hora_inicio`, valores no numéricos que el LLM podría inventar).
4. **Webhooks e idempotencia**: MercadoPago y GCal pueden reintentar el mismo webhook — testear que procesar el mismo evento dos veces no duplica el efecto (turno duplicado, cobro duplicado).
5. **Servicios de encriptación/credenciales** (`crypto.service.js`, `env.validator.js`) — ya cubiertos, mantener cobertura al tocarlos.

## 4. Qué NO mockear (y qué sí)

- **Sí mockear siempre**: Groq (LLM), MercadoPago API, Google Calendar API, Baileys/WhatsApp — son I/O externo, lento, con costo o rate limit real. Un test que llama a Groq de verdad no es un test unitario, es un test manual.
- **No mockear Mongo si se puede evitar para tests de integración de services**: usar `mongodb-memory-server` (o una instancia local descartable) para tests de services que hacen queries reales — mockear Mongoose profundamente termina testeando los mocks, no el código. Para tests puramente unitarios de lógica (no de queries), sí está bien pasar objetos plain en vez de instancias de modelo.
- **Nunca testear contra la base de producción o contra el WhatsApp real de un cliente.**

## 5. Tests de "última milla" para el worker

El worker corre en la PC del cliente, fuera del control directo del equipo. Es el componente con menos observabilidad en producción, así que compensarlo con tests explícitos de:
- Reconexión tras pérdida de socket/HTTP con el backend.
- Comportamiento cuando el backend devuelve 5xx o timeout (no debe crashear el proceso — el `watchdog.ps1` lo reinicia, pero un test evita depender solo de eso).
- `instkey.js`/`instkey.util.js` (identidad de instalación) — ya tienen tests en ambos lados (`backend/tests/instkey.util.test.js`, `worker/tests/instkey.test.js`); cualquier cambio a ese contrato debe actualizar los dos.

## 6. Checklist antes de dar un fix por terminado

1. ¿Existe un test que falla ANTES del fix y pasa DESPUÉS? (si no se puede reproducir en un test, dudar de si el fix realmente ataca la causa raíz).
2. ¿El test cubre el caso adversarial real que causó el bug, no una versión simplificada?
3. ¿Corre en CI/local con un solo comando (`npm test`), sin pasos manuales?
4. ¿Se agregó a la cadena de `package.json` si es un archivo nuevo (paso que se olvida seguido con este patrón de test runner casero)?
