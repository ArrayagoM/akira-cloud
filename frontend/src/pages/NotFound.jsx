import { Link } from 'react-router-dom';
import { Bot } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center text-center px-4">
      <div>
        <Bot size={52} className="text-gray-700 mx-auto mb-4" />
        <h1 className="text-6xl font-extrabold text-gray-700 mb-3">404</h1>
        <p className="text-gray-500 mb-8">Página no encontrada.</p>
        <Link to="/" className="btn-primary">Volver al inicio</Link>
      </div>
    </div>
  );
}
