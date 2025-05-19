import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import AuthForm from "../componets/AuthForm";
import { toast } from 'react-toastify';

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
      toast.success("Login successful!");
      navigate("/profile");
    } catch (error: any) {
      console.error("Login failed:", error);
      let errorMessage = "Login failed. Please check your credentials or try again later.";
      if (error.response && error.response.data && error.response.data.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      setFormError(errorMessage);
      toast.error(errorMessage, { autoClose: false });
    } finally {
      setIsLoading(false);
    }
  };

  return <AuthForm
            onSubmit={handleLogin}
            submitText="Login"
            isLoading={isLoading}
            formError={formError}
            setFormError={setFormError}
        />;
}
