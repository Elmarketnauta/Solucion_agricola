// Developed by Marketnauta
import { useNavigate } from 'react-router-dom';

export default function Insurance() {
  const navigate = useNavigate();
  
  
  return (
    <div className="animate-in p-md">
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          ⬅️ Volver
        </button>
        <h1 className="text-xl font-bold m-0">Seguros Yunta</h1>
      </header>
      
      <p className="mb-lg text-gray-600">🛡️ Protección para ti y tu negocio.</p>
      
      <div className="flex flex-col gap-md">
        <div className="card">
          <div className="flex items-start gap-md mb-md">
            <div className="text-3xl">❤️</div>
            <div>
              <h3 className="font-semibold m-0">Seguro de Vida Yunta</h3>
              <p className="text-sm text-gray-500 m-0">S/ 5/mes</p>
              <p className="text-sm mt-sm">Protege el futuro de tu familia con nuestra cobertura básica.</p>
            </div>
          </div>
          <button className="btn btn-primary w-full">Ver más</button>
        </div>
        
        <div className="card">
          <div className="flex items-start gap-md mb-md">
            <div className="text-3xl">🏪</div>
            <div>
              <h3 className="font-semibold m-0">Protección de Negocio</h3>
              <p className="text-sm text-gray-500 m-0">Desde S/ 15/mes</p>
              <p className="text-sm mt-sm">Asegura tu mercadería e instalaciones contra robos e incendios.</p>
            </div>
          </div>
          <button className="btn btn-primary w-full">Afiliarme</button>
        </div>
        
        <div className="card">
          <div className="flex items-start gap-md mb-md">
            <div className="text-3xl">⚕️</div>
            <div>
              <h3 className="font-semibold m-0">Seguro de Salud</h3>
              <p className="text-sm text-gray-500 m-0">Desde S/ 20/mes</p>
              <p className="text-sm mt-sm">Cobertura en consultas médicas y emergencias a nivel nacional.</p>
            </div>
          </div>
          <button className="btn btn-primary w-full">Ver más</button>
        </div>
      </div>
    </div>
  );
}
