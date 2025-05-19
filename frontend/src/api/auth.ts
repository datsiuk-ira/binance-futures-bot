// frontend/src/api/auth.ts
import axiosInstance from "./axiosInstance"; // Імпортуємо наш екземпляр Axios

export const login = (data: { email: string; password: string }) =>
  axiosInstance.post("auth/login/", data);

export const signUp = (data: { email: string; password: string }) =>
  axiosInstance.post("auth/register/", data);

// fetchProfile вже буде використовувати токен з interceptor'а
export const fetchProfile = () =>
  axiosInstance.get("auth/profile/");