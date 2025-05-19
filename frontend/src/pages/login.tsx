import { useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import AuthForm from "../componets/AuthForm";

export default function Login() {
  const navigate = useNavigate();

  const handleLogin = (email: string, password: string) => {
    login({ email, password })
      .then((res) => {
        localStorage.setItem("token", res.data.access);
        navigate("/profile");
      })
      .catch(() => alert("Invalid credentials"));
  };

  return <AuthForm onSubmit={handleLogin} submitText="Login" />;
}