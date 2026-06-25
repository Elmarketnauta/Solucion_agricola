// Developed by Marketnauta
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import PinModal from '../components/PinModal';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\+51\d{9}$/.test(phone)) {
      setError('Ingresa un número válido: +51XXXXXXXXX');
      return;
    }
    setShowPin(true);
  };

  const handlePinSubmit = async (pin: string) => {
    setPinError('');
    setPinLoading(true);
    try {
      const data = await api.login({ phoneNumber: phone, pin });
      login(data.merchant);
      showToast(`¡Bienvenido, ${data.merchant.ownerName}!`, 'success');
      navigate('/dashboard');
    } catch (err: any) {
      setPinError(err.message || 'PIN incorrecto');
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="auth-page login-page">
      {/* Hero — brand identity + social proof */}
      <div className="login-hero">
        <div className="login-hero-content">
          <div className="login-hero-logo">YUNTA</div>
          <div className="login-hero-tagline">Tu socio en cada venta</div>
          <div className="login-hero-metric">✓ +50,000 negocios activos en el Perú</div>
        </div>
        <svg className="login-hero-wave" viewBox="0 0 480 48" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          <path d="M0,32 C80,48 160,8 240,32 C320,56 400,8 480,32 L480,48 L0,48 Z" fill="var(--bg-primary)"/>
        </svg>
      </div>

      {/* Form section */}
      <div className="login-form-section animate-in">
        <h2 className="login-form-title">Ingresa a tu cuenta</h2>

        <form className="auth-form" onSubmit={handlePhoneSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="phone">Número de celular</label>
            <input
              id="phone"
              type="tel"
              className={`input-field ${error ? 'input-error' : ''}`}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+51999888777"
              required
              autoComplete="tel"
            />
            {error && <p className="input-error-text animate-shake">{error}</p>}
          </div>
          <button type="submit" className="btn btn-primary btn-lg">Ingresar</button>
        </form>

        <div className="auth-footer">
          <span>¿No tienes cuenta? </span>
          <Link to="/register">Regístrate aquí</Link>
        </div>
      </div>

      {showPin && (
        <PinModal
          title="Ingresa tu PIN"
          onSubmit={handlePinSubmit}
          onCancel={() => { setShowPin(false); setPinError(''); }}
          error={pinError}
          loading={pinLoading}
        />
      )}
    </div>
  );
}
