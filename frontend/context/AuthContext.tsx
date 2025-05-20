import React, {createContext, useContext, useState, useEffect} from "react";

interface Tokens {
  access: string;
  refresh: string;
}

interface AuthContextType {
  tokens: Tokens | null;
  setTokens: (tokens: Tokens | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tokens, setTokensState] = useState<Tokens | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("authTokens");
    if (stored) {
      setTokensState(JSON.parse(stored));
    }
  }, []);

  const setTokens = (tokens: Tokens | null) => {
    if (tokens) {
      localStorage.setItem("authTokens", JSON.stringify(tokens));
    } else {
      localStorage.removeItem("authTokens");
    }
    setTokensState(tokens);
  };

  const logout = () => {
    setTokens(null);
  };

  return (
    <AuthContext.Provider value={{ tokens, setTokens, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
