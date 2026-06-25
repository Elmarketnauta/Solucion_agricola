// ============================================================================
// Yunta — Router principal de la aplicación.
// Developed by Marketnauta
// ============================================================================

import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Transfer = lazy(() => import('./pages/Transfer'));
const Transactions = lazy(() => import('./pages/Transactions'));

// SuperApp Services
const Loans = lazy(() => import('./pages/Loans'));
const FX = lazy(() => import('./pages/FX'));
const Insurance = lazy(() => import('./pages/Insurance'));
const Investments = lazy(() => import('./pages/Investments'));
const Merchants = lazy(() => import('./pages/Merchants'));
const AgroScore = lazy(() => import('./pages/AgroScore'));
const AgroCenter = lazy(() => import('./pages/AgroCenter'));

function LoadingFallback() {
  return (
    <div className="auth-page">
      <div className="auth-logo">YUNTA</div>
      <p className="text-muted mt-md">Cargando...</p>
    </div>
  );
}

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <LoadingFallback />;

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={isAuthenticated ? <Navigate to="/dashboard" /> : <Navigate to="/login" />} />
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/dashboard" />} />
        <Route path="/register" element={!isAuthenticated ? <Register /> : <Navigate to="/dashboard" />} />
        <Route path="/dashboard" element={<ProtectedRoute><Layout><Dashboard /></Layout></ProtectedRoute>} />
        <Route path="/transfer" element={<ProtectedRoute><Layout><Transfer /></Layout></ProtectedRoute>} />
        <Route path="/transactions" element={<ProtectedRoute><Layout><Transactions /></Layout></ProtectedRoute>} />
        
        <Route path="/loans" element={<ProtectedRoute><Layout><Loans /></Layout></ProtectedRoute>} />
        <Route path="/fx" element={<ProtectedRoute><Layout><FX /></Layout></ProtectedRoute>} />
        <Route path="/insurance" element={<ProtectedRoute><Layout><Insurance /></Layout></ProtectedRoute>} />
        <Route path="/investments" element={<ProtectedRoute><Layout><Investments /></Layout></ProtectedRoute>} />
        <Route path="/merchants" element={<ProtectedRoute><Layout><Merchants /></Layout></ProtectedRoute>} />
        <Route path="/agro" element={<ProtectedRoute><Layout><AgroScore /></Layout></ProtectedRoute>} />
        <Route path="/agro/center" element={<ProtectedRoute><Layout><AgroCenter /></Layout></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default App;
