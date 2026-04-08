// PreLanzamiento.jsx — Pantalla de cuenta regresiva para usuarios registrados
// Se muestra a todos los usuarios que NO son admin ni tester hasta el día de lanzamiento.
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Rocket, Star, Zap, Shield, Clock, CheckCircle, Users, Gift, Lock,
} from 'lucide-react';

// ── FECHA DE LANZAMIENTO — ajustar aquí cuando llegue el día ──
// Formato: 'YYYY-MM-DDTHH:MM:SS-03:00' (hora Argentina UTC-3)
export const LAUNCH_DATE = new Date('2026-05-05T00:00:00-03:00');

// Cupos de preventa (actualizar manualmente conforme avanzan)
const CUPOS_TOTALES = 100;
const CUPOS_TOMADOS = 47;

// ── Hook: cuenta regresiva ────────────────────────────────────
function useCountdown(target) {
  const calc = () => {
    const diff = Math.max(0, target.getTime() - Date.now());
    return {
      dias:     Math.floor(diff / 86_400_000),
      horas:    Math.floor((diff % 86_400_000) / 3_600_000),
      minutos:  Math.floor((diff % 3_600_000) / 60_000),
      segundos: Math.floor((diff % 60_000) / 1_000),
      lanzado:  diff === 0,
    };
  };
  const [t, setT] = useState(calc);
  useEffect(() => {
    const iv = setInterval(() => setT(calc()), 1_000);
    return () => clearInterval(iv);
  }, []);
  return t;
}

// ── Caja de número del cronómetro ────────────────────────────
function TimeBox({ valor, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{
        background: 'rgba(0,232,123,0.07)',
        border: '1px solid rgba(0,232,123,0.22)',
        borderRadius: '16px',
        padding: '18px 22px',
        minWidth: '76px',
        textAlign: 'center',
      }}>
        <span style={{
          fontFamily: '"Courier New", monospace',
          fontSize: 'clamp(36px, 7vw, 52px)',
          fontWeight: '800',
          color: '#00e87b',
          lineHeight: 1,
          display: 'block',
        }}>
          {String(valor).padStart(2, '0')}
        </span>
      </div>
      <span style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
        {label}
      </span>
    </div>
  );
}

// ── Separador del cronómetro ─────────────────────────────────
function Sep() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', paddingBottom: '28px' }}>
      <span style={{ fontSize: '38px', fontWeight: '700', color: 'rgba(0,232,123,0.3)', lineHeight: 1 }}>:</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function PreLanzamiento() {
  const { user, logout } = useAuth();
  const { dias, horas, minutos, segundos, lanzado } = useCountdown(LAUNCH_DATE);
  const cuposLibres   = CUPOS_TOTALES - CUPOS_TOMADOS;
  const pctOcupado    = Math.round((CUPOS_TOMADOS / CUPOS_TOTALES) * 100);

  const beneficios = [
    { icon: <Zap size={15} />,          text: 'Acceso inmediato el día de lanzamiento' },
    { icon: <Gift size={15} />,          text: '20% de descuento garantizado en tu plan' },
    { icon: <Clock size={15} />,         text: 'Prioridad en soporte y onboarding' },
    { icon: <CheckCircle size={15} />,   text: 'Sin permanencia mínima, cancelás cuando quieras' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>

      {/* ── Navbar mínimo ─── */}
      <header style={{
        padding: '20px 32px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '34px', height: '34px',
            background: 'rgba(0,232,123,0.1)',
            border: '1px solid rgba(0,232,123,0.2)',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00e87b" strokeWidth="2.2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span style={{ fontWeight: '700', fontSize: '17px', color: 'var(--text)' }}>
            Akira <span style={{ color: '#00e87b' }}>Cloud</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {user && (
            <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
              {user.nombre || user.email}
            </span>
          )}
          <button
            onClick={logout}
            style={{ fontSize: '12px', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* ── Contenido principal ─── */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px 80px', textAlign: 'center' }}>

        {/* Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          background: 'rgba(0,232,123,0.08)', border: '1px solid rgba(0,232,123,0.2)',
          borderRadius: '100px', padding: '6px 18px', marginBottom: '28px',
        }}>
          <Rocket size={14} color="#00e87b" />
          <span style={{ fontSize: '12px', color: '#00e87b', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Preventa exclusiva · Early Adopter
          </span>
        </div>

        {/* Título */}
        <h1 style={{
          fontSize: 'clamp(30px, 6vw, 54px)',
          fontWeight: '800',
          color: 'var(--text)',
          lineHeight: 1.15,
          marginBottom: '16px',
          maxWidth: '700px',
        }}>
          {lanzado ? '🚀 ¡Akira Cloud ya está disponible!' : 'El lanzamiento oficial se acerca'}
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--muted)', maxWidth: '480px', marginBottom: '52px', lineHeight: 1.6 }}>
          {lanzado
            ? 'Gracias por esperar. Tu cuenta con 20% de descuento ya está activada.'
            : 'Tu lugar ya está reservado. Cuando lancemos, tu descuento del 20% se aplica automáticamente — sin hacer nada.'}
        </p>

        {/* ── Cronómetro ── */}
        {!lanzado && (
          <>
            <p style={{ fontSize: '13px', color: 'var(--muted)', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Tiempo para el lanzamiento
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'flex-start', marginBottom: '64px', flexWrap: 'wrap' }}>
              <TimeBox valor={dias}     label="Días" />
              <Sep />
              <TimeBox valor={horas}   label="Horas" />
              <Sep />
              <TimeBox valor={minutos}  label="Minutos" />
              <Sep />
              <TimeBox valor={segundos} label="Segundos" />
            </div>
          </>
        )}

        {/* ── Tarjeta de oferta ── */}
        <div style={{
          width: '100%', maxWidth: '720px',
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '24px',
          padding: 'clamp(28px, 5vw, 48px)',
          textAlign: 'left',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: '32px',
        }}>
          {/* Glow decorativo */}
          <div style={{
            position: 'absolute', top: '-80px', right: '-80px',
            width: '240px', height: '240px',
            background: 'radial-gradient(circle, rgba(0,232,123,0.07) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Header de la oferta */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '24px', marginBottom: '32px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '10px' }}>
                <Star size={15} color="#f59e0b" fill="#f59e0b" />
                <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Oferta Early Adopter
                </span>
              </div>
              <h2 style={{ fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: '800', color: 'var(--text)', lineHeight: 1.2, marginBottom: '8px' }}>
                20% de descuento<br />en tu primer mes
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--muted)', maxWidth: '360px', lineHeight: 1.6 }}>
                Solo para los primeros {CUPOS_TOTALES} usuarios. Ya tenés tu cupo reservado — no necesitás hacer nada más.
              </p>
            </div>

            {/* Cupos disponibles */}
            <div style={{
              textAlign: 'center',
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: '18px',
              padding: '22px 28px',
              flexShrink: 0,
            }}>
              <div style={{ fontSize: 'clamp(32px, 6vw, 44px)', fontWeight: '800', color: '#f59e0b', lineHeight: 1 }}>
                {cuposLibres}
              </div>
              <div style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px', fontWeight: '600' }}>cupos libres</div>
              <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>de {CUPOS_TOTALES} totales</div>
            </div>
          </div>

          {/* Barra de progreso cupos */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--text)' }}>{CUPOS_TOMADOS}</strong> personas ya reservaron su lugar
              </span>
              <span style={{ fontSize: '13px', color: 'var(--muted)' }}>{pctOcupado}%</span>
            </div>
            <div style={{ height: '8px', background: 'var(--border)', borderRadius: '100px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${pctOcupado}%`,
                background: 'linear-gradient(90deg, #00e87b, #00c060)',
                borderRadius: '100px',
              }} />
            </div>
          </div>

          {/* Beneficios */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '14px',
          }}>
            {beneficios.map((b, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#00e87b', flexShrink: 0 }}>{b.icon}</span>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{b.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Qué va a tener Akira ── */}
        <div style={{
          width: '100%', maxWidth: '720px',
          background: 'rgba(0,232,123,0.04)',
          border: '1px solid rgba(0,232,123,0.12)',
          borderRadius: '20px',
          padding: '32px',
          textAlign: 'left',
          marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Lock size={15} color="#00e87b" />
            <span style={{ fontSize: '13px', color: '#00e87b', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Lo que desbloqueás al lanzar
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}>
            {[
              '🤖 Bot de WhatsApp con IA',
              '📅 Agenda automática de turnos',
              '💳 Cobros con Mercado Pago',
              '📊 Dashboard de métricas',
              '🏠 Soporte alojamiento y servicios',
              '🎙️ Respuestas por audio',
              '🔔 Notificaciones automáticas',
              '🗓️ Integración Google Calendar',
            ].map((feat, i) => (
              <div key={i} style={{ fontSize: '14px', color: 'var(--text-secondary)', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                {feat}
              </div>
            ))}
          </div>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--muted)' }}>
          ¿Preguntas? Escribinos a{' '}
          <a href="mailto:hola@akirachat.com" style={{ color: '#00e87b', textDecoration: 'none', fontWeight: '600' }}>
            hola@akirachat.com
          </a>
        </p>
      </main>
    </div>
  );
}
