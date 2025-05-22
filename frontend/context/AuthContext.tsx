import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { loginUser as apiLoginUser, signUpUser as apiSignUpUser, logoutUser as apiLogoutUser, fetchUserProfile } from '../src/api/auth';
import { useNavigate } from 'react-router-dom';

export interface User {
  id: number;
  username: string;
  email: string;
  // Add other user properties as needed
}

export interface AuthData {
  username?: string;
  email?: string;
  password?: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
  message?: string;
}

export interface SignUpResponse {
  message: string;
  user?: User; // Optional: depends on your API response for signup
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (userData: AuthData) => Promise<void>;
  signUp: (userData: AuthData) => Promise<SignUpResponse>;
  logout: () => Promise<void>;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const storedUser = localStorage.getItem('user');

      if (token) {
        try {
          // Option 1: Trust stored user data if available
          if (storedUser) {
            setUser(JSON.parse(storedUser));
            setIsAuthenticated(true);
          } else {
          // Option 2: Or always fetch profile to validate token and get fresh user data
            const fetchedUser = await fetchUserProfile();
            if (fetchedUser) {
              setUser(fetchedUser);
              setIsAuthenticated(true);
            } else {
              // Token might be invalid or expired
              await apiLogoutUser(); // Clears local storage
              setIsAuthenticated(false);
              setUser(null);
            }
          }
        } catch (e) {
          console.error("Initialization error:", e);
          await apiLogoutUser(); // Clears local storage
          setIsAuthenticated(false);
          setUser(null);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
      }
      setLoading(false);
    };
    initializeAuth();
  }, []);

  const login = async (userData: AuthData) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiLoginUser(userData);
      setUser(data.user);
      setIsAuthenticated(true);
      // The navigation should happen in the component after successful login
      // navigate('/dashboard'); // Avoid navigation directly in context
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
      setIsAuthenticated(false);
      setUser(null);
      throw err; // Re-throw to allow component to handle it
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (userData: AuthData): Promise<SignUpResponse> => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiSignUpUser(userData);
      // Depending on your flow, you might log the user in or just show a success message
      // For now, we assume signup doesn't auto-login.
      return response;
    } catch (err: any) {
      setError(err.message || 'Sign up failed. Please try again.');
      throw err; // Re-throw to allow component to handle it
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiLogoutUser(); // This handles clearing localStorage
    } catch (err: any) {
      // Log error but still proceed with client-side logout
      console.error("Logout API call failed:", err);
      setError(err.message || 'Logout failed on server, but cleared locally.');
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setLoading(false);
      navigate('/login'); // Navigate to login after logout
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, signUp, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};