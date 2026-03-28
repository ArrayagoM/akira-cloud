import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// ── Error Boundary global — captura crashes silenciosos ───────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh', background: '#070c12', color: '#e8f0f8',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '2rem', textAlign: 'center',
        }}>
          <div style={{
            background: '#0e1520', border: '1px solid rgba(244,63,94,0.3)',
            borderRadius: 16, padding: '2rem', maxWidth: 600, width: '100%',
          }}>
            <p style={{ color: '#f43f5e', fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
              ⚠ Error al cargar la página
            </p>
            <pre style={{
              background: '#141e2c', borderRadius: 8, padding: '1rem',
              fontSize: 12, color: '#f87171', textAlign: 'left',
              overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack?.split('\n').slice(0, 8).join('\n')}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16, background: '#00e87b', color: '#020f08',
                border: 'none', borderRadius: 8, padding: '8px 20px',
                cursor: 'pointer', fontWeight: 700,
              }}>
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1a1a1a',
            color: '#e4e4e4',
            border: '1px solid #2a2a2a',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#22c55e', secondary: '#1a1a1a' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#1a1a1a' } },
        }}
      />
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
