import { useNavigate } from 'react-router-dom';

export default function FX() {
  const navigate = useNavigate();
  
  
  return (
    <div className="animate-in p-md">
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          ⬅️ Volver
        </button>
        <h1 className="text-xl font-bold m-0">Yunta Tipo de Cambio</h1>
      </header>
      
      <div className="card mb-lg">
        <div className="flex justify-between items-center mb-md">
          <span className="font-semibold">Cotización actual</span>
          <span className="badge badge-success">⏱️ Tasa garantizada 5 min</span>
        </div>
        <p className="text-sm mb-md">1 USD = 3.75 PEN</p>
        
        <div className="flex flex-col gap-sm mb-md">
          <label className="text-sm font-medium">Tienes Soles (PEN)</label>
          <div className="flex items-center gap-sm border rounded-md p-sm">
            <span>🇵🇪</span>
            <input type="number" className="flex-1 border-none outline-none bg-transparent" placeholder="0.00" />
          </div>
        </div>
        
        <div className="flex justify-center mb-md">
          <button className="btn btn-secondary rounded-full p-sm">↕️</button>
        </div>
        
        <div className="flex flex-col gap-sm mb-lg">
          <label className="text-sm font-medium">Recibes Dólares (USD)</label>
          <div className="flex items-center gap-sm border rounded-md p-sm bg-gray-50">
            <span>🇺🇸</span>
            <input type="number" className="flex-1 border-none outline-none bg-transparent" placeholder="0.00" disabled />
          </div>
        </div>
        
        <button className="btn btn-primary w-full">Cambiar ahora</button>
      </div>
      
      <div>
        <h2 className="text-lg font-semibold mb-md">Historial reciente</h2>
        <div className="flex flex-col gap-md">
          <div className="card flex justify-between items-center p-sm">
            <div className="flex items-center gap-sm">
              <span>🔄</span>
              <div>
                <p className="font-medium text-sm m-0">Compra USD</p>
                <p className="text-xs text-gray-500 m-0">Hoy, 10:30 AM</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-medium text-sm m-0 text-green-600">+ $100.00</p>
              <p className="text-xs text-gray-500 m-0">- S/ 375.00</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
