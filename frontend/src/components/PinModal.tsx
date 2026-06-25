// Developed by Marketnauta
import { useState, useCallback } from 'react';

interface PinModalProps {
  title?: string;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
  error?: string;
  loading?: boolean;
}

export default function PinModal({ title = 'Ingresa tu PIN', onSubmit, onCancel, error, loading }: PinModalProps) {
  const [pin, setPin] = useState('');

  const handleKey = useCallback((key: string) => {
    if (key === 'delete') {
      setPin(p => p.slice(0, -1));
    } else if (pin.length < 4) {
      const newPin = pin + key;
      setPin(newPin);
      if (newPin.length === 4) {
        setTimeout(() => onSubmit(newPin), 200);
      }
    }
  }, [pin, onSubmit]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <h3 className="text-center mb-lg">{title}</h3>

        <div className="pin-container">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''} ${i === pin.length ? 'active' : ''}`}>
              {i < pin.length ? '●' : ''}
            </div>
          ))}
        </div>

        {error && <p className={`text-error text-center mb-md ${error ? 'animate-shake' : ''}`}>{error}</p>}
        {loading && <p className="text-muted text-center mb-md">Verificando...</p>}

        <div className="pin-keypad">
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
            <button
              key={i}
              className={`pin-key ${key === '' ? 'pin-key-empty' : ''} ${key === '⌫' ? 'pin-key-delete' : ''}`}
              onClick={() => key === '⌫' ? handleKey('delete') : key !== '' && handleKey(key)}
              disabled={loading || key === ''}
              type="button"
            >
              {key}
            </button>
          ))}
        </div>

        <button className="btn btn-ghost mt-lg" onClick={onCancel} type="button">Cancelar</button>
      </div>
    </div>
  );
}
