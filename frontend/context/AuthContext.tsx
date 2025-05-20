// frontend/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useMemo } from "react";

interface Tokens {
  access: string;
  refresh: string;
}

interface AuthContextType {
  tokens: Tokens | null;
  setTokens: (tokens: Tokens | null) => void;
  logout: () => void;
  isAuthenticated: boolean;
  loadingAuth: boolean; // Перейменовано для ясності, раніше могло бути 'loading'
}

// Надаємо типове значення, яке відповідає AuthContextType, особливо для loadingAuth
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tokens, setTokensState] = useState<Tokens | null>(null);
  const [loadingAuth, setLoadingAuth] = useState<boolean>(true); // Стан для початкової перевірки автентифікації

  useEffect(() => {
    console.log("AuthProvider: useEffect for loading tokens triggered.");
    const stored = localStorage.getItem("authTokens");
    if (stored) {
      try {
        setTokensState(JSON.parse(stored));
        console.log("AuthProvider: Tokens loaded from localStorage.");
      } catch (error) {
        console.error("AuthProvider: Failed to parse authTokens from localStorage", error);
        localStorage.removeItem("authTokens");
      }
    } else {
      console.log("AuthProvider: No tokens found in localStorage.");
    }
    setLoadingAuth(false); // Перевірка автентифікації завершена
    console.log("AuthProvider: loadingAuth set to false.");
  }, []);

  const setTokens = (newTokens: Tokens | null) => {
    if (newTokens) {
      localStorage.setItem("authTokens", JSON.stringify(newTokens));
    } else {
      localStorage.removeItem("authTokens");
    }
    setTokensState(newTokens);
  };

  const logout = () => {
    setTokens(null);
  };

  const isAuthenticated = useMemo(() => !!tokens, [tokens]);

  // AuthContext.Provider тепер завжди рендериться
  return (
    <AuthContext.Provider value={{ tokens, setTokens, logout, isAuthenticated, loadingAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    // Ця помилка все ще можлива, якщо useAuth викликається зовсім поза AuthProvider,
    // але проблема з null під час завантаження має бути вирішена.
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
