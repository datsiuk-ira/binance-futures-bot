import axiosInstance from './axiosInstance';
import { AuthData, LoginResponse, SignUpResponse, User } from '../../context/AuthContext';

export const loginUser = async (userData: AuthData): Promise<LoginResponse> => {
  try {
    const response = await axiosInstance.post<LoginResponse>('/users/login/', userData);
    if (response.data.access_token && response.data.user) {
      localStorage.setItem('accessToken', response.data.access_token);
      localStorage.setItem('refreshToken', response.data.refresh_token); // Assuming you also get a refresh token
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  } catch (error: any) {
    console.error('Login failed:', error.response?.data || error.message);
    throw error.response?.data || new Error('Login failed');
  }
};

export const signUpUser = async (userData: AuthData): Promise<SignUpResponse> => {
  try {
    const response = await axiosInstance.post<SignUpResponse>('/users/register/', userData);
    // Typically, registration might not automatically log in the user or return tokens.
    // If it does, handle tokens similar to loginUser.
    return response.data;
  } catch (error: any) {
    console.error('Sign up failed:', error.response?.data || error.message);
    throw error.response?.data || new Error('Sign up failed');
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    // Assuming you have a backend logout endpoint that might invalidate tokens
    // await axiosInstance.post('/users/logout/');
  } catch (error: any) {
    console.error('Logout failed:', error.response?.data || error.message);
    // Even if backend logout fails, clear client-side data
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  }
};

export const fetchUserProfile = async (): Promise<User | null> => {
  try {
    const response = await axiosInstance.get<{ user: User }>('/users/profile/');
    if (response.data && response.data.user) {
      localStorage.setItem('user', JSON.stringify(response.data.user));
      return response.data.user;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    // If profile fetch fails (e.g. token expired), clear local storage
    // to prevent an inconsistent state.
    if ((error as any).response?.status === 401) {
        await logoutUser(); // Or simply clear storage items
    }
    return null;
  }
};