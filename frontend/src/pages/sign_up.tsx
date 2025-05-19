import { useNavigate } from "react-router-dom";
import { signUp } from "../api/auth";
import AuthForm from "../componets/AuthForm";

export default function SignUp() {
  const navigate = useNavigate();

  const handleSignUp = (email: string, password: string) => {
    signUp({ email, password })
      .then(() => navigate("/login"))
      .catch(() => alert("Email already in use"));
  };

  return <AuthForm onSubmit={handleSignUp} submitText="Sign Up" />;
}