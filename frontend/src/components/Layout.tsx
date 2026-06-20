import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: '🏠', label: 'Inicio' },
    { path: '/transfer', icon: '💸', label: 'Enviar' },
    { path: '/qr', icon: 'QR', label: '', isQr: true },
    { path: '/transactions', icon: '📋', label: 'Historial' },
    { path: '/profile', icon: '👤', label: 'Perfil' },
  ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo">YUNTA</div>
        <div className="header-info">
          <span className="header-name">{user?.businessName}</span>
          <button className="header-btn" onClick={handleLogout}>Salir</button>
        </div>
      </header>

      <main className="app-main">{children}</main>

      <nav className="bottom-nav">
        {navItems.map(item => (
          item.isQr ? (
            <button key={item.path} className="nav-qr" onClick={() => alert('QR Scanner — Próximamente')}>
              ⬡
            </button>
          ) : (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          )
        ))}
      </nav>
    </div>
  );
}
