# Empaquetado y firma de instaladores Windows — Akira

## 0. El objetivo real (y el límite)

El objetivo es que Windows Defender/SmartScreen y los antivirus **confíen en el binario porque es legítimamente identificable y verificable** — no simular legitimidad. La diferencia importa: firma de código real con una identidad real y verificable es exactamente lo opuesto a "hacer que parezca oficial" — es *hacerlo* verificable como propio. No corresponde acá ningún método de ofuscación, packer para evadir heurísticas, ni falsificación de metadata/editor. Si en algún momento el pedido deriva hacia eso, frenar y preguntar.

Esto aplica típicamente para empaquetar el **worker** (`worker/worker.js`, que corre en la PC del cliente) como un instalador que un cliente no técnico pueda instalar sin abrir una terminal.

## 1. Por qué Defender/SmartScreen marcan un .exe nuevo aunque sea inofensivo

- Un ejecutable sin firma y con pocas descargas no tiene "reputación" en SmartScreen → warning de "Windows protegió tu PC".
- Herramientas de empaquetado tipo `pkg`/`nexe` generan binarios que empaquetan el runtime de Node dentro de un solo .exe — el patrón de bytes resultante es similar al que usan droppers de malware reales, así que algunos AV heurísticos lo marcan por *comportamiento del empaquetador*, no por el código en sí.
- Packers de compresión (UPX y similares) comprimen y descomprimen en memoria al ejecutar — es exactamente el patrón que usa malware para evadir escaneo estático, así que el heurístico lo penaliza aunque el contenido sea benigno. **No usar UPX ni packers similares en ejecutables que se van a distribuir.**

## 2. Camino recomendado, de punta a punta

### Paso 1 — Empaquetar el runtime de Node correctamente
Opciones, de más a menos recomendada para este caso (worker Node.js sin UI):
- **`pkg` o `@yao-pkg/pkg`** (fork mantenido, `pkg` original está sin mantenimiento) → genera un único .exe con el runtime embebido. Configurar `assets` explícitamente en `package.json` para no embeber archivos innecesarios, y NO comprimir el resultado con un packer externo.
- **Node's Single Executable Applications (SEA)**, nativo desde Node 20 — más nuevo, menos plug-and-play para dependencias nativas, pero es el camino "oficial" de Node a futuro.
- Si el worker necesita tray icon / UI nativa más adelante, considerar Electron + `electron-builder` (que ya integra firma de código y generación de instalador MSI/NSIS en un solo paso), pero es overkill si hoy es solo un proceso de fondo.

### Paso 2 — Generar el instalador (.msi o .exe instalador), no distribuir el binario pelado
Un instalador (vs. un .exe suelto) además de verse más profesional, permite registrar el worker como servicio de Windows automáticamente. Opciones:
- **WiX Toolset** → genera `.msi` real, es el estándar para instaladores MSI, se integra bien en CI (línea de comandos, sin GUI necesaria).
- **Inno Setup** → genera `.exe` instalador, más simple de scriptear que WiX, muy usado para herramientas de escritorio chicas — buena opción para este caso.
- **NSIS** → similar a Inno Setup, más flexible/más verboso.

Para correr el worker como proceso persistente sin que el usuario deba dejar una consola abierta, dentro del instalador registrar el proceso como **servicio de Windows** con **NSSM** o `node-windows`, en vez de depender de que el usuario ejecute `npm start` a mano. Esto también reemplaza la necesidad de `scripts/watchdog.ps1` corriendo manualmente — un servicio de Windows con `Restart=on-failure` cubre el mismo caso de forma nativa.

### Paso 3 — Firma de código (Authenticode) — el paso que realmente resuelve el problema de AV
1. Conseguir un **certificado de firma de código** de una CA reconocida (DigiCert, Sectigo, GlobalSign, etc.).
   - Desde junio 2023, las reglas del CA/Browser Forum exigen que la clave privada de certificados **OV** (Organization Validation) viva en hardware (token USB o HSM) — ya no se puede tener el `.pfx` suelto en disco. Para equipos chicos/individuales sin token físico, la alternativa moderna es un servicio cloud de firma como **Azure Trusted Signing** (más accesible en costo que un certificado EV tradicional) o **SignPath**.
   - Un certificado **EV** (Extended Validation) da reputación SmartScreen *inmediata* (sin necesitar volumen de descargas primero); uno OV normal necesita construir reputación con el tiempo. Si el volumen de instalaciones al día de hoy es bajo, EV es la diferencia entre "warning desde el día 1" y "confiado desde el día 1".
2. Firmar el instalador (no solo el .exe interno, también el instalador final) con `signtool.exe` (incluido en el Windows SDK):
   ```
   signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /a MiInstalador.msi
   ```
3. **Siempre incluir timestamp** (`/tr`) — así la firma sigue siendo válida después de que el certificado expire, mientras el timestamp sea de cuando el certificado era válido.
4. En CI/CD: nunca commitear el `.pfx`/credenciales del certificado al repo. Si se usa un token de hardware, la firma tiene que hacerse desde una máquina con el token conectado (no es automatizable en un runner cloud genérico salvo que el proveedor ofrezca firma remota, que es justamente lo que resuelven Azure Trusted Signing/SignPath).

### Paso 4 — Construir/recuperar reputación
- Con certificado EV: reputación inmediata en SmartScreen.
- Con certificado OV/estándar: la reputación se construye con volumen de descargas de ese binario firmado específico a lo largo del tiempo — cada nueva versión firmada con el mismo certificado hereda parte de esa reputación (por eso importa firmar consistentemente con el mismo certificado en cada release, no cambiar de identidad).
- Si un antivirus específico (no Windows Defender/SmartScreen) sigue marcando el binario firmado como falso positivo: reportarlo directamente al vendor. **VirusTotal** centraliza esto — subir el binario, ver qué motores lo marcan, y usar el link de "report false positive" de cada vendor que lo marque (Microsoft, Kaspersky, Avast, etc. tienen formularios dedicados para esto).

## 3. Checklist final antes de distribuir un instalador

1. ¿Está firmado con Authenticode (instalador Y el .exe interno si aplica) con timestamp?
2. ¿Se evitó UPX/packers de compresión en el .exe generado por `pkg`/SEA?
3. ¿El instalador registra el worker como servicio de Windows en vez de depender de una consola abierta o de correr `watchdog.ps1` manualmente?
4. ¿La identidad del firmante (nombre de organización en el certificado) es la real del usuario/empresa — nada de nombre genérico o inventado?
5. ¿Se probó la instalación en una VM limpia de Windows con Defender activo (sin exclusiones puestas a mano) para confirmar que no dispara warning?
6. Si igual dispara un falso positivo puntual en algún AV: ¿se reportó al vendor vía VirusTotal en vez de "resolverlo" con ofuscación?

## 4. Qué NO hacer nunca (aunque parezca un atajo más rápido)

- No usar packers/crypters diseñados para evasión (cualquier herramienta que se anuncie como "FUD"/"undetectable" es una herramienta de malware, punto — no tiene uso legítimo).
- No falsificar el "Publisher"/metadata del .exe para que aparente ser de otra empresa u otro software conocido.
- No agregar exclusiones de Windows Defender como parte del *instalador que se distribuye* (agregar una exclusión en la propia PC de desarrollo mientras se programa está bien; pedirle al instalador que desactive o excluya rutas en la PC del cliente final es exactamente el patrón que usa malware para asegurarse persistencia sin detección).
- No distribuir sin firmar "total, total el cliente le da click en 'ejecutar de todos modos'" — entrenar a los propios clientes a ignorar warnings de seguridad es un daño en sí mismo, además de que reduce confianza real en el producto.
