import axios from 'axios';
import { toast } from 'react-toastify';

const API_URL = 'http://localhost:8000/api/';

const axiosInstance = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

axiosInstance.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

axiosInstance.interceptors.response.use(
    (response) => {
        return response;
    },
    async (error) => {
        const originalRequest = error.config;
        // Only retry for 401 and if it's not a token refresh request itself
        if (error.response && error.response.status === 401 && !originalRequest._retry && originalRequest.url !== `${API_URL}auth/refresh/`) {
            originalRequest._retry = true;
            try {
                const refreshToken = localStorage.getItem('refreshToken');
                if (refreshToken) {
                    const response = await axios.post(`${API_URL}auth/refresh/`, { // Use axios.post directly here, not axiosInstance to avoid loop
                        refresh: refreshToken,
                    });
                    const { access } = response.data;
                    localStorage.setItem('accessToken', access);
                    // Update the header for the original request and for future requests with axiosInstance
                    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${access}`;
                    originalRequest.headers['Authorization'] = `Bearer ${access}`;
                    return axiosInstance(originalRequest);
                } else {
                    // No refresh token, clear tokens and redirect
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('refreshToken');
                    if (window.location.pathname !== '/login' && window.location.pathname !== '/sign_up') {
                         window.location.href = '/login';
                    }
                    return Promise.reject(error);
                }
            } catch (refreshError) {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                 if (window.location.pathname !== '/login' && window.location.pathname !== '/sign_up') {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshError);
            }
        }
        // For other errors (like 400 on login with bad credentials), just reject the promise
        return Promise.reject(error);
    }
);

export default axiosInstance;