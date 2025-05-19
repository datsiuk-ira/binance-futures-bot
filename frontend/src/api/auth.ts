import axios from "axios";

const API = axios.create({
  baseURL: "http://localhost:8000/api/auth/",
});

export const login = (data: { email: string; password: string }) =>
  API.post("login/", data);

export const signUp = (data: { email: string; password: string }) =>
  API.post("register/", data);

export const fetchProfile = (token: string) =>
  axios.get("http://localhost:8000/api/profile/", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });