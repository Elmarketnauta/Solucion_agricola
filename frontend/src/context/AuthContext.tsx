import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';

interface User {
  id: number;
  businessName: string;
  ownerName: string;
  phoneNumber: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
}

const SESSION_USER_KEY = 'yunta_user';

// sessionStorage: scoped to the tab, cleared when browser closes.
// The JWT token itself lives in an httpOnly cookie (not accessible to JS).
function readSession(): User | null {
  try {
    const raw = sessionStorage.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic shape validation before trusting stored data.
    if (typeof parsed?.phoneNumber !== 'string') return null;
    return parsed as User;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(readSession);
  // No async init needed: sessionStorage read is synchronous.
  const [isLoading] = useState(false);

  const clearSession = useCallback(() => {
    setUser(null);
    sessionStorage.removeItem(SESSION_USER_KEY);
  }, []);

  const login = useCallback((newUser: User) => {
    setUser(newUser);
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(newUser));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout(); // asks server to clear the httpOnly cookie
    } catch {
      // Proceed with client-side cleanup even if the server call fails.
    }
    clearSession();
  }, [clearSession]);

  // Soft unauthorized handler: fired by api.ts on 401. Clears session without
  // a hard window.location redirect that would reset the React tree.
  useEffect(() => {
    window.addEventListener('yunta:unauthorized', clearSession);
    return () => window.removeEventListener('yunta:unauthorized', clearSession);
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
