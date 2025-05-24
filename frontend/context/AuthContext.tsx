import React, {createContext, useState, useEffect, ReactNode, useContext} from 'react';

import axiosInstance from "../src/api/axiosInstance";
import {
    login as apiLogin,
    register as apiRegister,
    logout as apiLogout,
    LoginCredentials,
    User,
    TokenResponse,
    SignUpCredentials,
    SignUpResponse,
    fetchUserProfileAfterLogin,
    UpdateUserPayload,
    apiUpdateUserProfile
} from "../src/api/auth";

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


interface AuthContextType {
    isAuthenticated: boolean;
    user: User | null; // Додаємо поле user
    token: string | null;
    login: (credentials: LoginCredentials) => Promise<void>;
    logout: () => void;
    register: (credentials: SignUpCredentials) => Promise<void>;
    updateUser: (userData: UpdateUserPayload) => Promise<User | null>;
    loading: boolean;
    error: string | null;
    clearError: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [user, setUser] = useState<User | null>(null); // Стан для користувача
    const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
    const [loading, setLoading] = useState<boolean>(true); // Початкове завантаження для перевірки токена
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const storedToken = localStorage.getItem('token');
        const storedUserString = localStorage.getItem('user');

        if (storedToken) {
            setToken(storedToken);
            axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
            setIsAuthenticated(true);
            if (storedUserString) {
                try {
                    setUser(JSON.parse(storedUserString));
                } catch (e) {
                    console.error("Failed to parse stored user:", e);
                    localStorage.removeItem('user');
                }
            } else {
                const fetchUser = async () => {
                    const profile = await fetchUserProfileAfterLogin(storedToken);
                    if (profile) {
                        setUser(profile);
                        localStorage.setItem('user', JSON.stringify(profile));
                    } else {
                        logout();
                    }
                };
                fetchUser();
            }
        }
        setLoading(false);
    }, []);

    const login = async (credentials: LoginCredentials): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const data: TokenResponse = await apiLogin(credentials);
            localStorage.setItem('token', data.access);
            setToken(data.access);
            axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${data.access}`;

            let currentUser = data.user || null;
            if (!currentUser && data.access) {
                 currentUser = await fetchUserProfileAfterLogin(data.access);
            }

            if (currentUser) {
                setUser(currentUser);
                localStorage.setItem('user', JSON.stringify(currentUser));
            } else {
                 console.warn("Login successful, but user data could not be fully loaded/retrieved.");
            }
            setIsAuthenticated(true);
        } catch (err: any) {
            const errorMessage = err?.response?.data?.detail || err?.message || 'Login failed due to an unknown error.';
            setError(errorMessage);
            setIsAuthenticated(false);
            setUser(null);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (axiosInstance.defaults.headers.common['Authorization']) {
                delete axiosInstance.defaults.headers.common['Authorization'];
            }
            throw new Error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const register = async (credentials: SignUpCredentials): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            await apiRegister(credentials);
        } catch (err: any) {
            const errorMessage = err.message || err?.detail || err?.response?.data?.detail || 'Registration failed';
            setError(errorMessage);
            setIsAuthenticated(false);
            setUser(null);
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (axiosInstance.defaults.headers.common['Authorization']) {
                delete axiosInstance.defaults.headers.common['Authorization'];
            }
            throw new Error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        // localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
        delete axiosInstance.defaults.headers.common['Authorization'];
        setIsAuthenticated(false);
    };

    const clearError = () => {
        setError(null);
    };

    const updateUser = async (userData: UpdateUserPayload): Promise<User | null> => {
        if (!token) {
            setError("Not authenticated for updating profile.");
            return null;
        }
        setLoading(true);
        setError(null);
        try {
            const updatedUser = await apiUpdateUserProfile(userData, token);
            setUser(updatedUser);
            localStorage.setItem('user', JSON.stringify(updatedUser));
            return updatedUser;
        } catch (err: any) {
            const errorMessage = err.message || err?.detail || 'Profile update failed.';
            setError(errorMessage);
            return null;
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, token, login, logout, register, loading, error, updateUser, clearError }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};