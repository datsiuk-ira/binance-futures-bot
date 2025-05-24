import axios, { AxiosError, isAxiosError as axiosIsAxiosErrorCheck } from 'axios'; // Import AxiosError and the type guard

const API_BASE_URL = 'http://localhost:8000';

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Optional: Add a response interceptor for global error handling (e.g., 401 Unauthorized)
axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Handle 401 - e.g., redirect to login, clear token
      console.error("Unauthorized request - 401. Potentially redirect to login.");
      if (window.location.pathname !== '/login') { // Avoid redirect loop
         window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Export the type guard for use in other service files
export const isAxiosError = axiosIsAxiosErrorCheck;

export default axiosInstance;