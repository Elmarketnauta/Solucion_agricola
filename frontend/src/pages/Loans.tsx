import { useNavigate } from 'react-router-dom';

export default function Loans() {
  const navigate = useNavigate();
  
  const score = 650; // Mocked score
  const isGoodScore = score > 500;

  return (
    <div className="animate-in p-md">
      <header className="flex items-center gap-md mb-lg">
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          ⬅️ Volver
        </button>
        <h1 className="text-xl font-bold m-0">Préstamos Yunta</h1>
      </header>
      
      <div className="card mb-lg">
        <h2 className="text-lg font-semibold mb-sm">Tu Score Crediticio Yunta</h2>
        <div className="flex items-center gap-md mb-md">
          <div className="text-3xl font-bold">{score}</div>
          <div className="flex-1 bg-gray-200 h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full w-2/3"></div>
          </div>
        </div>
        {isGoodScore ? (
          <div className="bg-green-50 p-md rounded-md border border-green-200">
            <div className="flex items-center gap-sm mb-sm">
              <span>🎉</span>
              <h3 className="font-semibold text-green-800 m-0">¡Tienes un préstamo pre-aprobado!</h3>
            </div>
            <p className="text-sm mb-md text-green-700">Monto disponible: S/ 5,000.00</p>
            <button className="btn btn-primary w-full">Desembolsar a mi billetera</button>
          </div>
        ) : (
          <div className="bg-orange-50 p-md rounded-md border border-orange-200">
            <div className="flex items-center gap-sm mb-sm">
              <span>📈</span>
              <h3 className="font-semibold text-orange-800 m-0">Sigue mejorando tu score</h3>
            </div>
            <p className="text-sm text-orange-700">Te falta un poco para desbloquear tu primer préstamo. Sigue usando Yunta.</p>
          </div>
        )}
      </div>
    </div>
  );
}
