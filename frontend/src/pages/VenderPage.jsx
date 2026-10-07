import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import VentaRapida from '../components/VentaRapida';
import api from '../services/api';
import { pesos } from '../utils/archivos';
import { ShoppingCart, Plus, Loader2 } from 'lucide-react';

// Mostrador: la venta rápida a pantalla completa (la usan también los empleados, que no ven la Caja).
export default function VenderPage() {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState(null);
  const cargar = useCallback(() => api.get('/app/ventas').then((r) => setDatos(r.data)).catch(() => setDatos({ productos: [], recientes: [] })), []);
  useEffect(() => { cargar(); }, [cargar]);

  return (
    <Layout>
      <div className="max-w-3xl mx-auto space-y-4 animate-page-in">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <h1 className="text-2xl font-bold text-white">Vender</h1>
            <p className="text-sm text-gray-500">Venta de mostrador: tocá los productos (o escaneá el código de barras), elegí cómo pagó y cobrá.</p>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => setAbierto(true)}><Plus size={16} /> Nueva venta</button>
        </div>

        {!datos ? <div className="flex justify-center py-16"><Loader2 className="animate-spin text-gray-500" /></div> : (
          <div className="card">
            <p className="text-sm font-medium text-white mb-2 flex items-center gap-2"><ShoppingCart size={15} className="text-[var(--accent)]" /> Últimas ventas</p>
            {datos.recientes.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">Todavía no hiciste ventas. Tocá “Nueva venta” para empezar.</p> : (
              <div className="space-y-1">{datos.recientes.map((v) => (
                <div key={v._id} className="flex items-center gap-3 rounded-md bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="text-gray-500 w-12">{v.fecha.slice(8, 10)}/{v.fecha.slice(5, 7)}</span>
                  <span className="flex-1 truncate text-gray-200">{v.descripcion.replace(/^Venta: /, '')}</span>
                  <span className="text-xs text-gray-500 capitalize">{v.metodo}</span>
                  <span className="text-white font-medium w-24 text-right">{pesos(v.monto)}</span>
                </div>))}</div>
            )}
          </div>
        )}
      </div>
      {abierto && <VentaRapida onClose={() => { setAbierto(false); cargar(); }} onVendido={cargar} />}
    </Layout>
  );
}
