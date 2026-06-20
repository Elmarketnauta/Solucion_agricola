import { useNavigate } from 'react-router-dom';

export default function Investments() {
  const navigate = useNavigate();
  
  
  return (
    <div className="animate-in p-md">
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          ⬅️ Volver
        </button>
        <h1 className="text-xl font-bold m-0">Yunta Inversiones</h1>
      </header>
      
      <div className="card mb-lg bg-primary text-white border-none">
        <h2 className="text-sm font-medium mb-sm opacity-90">Tu Portafolio Cripto</h2>
        <div className="text-3xl font-bold mb-md">S/ 1,245.50</div>
        <div className="flex items-center gap-sm">
          <span className="badge bg-white text-green-600 border-none font-bold">📈 +12.5%</span>
          <span className="text-xs opacity-80">Últimos 30 días</span>
        </div>
      </div>
      
      <div className="flex justify-between items-center mb-md">
        <h3 className="font-semibold m-0">Criptomonedas Populares</h3>
        <button className="btn btn-secondary btn-sm">Ver todas</button>
      </div>
      
      <div className="flex flex-col gap-sm mb-lg">
        <div className="card flex items-center justify-between p-sm">
          <div className="flex items-center gap-md">
            <div className="text-2xl">₿</div>
            <div>
              <p className="font-semibold m-0">Bitcoin (BTC)</p>
              <p className="text-xs text-gray-500 m-0">S/ 245,000.00</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="badge badge-success mb-xs">+5.2%</span>
            <span className="text-xs text-green-600">〰️↗️〰️</span>
          </div>
        </div>
        
        <div className="card flex items-center justify-between p-sm">
          <div className="flex items-center gap-md">
            <div className="text-2xl">🔷</div>
            <div>
              <p className="font-semibold m-0">Ethereum (ETH)</p>
              <p className="text-xs text-gray-500 m-0">S/ 12,300.00</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="badge badge-success mb-xs">+3.1%</span>
            <span className="text-xs text-green-600">〰️↗️〰️</span>
          </div>
        </div>
        
        <div className="card flex items-center justify-between p-sm">
          <div className="flex items-center gap-md">
            <div className="text-2xl">💵</div>
            <div>
              <p className="font-semibold m-0">Tether (USDT)</p>
              <p className="text-xs text-gray-500 m-0">S/ 3.75</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="badge bg-gray-200 text-gray-700 mb-xs">0.0%</span>
            <span className="text-xs text-gray-400">〰️〰️〰️</span>
          </div>
        </div>
      </div>
      
      <button className="btn btn-primary w-full">Comprar Cripto</button>
    </div>
  );
}
