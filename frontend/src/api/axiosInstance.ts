import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add the auth token to headers
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Check if it's a 401 error, not a retry request, and the error is not from the refresh token endpoint itself
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry && originalRequest.url !== '/users/token/refresh/') {
      originalRequest._retry = true; // Mark that we've tried to refresh
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          // No refresh token, logout or redirect to login
          // Potentially call logout function from AuthContext or emit an event
          console.warn('No refresh token available for renewal.');
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
          // window.location.href = '/login'; // Force redirect
          return Promise.reject(error);
        }

        const response = await axios.post(`${API_BASE_URL}/users/token/refresh/`, {
          refresh: refreshToken,
        });

        const { access } = response.data;
        localStorage.setItem('accessToken', access);

        // Update the header for the original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${access}`;
        }

        // Retry the original request with the new token
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Refresh failed, logout user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        // Potentially call logout function from AuthContext or emit an event
        // window.location.href = '/login'; // Force redirect
        return Promise.reject(refreshError); // Or the original error
      }
    }
    return Promise.reject(error);
  }
);


export default axiosInstance;