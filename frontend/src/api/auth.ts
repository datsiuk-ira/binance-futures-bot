// frontend/src/api/auth.ts
import axiosInstance from './axiosInstance';

export interface User {
  id: string;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  balance?: string;
  leverage?: number;
  risk_percentage?: number;
  binance_api_key?: string;
  binance_secret_key?: string;
  trade_mode?: "auto" | "semi" | "analytics";
}

export interface UpdateUserPayload {
    username?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
    balance?: string;
    leverage?: number;
    risk_percentage?: number;
    binance_api_key?: string;
    binance_secret_key?: string;
    trade_mode?: "auto" | "semi" | "analytics";
    updated_at?: string;
}

export interface LoginCredentials {
  username?: string;
  password?: string;
  email?: string;
}

export interface SignUpCredentials extends LoginCredentials {
  password2?: string;
}

export interface TokenResponse {
  access: string;
  refresh?: string;
  user?: User;
}

export interface SignUpResponse {
  message?: string;
  user?: User;
  detail?: string;
}

export const login = async (credentials: LoginCredentials): Promise<TokenResponse> => {
  try {
    const response = await axiosInstance.post<TokenResponse>('/api/users/login/', credentials);
    if (response.data.access && !response.data.user) {
        try {
            const userProfile = await fetchUserProfileAfterLogin(response.data.access);
            if (userProfile !== null) {
                response.data.user = userProfile;
            }
        } catch (profileError) {
            console.warn("Login successful, but failed to fetch user profile immediately.", profileError);
        }
    }

    if (response.data.access) {
        localStorage.setItem('token', response.data.access);
        if (response.data.user) {
            localStorage.setItem('user', JSON.stringify(response.data.user));
        }
    }
    return response.data;
  } catch (error: any) {
    console.error('Login API error:', error.response?.data || error.message);
    throw error.response?.data || new Error('Login API request failed');
  }
};

export const register = async (credentials: SignUpCredentials): Promise<SignUpResponse> => {
  try {
    const response = await axiosInstance.post<SignUpResponse>('/api/users/register/', credentials);
    return response.data;
  } catch (error: any) {
    console.error('Sign up API error:', error.response?.data || error.message);
    throw error.response?.data || new Error('Sign up API request failed');
  }
};

export const logout = async (): Promise<void> => {
  try {
    await axiosInstance.post('/api/users/logout/');
  } catch (error: any) {
    console.error('Logout API error:', error.response?.data || error.message);
  } finally {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axiosInstance.defaults.headers.common['Authorization'];
  }
};

export const fetchUserProfileAfterLogin = async (token: string): Promise<User | null> => {
    try {
        const response = await axiosInstance.get<{ user: User } | User>('/api/users/profile/', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        if ('user' in response.data && typeof response.data.user === 'object' && response.data.user !== null) {
             return response.data.user as User;
        } else if ('id' in response.data && 'username' in response.data) {
            return response.data as User;
        }
        console.warn("User profile response format unexpected:", response.data);
        return null;
    } catch (error) {
        console.error('Failed to fetch user profile after login:', error);
        return null;
    }
};


export const apiUpdateUserProfile = async (userData: UpdateUserPayload, token: string): Promise<User> => {
    try {
        const response = await axiosInstance.patch<User>('/api/users/profile/', userData, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        return response.data;
    } catch (error: any) {
        console.error("API Update User Profile error:", error.response?.data || error.message);
        if (error.response && error.response.data) {
            const errorData = error.response.data;
            let errorMessage = "User profile update failed.";
            if (typeof errorData === 'string') {
                errorMessage = errorData;
            } else if (errorData.detail) {
                errorMessage = errorData.detail;
            } else if (typeof errorData === 'object') {
                const fieldErrors = Object.entries(errorData)
                    .map(([key, value]) => `${key}: ${(Array.isArray(value) ? value.join(', ') : value)}`)
                    .join('; ');
                if (fieldErrors) errorMessage = fieldErrors;
            }
            throw new Error(errorMessage);
        }
        throw new Error('User profile update failed due to network or server issue.');
    }
};