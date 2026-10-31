# Pagos desde el exterior (Creem + cripto) — estado y decisiones

Escrito el 28/10/2026. Argentina sigue pagando en pesos con Mercado Pago (sin cambios). El resto del mundo paga en dólares.

## Reglas por país (`backend-desktop/lib/pagos-region.js`, con tests en `tests/pagos-region.test.js`)
- **Argentina:** solo Mercado Pago (pesos). Tarjeta del exterior y cripto: bloqueados con motivo.
- **Chile, México, Venezuela, Colombia, Perú, Uruguay, Bolivia, Ecuador, Paraguay, Brasil, España, EE.UU., "otro país":** Mercado Pago **bloqueado** ("solo está disponible para pagos desde Argentina"); habilitados tarjeta/PayPal (Creem) y cripto (USDT) si están configurados. Sugerido: tarjeta.
- **Cuba, Irán, Corea del Norte, Siria:** ningún método.
- El servidor vuelve a comprobarlo al armar cada pago: bloquear un botón no alcanza.

## Precios del exterior (USD por mes; anual = 12 meses con 20 % de descuento)
Cuenta: precio en pesos ÷ dólar MEP de referencia ($1.550, 28/10/2026) × 1,30 (30 % por impuestos y cambio), redondeado al dólar.

| Plan | Pesos (Argentina) | USD mensual | USD anual |
|---|---|---|---|
| Básico | $21.000 | 18 | 173 |
| Pro | $49.000 | 41 | 394 |
| Agencia | $112.000 | 94 | 902 |

## Creem (tarjeta / PayPal, suscripción automática)
Merchant of Record: Creem es el vendedor legal y se ocupa de los impuestos. Comisión informada en su panel: 3,9 % + US$0,40 por venta. Pago a Argentina por transferencia bancaria (>= US$50) o USDC.
Productos creados en producción el 28/10/2026 (precio con impuestos incluidos, categoría SaaS, regreso a `https://akiracloud.lat/planes?suscripcion=ok&proveedor=creem`):

| Plan | ID de producto |
|---|---|
| basico_mensual | `prod_4czgYBYQoJYpMF4TnOMhBE` |
| basico_anual | `prod_4jQxvlFjt4PcZfd3QVRLgN` |
| pro_mensual | `prod_5x7mWmJKCpPHyVk21FF3jO` |
| pro_anual | `prod_2bOvzLZmoowHVh0gl7C9WI` |
| agencia_mensual | `prod_2ZtUbgCrplzZI2jnXOgWOv` |
| agencia_anual | `prod_5bPe4T6XBQkXGB03ES6syc` |

Datos de su documentación (docs.creem.io): checkout `POST https://api.creem.io/v1/checkouts` con `x-api-key` (modo de prueba: `test-api.creem.io`); avisos con cabecera `creem-signature` = HMAC-SHA256 hexadecimal del cuerpo SIN tocar, con el secreto del aviso; eventos `checkout.completed`, `subscription.active|paid|update|scheduled_cancel|canceled|past_due|unpaid|expired`, `refund.created`, `dispute.created`; 5 intentos de entrega (30 s, 5 min, 30 min, 6 h) y responde dentro de 15 s; pueden llegar duplicados (hay que ser idempotentes).

## Pendiente
- Cuenta de Creem sin aprobar todavía (verificación de identidad/negocio): hasta entonces no se puede cobrar.
- Código del servidor para Creem y para cripto (NOWPayments), pantalla de planes con selector de país y página de cripto con el diseño de Akira.
- Claves: la API key de Creem y el secreto del aviso los carga el dueño en Vercel (no se pasan por el chat).
- El código de Stripe (`services/stripe.service.js`, `lib/stripe-cobro.js`, `models/StripeEvento.js`) queda sin usar: Stripe no activa cuentas en Argentina sin empresa. No se conecta a ninguna ruta.
