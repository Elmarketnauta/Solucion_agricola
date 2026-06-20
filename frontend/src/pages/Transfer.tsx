import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useFormatter } from '../hooks';
import { api } from '../lib/api';
import PinModal from '../components/PinModal';

export default function Transfer() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { formatAmount, formatPhone } = useFormatter();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [recipient, setRecipient] = useState<{businessName: string; ownerName: string} | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  // Stable idempotency key per transfer intent — generated when the user reaches
  // the confirm step, reused across PIN retries and double-taps.
  const idempotencyKey = useRef<string>('');

  const handleValidateRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.validateRecipient(phone);
      setRecipient(data);
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Destinatario no encontrado');
    } finally {
      setLoading(false);
    }
  };

  const handleAmountSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0.10) {
      setError('El monto mínimo es S/ 0.10');
      return;
    }
    if (numAmount > 10000) {
      setError('El monto máximo es S/ 10,000.00');
      return;
    }
    setError('');
    idempotencyKey.current = crypto.randomUUID(); // one key per confirmed intent
    setStep(3);
  };

  const handleConfirm = () => setShowPin(true);

  const handlePinSubmit = async (pin: string) => {
    setPinError('');
    setPinLoading(true);
    try {
      const data = await api.transfer({ receiverPhone: phone, amount: parseFloat(amount), pin }, idempotencyKey.current);
      setResult(data);
      setShowPin(false);
      setStep(4);
      showToast('¡Transferencia exitosa!', 'success');
    } catch (err: any) {
      setPinError(err.message || 'Error al transferir');
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="animate-in">
      {step < 4 && (
        <>
          <div className="page-header">
            <button className="page-back" onClick={() => step > 1 ? setStep(step - 1) : navigate('/dashboard')}>←</button>
            <span className="page-title">Enviar dinero</span>
          </div>
          <div className="steps">
            <div className={`step-dot ${step >= 1 ? (step > 1 ? 'done' : 'active') : ''}`} />
            <div className={`step-dot ${step >= 2 ? (step > 2 ? 'done' : 'active') : ''}`} />
            <div className={`step-dot ${step >= 3 ? 'active' : ''}`} />
          </div>
        </>
      )}

      {step === 1 && (
        <form onSubmit={handleValidateRecipient}>
          <div className="input-group mb-lg">
            <label className="input-label" htmlFor="dest">Número destino</label>
            <input id="dest" type="tel" className={`input-field ${error ? 'input-error' : ''}`}
              value={phone} onChange={e => setPhone(e.target.value)} placeholder="+51999888777" required />
            {error && <p className="input-error-text">{error}</p>}
          </div>
          <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
            {loading ? 'Buscando...' : 'Continuar'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleAmountSubmit}>
          {recipient && (
            <div className="transfer-recipient">
              <div className="transfer-recipient-avatar">{recipient.ownerName.charAt(0)}</div>
              <div>
                <div className="tx-title">{recipient.businessName}</div>
                <div className="tx-subtitle">{phone}</div>
              </div>
            </div>
          )}
          <div className="transfer-amount-display">
            <div className="transfer-currency">S/</div>
            <input type="number" step="0.01" min="0.10" max="10000" className="input-field input-lg"
              value={amount} onChange={e => { setAmount(e.target.value); setError(''); }} placeholder="0.00" required autoFocus />
            {error && <p className="input-error-text mt-md">{error}</p>}
          </div>
          <button type="submit" className="btn btn-primary btn-lg">Continuar</button>
        </form>
      )}

      {step === 3 && (
        <div>
          <div className="card mb-lg">
            <p className="text-muted mb-md">Confirma los datos</p>
            <div className="transfer-recipient">
              <div className="transfer-recipient-avatar">{recipient?.ownerName.charAt(0)}</div>
              <div>
                <div className="tx-title">{recipient?.businessName}</div>
                <div className="tx-subtitle">{phone}</div>
              </div>
            </div>
            <div className="transfer-amount-display">
              <div className="transfer-currency">Enviarás</div>
              <div className="transfer-value">S/ {formatAmount(parseFloat(amount))}</div>
            </div>
          </div>
          <button className="btn btn-primary btn-lg" onClick={handleConfirm}>Confirmar envío</button>
          <button className="btn btn-ghost mt-md" onClick={() => setStep(2)}>Editar monto</button>
        </div>
      )}

      {step === 4 && result && (
        <div className="result-page">
          <div className="result-icon result-icon-success">✅</div>
          <h2>¡Envío exitoso!</h2>
          <div className="result-amount">S/ {formatAmount(result.amount)}</div>
          <p className="result-detail">Enviado a {recipient?.businessName || formatPhone(result.receiverPhone)}</p>
          <p className="result-detail mt-md">Nuevo saldo: S/ {formatAmount(result.newBalance)}</p>
          <button className="btn btn-primary btn-lg mt-xl" onClick={() => navigate('/dashboard')}>Volver al inicio</button>
        </div>
      )}

      {showPin && (
        <PinModal title="Confirma con tu PIN" onSubmit={handlePinSubmit}
          onCancel={() => { setShowPin(false); setPinError(''); }} error={pinError} loading={pinLoading} />
      )}
    </div>
  );
}
