import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';

export default function Register() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ businessName: '', ownerName: '', phoneNumber: '' });
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\+51\d{9}$/.test(form.phoneNumber)) {
      setError('Formato: +51XXXXXXXXX');
      return;
    }
    setStep(2);
  };

  const handlePinKey = (key: string) => {
    if (key === 'delete') {
      setPin(p => p.slice(0, -1));
    } else if (pin.length < 4) {
      const newPin = pin + key;
      setPin(newPin);
      if (newPin.length === 4) {
        handleRegister(newPin);
      }
    }
  };

  const handleRegister = async (userPin: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.register({ ...form, pin: userPin });
      login(data.merchant);
      showToast('¡Cuenta creada exitosamente!', 'success');
      setStep(3);
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (err: any) {
      setError(err.message);
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`auth-page ${step === 1 ? 'login-page' : ''}`}>
      {step === 1 ? (
        <>
          {/* Hero — step 1 only: first impression matters */}
          <div className="login-hero">
            <div className="login-hero-content">
              <div className="login-hero-logo">YUNTA</div>
              <div className="login-hero-tagline">Abre tu negocio al mundo digital</div>
              <div className="login-hero-metric">✓ Registro gratuito · Sin comisiones el primer mes</div>
            </div>
            <svg className="login-hero-wave" viewBox="0 0 480 48" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <path d="M0,32 C80,48 160,8 240,32 C320,56 400,8 480,32 L480,48 L0,48 Z" fill="var(--bg-primary)"/>
            </svg>
          </div>

          <div className="login-form-section animate-in">
            <h2 className="login-form-title">Crea tu cuenta</h2>
            <div className="steps">
              <div className="step-dot active" />
              <div className="step-dot" />
              <div className="step-dot" />
            </div>
            <form className="auth-form" onSubmit={handleStep1}>
              <div className="input-group">
                <label className="input-label" htmlFor="biz">Nombre del negocio</label>
                <input id="biz" type="text" className="input-field" value={form.businessName}
                  onChange={e => setForm({...form, businessName: e.target.value})} placeholder="Ej. Bodega Doña Rosa" required />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="owner">Tu nombre</label>
                <input id="owner" type="text" className="input-field" value={form.ownerName}
                  onChange={e => setForm({...form, ownerName: e.target.value})} placeholder="Ej. Rosa Pérez" required />
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="regphone">Número de celular</label>
                <input id="regphone" type="tel" className={`input-field ${error ? 'input-error' : ''}`} value={form.phoneNumber}
                  onChange={e => setForm({...form, phoneNumber: e.target.value})} placeholder="+51999888777" required />
                {error && <p className="input-error-text">{error}</p>}
              </div>
              <button type="submit" className="btn btn-primary btn-lg">Continuar</button>
            </form>
            <div className="auth-footer">
              <span>¿Ya tienes cuenta? </span>
              <Link to="/login">Ingresa aquí</Link>
            </div>
          </div>
        </>
      ) : (
        /* Steps 2 & 3: centered layout — hero removed to keep focus on PIN */
        <div className="auth-container animate-in">
          <h1 className="auth-logo">YUNTA</h1>
          <div className="steps">
            <div className="step-dot done" />
            <div className={`step-dot ${step >= 2 ? (step > 2 ? 'done' : 'active') : ''}`} />
            <div className={`step-dot ${step >= 3 ? 'active' : ''}`} />
          </div>

          {step === 2 && (
            <div className="animate-in">
              <h3 className="text-center mb-lg">Crea tu PIN de 4 dígitos</h3>
              <p className="text-muted text-center mb-lg">Este PIN protegerá tu billetera</p>
              <div className="pin-container">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''} ${i === pin.length ? 'active' : ''}`}>
                    {i < pin.length ? '●' : ''}
                  </div>
                ))}
              </div>
              {error && <p className="text-error text-center mb-md animate-shake">{error}</p>}
              {loading && <p className="text-muted text-center mb-md">Creando tu cuenta...</p>}
              <div className="pin-keypad">
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((key, i) => (
                  <button key={i}
                    className={`pin-key ${key === '' ? 'pin-key-empty' : ''} ${key === '⌫' ? 'pin-key-delete' : ''}`}
                    onClick={() => key === '⌫' ? handlePinKey('delete') : key !== '' && handlePinKey(key)}
                    disabled={loading || key === ''} type="button">{key}</button>
                ))}
              </div>
              <button className="btn btn-ghost mt-lg" onClick={() => { setStep(1); setPin(''); setError(''); }}>Volver</button>
            </div>
          )}

          {step === 3 && (
            <div className="result-page animate-in">
              <div className="result-icon result-icon-success">🎉</div>
              <h2>¡Bienvenido a Yunta!</h2>
              <p className="text-muted mt-md">Tu billetera está lista. Redirigiendo...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
