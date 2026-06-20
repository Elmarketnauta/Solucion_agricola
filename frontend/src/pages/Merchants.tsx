import { useNavigate } from 'react-router-dom';

export default function Merchants() {
  const navigate = useNavigate();
  
  
  return (
    <div className="animate-in p-md">
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          ⬅️ Volver
        </button>
        <h1 className="text-xl font-bold m-0">Yunta Comercios</h1>
      </header>
      
      <div className="mb-md">
        <div className="flex items-center gap-sm border rounded-md p-sm bg-white">
          <span>🔍</span>
          <input type="text" className="flex-1 border-none outline-none bg-transparent" placeholder="Buscar descuentos..." />
        </div>
      </div>
      
      <div className="flex gap-sm overflow-x-auto pb-sm mb-md scrollbar-hide">
        <button className="btn btn-primary whitespace-nowrap px-md py-sm rounded-full">Todos</button>
        <button className="btn btn-secondary whitespace-nowrap px-md py-sm rounded-full bg-white">Farmacias</button>
        <button className="btn btn-secondary whitespace-nowrap px-md py-sm rounded-full bg-white">Mayoristas</button>
        <button className="btn btn-secondary whitespace-nowrap px-md py-sm rounded-full bg-white">Restaurantes</button>
      </div>
      
      <div className="flex flex-col gap-md mb-lg">
        <div className="card border-l-4 border-l-primary">
          <div className="flex justify-between items-start mb-sm">
            <div>
              <span className="badge badge-success mb-xs">15% OFF</span>
              <h3 className="font-semibold m-0">Distribuidora El Sol</h3>
            </div>
            <span className="text-2xl">🏪</span>
          </div>
          <p className="text-sm text-gray-600 mb-md">15% de descuento en abarrotes pagando con Yunta.</p>
          <button className="btn btn-secondary w-full text-sm">Generar mi código de descuento</button>
        </div>
        
        <div className="card border-l-4 border-l-primary">
          <div className="flex justify-between items-start mb-sm">
            <div>
              <span className="badge badge-success mb-xs">20% OFF</span>
              <h3 className="font-semibold m-0">Inkafarma</h3>
            </div>
            <span className="text-2xl">💊</span>
          </div>
          <p className="text-sm text-gray-600 mb-md">20% de descuento en vitaminas y cuidado personal.</p>
          <button className="btn btn-secondary w-full text-sm">Generar mi código de descuento</button>
        </div>
      </div>
    </div>
  );
}
