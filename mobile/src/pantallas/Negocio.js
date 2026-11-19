import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, TextInput, ActivityIndicator, AppState, Linking, StyleSheet } from 'react-native';
import { C, Tarjeta, Titulo, Suave, Insignia, TONO } from '../ui';
import { leerDatos } from '../api';
import { hace } from '../estado';
import { SECCIONES, agruparTurnos, estadoTurno, pesos, agruparMovimientos, filtrarTexto, textoStock, etiquetaMes, avisoViejo } from '../negocio';

const CADA_MS = 30 * 1000; // casi en vivo mientras la pantalla está abierta

// Los datos de tu negocio tal como están en la PC (solo lectura): agenda, caja, clientes y catálogo.
// Aparecen si el usuario activó "Ver los datos de mi negocio en el celular" en la PC; ahí elige cuáles.
export default function Negocio() {
  const [seccion, setSeccion] = useState('agenda');
  const [datos, setDatos] = useState({}); // por sección: { pcs, ahora }
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { const r = await leerDatos(seccion); if (vivo.current) { setDatos((d) => ({ ...d, [seccion]: r })); setError(''); } }
    catch (e) { if (vivo.current && e.status !== 401) setError(e.message); }
    finally { if (vivo.current) setCargando(false); }
  }, [seccion]);

  useEffect(() => {
    cargar();
    const t = setInterval(() => { if (AppState.currentState === 'active') cargar(); }, CADA_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') cargar(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [cargar]);
  useEffect(() => { setBusqueda(''); }, [seccion]);

  const actual = datos[seccion];
  const pcs = actual?.pcs || [];

  return (
    <View style={{ flex: 1 }}>
      <View style={s.selector} accessibilityRole="tablist">
        {SECCIONES.map((x) => (
          <Pressable key={x.id} onPress={() => setSeccion(x.id)} style={[s.opcion, seccion === x.id && s.opcionActiva]} accessibilityRole="tab" accessibilityState={{ selected: seccion === x.id }} accessibilityLabel={x.etiqueta}>
            <Text style={[s.opcionTexto, seccion === x.id && { color: '#000' }]}>{x.etiqueta}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={C.verde} />}>
        {!!error && <Tarjeta borde={C.rojo} estilo={{ marginBottom: 12 }}><Text style={{ color: C.rojo }}>{error}</Text></Tarjeta>}
        {!actual && !error && <ActivityIndicator color={C.verde} style={{ marginTop: 30 }} />}
        {actual && pcs.length === 0 && (
          <Tarjeta>
            <Text style={s.vacioTitulo}>Todavía no hay datos para mostrar</Text>
            <Suave estilo={{ marginTop: 6 }}>En Akira (PC) → Inicio, activá “Ver los datos de mi negocio en el celular” y elegí qué querés ver. La PC tiene que estar prendida y con internet. Es opcional y lo podés apagar cuando quieras.</Suave>
          </Tarjeta>
        )}
        {pcs.map((pc) => (
          <View key={pc.deviceId} style={{ marginBottom: 22 }}>
            {pcs.length > 1 && <Text style={s.pc}>{pc.nombre}</Text>}
            {seccion === 'agenda' && <Agenda datos={pc.datos} ahora={actual.ahora} />}
            {seccion === 'caja' && <Caja datos={pc.datos} />}
            {seccion === 'clientes' && <Clientes datos={pc.datos} busqueda={busqueda} setBusqueda={setBusqueda} />}
            {seccion === 'catalogo' && <Catalogo datos={pc.datos} busqueda={busqueda} setBusqueda={setBusqueda} />}
            <Suave estilo={{ marginTop: 10 }}>Actualizado {hace(pc.actualizadoEn, new Date(actual.ahora || Date.now()))}</Suave>
            {avisoViejo(pc.actualizadoEn, actual.ahora) && <Text style={s.aviso}>{avisoViejo(pc.actualizadoEn, actual.ahora)}</Text>}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Agenda({ datos, ahora }) {
  const dias = agruparTurnos(datos.turnos, ahora);
  if (!dias.length) return <Tarjeta><Text style={s.vacioTitulo}>No hay turnos en estos días</Text><Suave estilo={{ marginTop: 6 }}>Se muestran los de ayer, hoy y los próximos 14 días.</Suave></Tarjeta>;
  return dias.map((d) => (
    <View key={d.dia} style={{ marginBottom: 14 }}>
      <Text style={[s.dia, d.esHoy && { color: C.verde }]}>{d.etiqueta}</Text>
      {d.turnos.map((t) => {
        const e = estadoTurno(t);
        return (
          <Tarjeta key={t.id || t.inicio + t.cliente} estilo={{ marginBottom: 8 }}>
            <View style={s.fila}>
              <Text style={s.hora}>{t.hora}{t.hasta ? ` – ${t.hasta}` : ''}</Text>
              <Insignia texto={e.texto} color={TONO[e.tono]} />
            </View>
            <Text style={s.principal}>{t.cliente || t.titulo || 'Turno'}</Text>
            {!!t.titulo && t.titulo !== t.cliente && <Text style={s.secundario}>{t.titulo}</Text>}
            {!!t.detalle && <Text style={s.secundario}>{t.detalle}</Text>}
            <View style={[s.fila, { marginTop: 6 }]}>
              <Text style={s.chico}>{[t.puesto && t.puesto !== 'General' ? t.puesto : '', t.monto > 0 ? pesos(t.monto) : ''].filter(Boolean).join(' · ')}</Text>
              {!!t.telefono && <Pressable onPress={() => Linking.openURL('tel:' + String(t.telefono).replace(/[^\d+]/g, ''))} accessibilityRole="link" accessibilityLabel={`Llamar a ${t.cliente || 'cliente'}`}><Text style={s.link}>{t.telefono}</Text></Pressable>}
            </View>
          </Tarjeta>
        );
      })}
    </View>
  ));
}

function Caja({ datos }) {
  const r = datos.resumen || { ingresos: 0, gastos: 0, resultado: 0 };
  const grupos = agruparMovimientos(datos.movimientos);
  return (
    <View>
      <Text style={s.dia}>{etiquetaMes(datos.mes) || 'Este mes'}</Text>
      <View style={s.grilla}>
        <View style={s.celda}><Tarjeta><Text style={[s.valor, { color: C.verde }]} numberOfLines={1} adjustsFontSizeToFit>{pesos(r.ingresos)}</Text><Text style={s.etiqueta}>Ingresos</Text></Tarjeta></View>
        <View style={s.celda}><Tarjeta><Text style={[s.valor, { color: C.rojo }]} numberOfLines={1} adjustsFontSizeToFit>{pesos(r.gastos)}</Text><Text style={s.etiqueta}>Gastos</Text></Tarjeta></View>
        <View style={{ width: '100%', padding: 5 }}><Tarjeta><Text style={[s.valor, { color: r.resultado >= 0 ? C.verde : C.rojo }]} numberOfLines={1} adjustsFontSizeToFit>{(r.resultado < 0 ? '-' : '') + pesos(Math.abs(r.resultado))}</Text><Text style={s.etiqueta}>Resultado del mes</Text></Tarjeta></View>
      </View>
      {!grupos.length && <Tarjeta estilo={{ marginTop: 8 }}><Text style={s.vacioTitulo}>Sin movimientos este mes</Text></Tarjeta>}
      {grupos.map((g) => (
        <View key={g.fecha} style={{ marginTop: 14 }}>
          <Text style={s.dia}>{g.etiqueta}</Text>
          {g.movimientos.map((m, i) => (
            <Tarjeta key={g.fecha + i} estilo={{ marginBottom: 8 }}>
              <View style={s.fila}>
                <Text style={s.principal} numberOfLines={2}>{m.detalle || m.categoria || (m.tipo === 'gasto' ? 'Gasto' : 'Ingreso')}</Text>
                <Text style={[s.monto, { color: m.tipo === 'gasto' ? C.rojo : C.verde }]}>{(m.tipo === 'gasto' ? '-' : '+') + pesos(m.monto)}</Text>
              </View>
              <Text style={s.chico}>{[m.categoria, m.metodo].filter(Boolean).join(' · ')}</Text>
            </Tarjeta>
          ))}
        </View>
      ))}
    </View>
  );
}

function Buscador({ valor, alCambiar, placeholder }) {
  return <TextInput style={s.buscador} placeholder={placeholder} placeholderTextColor={C.apagado} value={valor} onChangeText={alCambiar} autoCorrect={false} autoCapitalize="none" accessibilityLabel={placeholder} />;
}

function Clientes({ datos, busqueda, setBusqueda }) {
  const deudores = datos.deudores || [];
  const lista = filtrarTexto(datos.clientes || [], busqueda, ['nombre', 'telefono']);
  return (
    <View>
      {deudores.length > 0 && (
        <View style={{ marginBottom: 18 }}>
          <Text style={s.dia}>Te deben {pesos(datos.totalDeben)}</Text>
          {deudores.map((d, i) => (
            <Tarjeta key={'d' + i} estilo={{ marginBottom: 8 }}>
              <View style={s.fila}><Text style={s.principal}>{d.nombre || d.telefono || 'Cliente'}</Text><Text style={[s.monto, { color: C.ambar }]}>{pesos(d.saldo)}</Text></View>
              <Text style={s.chico}>{d.dias > 0 ? `Desde hace ${d.dias} ${d.dias === 1 ? 'día' : 'días'}` : 'Reciente'}</Text>
            </Tarjeta>
          ))}
        </View>
      )}
      <Text style={s.dia}>Clientes ({(datos.clientes || []).length})</Text>
      <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar cliente por nombre o teléfono" />
      {lista.length === 0 && <Suave>No hay clientes que coincidan.</Suave>}
      {lista.slice(0, 200).map((c, i) => (
        <Tarjeta key={'c' + i} estilo={{ marginBottom: 8 }}>
          <View style={s.fila}>
            <Text style={s.principal}>{c.nombre || 'Sin nombre'}</Text>
            {!!c.telefono && <Pressable onPress={() => Linking.openURL('tel:' + c.telefono)} accessibilityRole="link" accessibilityLabel={`Llamar a ${c.nombre || 'cliente'}`}><Text style={s.link}>{c.telefono}</Text></Pressable>}
          </View>
        </Tarjeta>
      ))}
      {lista.length > 200 && <Suave>Se muestran los primeros 200. Usá el buscador para encontrar a alguien.</Suave>}
    </View>
  );
}

function Catalogo({ datos, busqueda, setBusqueda }) {
  const lista = filtrarTexto(datos.productos || [], busqueda, ['nombre', 'categoria', 'codigo']);
  return (
    <View>
      <Text style={s.dia}>Productos y servicios ({(datos.productos || []).length})</Text>
      <Buscador valor={busqueda} alCambiar={setBusqueda} placeholder="Buscar producto, categoría o código" />
      {lista.length === 0 && <Suave>No hay productos que coincidan.</Suave>}
      {lista.slice(0, 300).map((p, i) => {
        const st = textoStock(p.stock, p.disponible);
        return (
          <Tarjeta key={'p' + i} estilo={{ marginBottom: 8 }}>
            <View style={s.fila}><Text style={s.principal} numberOfLines={2}>{p.nombre}</Text><Text style={[s.monto, { color: C.texto }]}>{pesos(p.precio)}</Text></View>
            <View style={[s.fila, { marginTop: 6 }]}><Text style={s.chico}>{[p.categoria, p.codigo].filter(Boolean).join(' · ')}</Text><Insignia texto={st.texto} color={TONO[st.tono]} /></View>
          </Tarjeta>
        );
      })}
      {lista.length > 300 && <Suave>Se muestran los primeros 300. Usá el buscador para encontrar uno.</Suave>}
    </View>
  );
}

const s = StyleSheet.create({
  selector: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  opcion: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, marginHorizontal: 3, borderWidth: 1, borderColor: C.borde },
  opcionActiva: { backgroundColor: C.verde, borderColor: C.verde },
  opcionTexto: { color: C.suave, fontSize: 13, fontWeight: '700' },
  contenido: { padding: 20, paddingBottom: 40 },
  vacioTitulo: { color: C.texto, fontSize: 16, fontWeight: '700' },
  pc: { color: C.suave, fontSize: 13, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  dia: { color: C.texto, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hora: { color: C.verde, fontSize: 15, fontWeight: '800' },
  principal: { color: C.texto, fontSize: 15, fontWeight: '700', marginTop: 4, flexShrink: 1, paddingRight: 8 },
  secundario: { color: C.suave, fontSize: 13, marginTop: 2 },
  chico: { color: C.apagado, fontSize: 12 },
  link: { color: C.azul, fontSize: 13, fontWeight: '600' },
  monto: { fontSize: 15, fontWeight: '800' },
  grilla: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 },
  celda: { width: '50%', padding: 5 },
  valor: { fontSize: 22, fontWeight: '800' },
  etiqueta: { color: C.suave, fontSize: 12, marginTop: 4 },
  buscador: { backgroundColor: C.tarjeta, borderColor: C.borde, borderWidth: 1, borderRadius: 12, color: C.texto, paddingHorizontal: 14, height: 46, marginBottom: 12, fontSize: 15 },
  aviso: { color: C.ambar, fontSize: 12, fontWeight: '600', marginTop: 8 },
});
