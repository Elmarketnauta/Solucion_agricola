import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useDashboardData, useFormatter } from '../hooks';
import { useEffect, useState } from 'react';

const AVATAR_COLORS = ['#0F7A5A', '#7E22CE', '#0066FF', '#D9532C', '#E65100'];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, transactions, loading, error, refetch } = useDashboardData(5);
  const { formatAmount, formatDateTime, formatPhone } = useFormatter();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isBalanceVisible, setIsBalanceVisible] = useState(true);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  // Full skeleton only on first load with no cached data.
  if (loading && !data) {
    return (
      <div className="animate-fade">
        <div className="card mb-lg">
          <div className="skeleton skeleton-text mb-md" />
          <div className="skeleton skeleton-amount mb-lg" />
          <div className="flex gap-sm">
            <div className="skeleton skeleton-btn" style={{ flex: 1, height: '48px' }} />
            <div className="skeleton skeleton-btn" style={{ flex: 1, height: '48px' }} />
          </div>
        </div>
      </div>
    );
  }

  // No cache and hard error: show actionable error screen (not just emoji).
  if (!data) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📡</div>
        <p className="text-muted">No se pudo conectar al servidor</p>
        <button className="btn btn-primary mt-lg" onClick={refetch}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="animate-in">
      {/* Offline / error banner — shows over stale data, never hides balance */}
      {(!isOnline || error) && (
        <div className="offline-banner" role="alert">
          <span>{!isOnline ? '📡 Sin conexión — mostrando último dato guardado' : `⚠️ ${error}`}</span>
          {isOnline && (
            <button className="offline-retry" onClick={refetch}>Reintentar</button>
          )}
        </div>
      )}

      {/* Greeting */}
      <div className="greeting-row">
        <div
          className="greeting-avatar"
          style={{ background: AVATAR_COLORS[data.ownerName.charCodeAt(0) % AVATAR_COLORS.length] }}
        >
          {data.ownerName.charAt(0).toUpperCase()}
        </div>
        <div className="greeting-text">
          <div className="greeting-saludo">{getGreeting()},</div>
          <div className="greeting-name">{data.ownerName.split(' ')[0]} 👋</div>
        </div>
      </div>

      {/* Hero Balance Card — Main Focus */}
      <div className="balance-card mb-xl">
        <div className="balance-label-row">
          <div className="balance-label">Tu saldo disponible</div>
          <button
            className="balance-toggle"
            onClick={() => setIsBalanceVisible(v => !v)}
            aria-label={isBalanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
          >
            <span style={{ opacity: isBalanceVisible ? 1 : 0.4 }}>👁</span>
          </button>
        </div>
        <div key={`bal-${isBalanceVisible}`} className={`balance-amount ${isBalanceVisible ? 'balance-amount-visible' : 'balance-amount-hidden'}`}>
          {isBalanceVisible ? `S/ ${formatAmount(data.balance)}` : 'S/ •••••'}
        </div>
        <div className="balance-actions">
          <button
            className="balance-btn"
            onClick={() => navigate('/transfer')}
            aria-label="Enviar dinero"
          >
            💸 Enviar
          </button>
          <button
            className="balance-btn"
            onClick={() => alert('QR — Próximamente')}
            aria-label="Cobrar con QR"
          >
            ⬡ Cobrar
          </button>
        </div>
      </div>

      {/* Recent Transactions — Secondary Focus */}
      {transactions.length > 0 && (
        <div className="section mb-xl">
          <div className="section-header">
            <h3 className="section-title">Últimas transacciones</h3>
            <button
              className="section-link"
              onClick={() => navigate('/transactions')}
              aria-label="Ver todas las transacciones"
            >
              Ver todo →
            </button>
          </div>

          <div className="card">
            <div className="tx-list">
              {transactions.map(tx => {
                const isIn = tx.receiverPhone === user?.phoneNumber;
                return (
                  <div key={tx.id} className="tx-item">
                    <div className={`tx-icon ${isIn ? 'tx-icon-in' : 'tx-icon-out'}`}>
                      {isIn ? '↓' : '↑'}
                    </div>
                    <div className="tx-details">
                      <div className="tx-title">
                        {isIn
                          ? `Cobro de ${tx.senderName || formatPhone(tx.senderPhone) || tx.interoperableSource || '—'}`
                          : `Envío a ${tx.receiverName || formatPhone(tx.receiverPhone) || '—'}`}
                      </div>
                      <div className="tx-subtitle">{formatDateTime(tx.createdAt)}</div>
                    </div>
                    <div className="tx-amount">
                      <div className={`tx-amount-value ${isIn ? 'tx-amount-in' : 'tx-amount-out'}`}>
                        {isIn ? '+' : '-'} S/ {formatAmount(tx.amount)}
                      </div>
                      <span className={`badge ${tx.status === 'Settled' ? 'badge-success' : 'badge-warning'} tx-status`}>
                        {tx.status === 'Settled' ? 'Completado' : tx.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Discover Services — Tertiary Focus */}
      <div className="section">
        <div className="section-header">
          <h3 className="section-title">Descubre más servicios</h3>
        </div>

        <div className="services-grid">
          {/* Loans */}
          <button
            className="service-card"
            style={{ '--i': 0 } as React.CSSProperties}
            onClick={() => navigate('/loans')}
            aria-label="Solicitar préstamo"
          >
            <div className="service-icon-wrapper service-icon-bg-blue">🤝</div>
            <div className="service-title">Préstamos</div>
            {data.alternativeScore > 500 && <span className="service-badge">¡Aprobado!</span>}
          </button>

          {/* FX */}
          <button
            className="service-card"
            style={{ '--i': 1 } as React.CSSProperties}
            onClick={() => navigate('/fx')}
            aria-label="Cambiar divisas"
          >
            <div className="service-icon-wrapper service-icon-bg-green">💱</div>
            <div className="service-title">Cambio<br/>de Divisas</div>
          </button>

          {/* Insurance */}
          <button
            className="service-card"
            style={{ '--i': 2 } as React.CSSProperties}
            onClick={() => navigate('/insurance')}
            aria-label="Contratar seguro"
          >
            <div className="service-icon-wrapper service-icon-bg-purple">🛡️</div>
            <div className="service-title">Seguros</div>
          </button>

          {/* Investments */}
          <button
            className="service-card"
            style={{ '--i': 3 } as React.CSSProperties}
            onClick={() => navigate('/investments')}
            aria-label="Invertir en criptomonedas"
          >
            <div className="service-icon-wrapper service-icon-bg-gold">📈</div>
            <div className="service-title">Inversiones</div>
            <span className="service-badge" style={{ background: '#F4B23E' }}>NUEVO</span>
          </button>

          {/* Merchants */}
          <button
            className="service-card"
            style={{ '--i': 4 } as React.CSSProperties}
            onClick={() => navigate('/merchants')}
            aria-label="Explora comercios aliados"
          >
            <div className="service-icon-wrapper service-icon-bg-orange">🏪</div>
            <div className="service-title">Comercios</div>
          </button>

          {/* More */}
          <button
            className="service-card"
            style={{ '--i': 5 } as React.CSSProperties}
            onClick={() => alert('Más Servicios — Próximamente')}
            aria-label="Ver más servicios próximamente"
          >
            <div className="service-icon-wrapper" style={{ background: 'var(--bg-input)' }}>➕</div>
            <div className="service-title">Ver Más</div>
          </button>
        </div>
      </div>
    </div>
  );
}
