import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import AuthForm from "../components/AuthForm";
import { toast } from 'react-toastify';
import {t} from "i18next";

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleLogin = async (email: string, password: string) => {
    setIsLoading(true);
    setFormError(null);
    try {
      const response = await login({ email, password });
      localStorage.setItem("accessToken", response.data.access);
      localStorage.setItem("refreshToken", response.data.refresh);
      toast.success(t('login.successful')); // This can also be translated if needed
      navigate("/profile");
    } catch (error: any) {
      console.error("Login failed:", error);
      let errorMessage = "An unexpected error occurred. Please try again."; // Default/fallback error
      if (error.response && error.response.data && error.response.data.detail) {
        errorMessage = error.response.data.detail; // Error from backend
      } else if (error.message) {
        errorMessage = error.message; // Network error or other client-side error
      }
      setFormError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const clearFormError = () => {
    setFormError(null);
  }

  return <AuthForm onSubmit={handleLogin} submitTextKey="login.submitButton" isLoading={isLoading} formError={formError} clearFormError={clearFormError} />;
}
