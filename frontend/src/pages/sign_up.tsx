import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signUp } from "../api/auth";
import AuthForm from "../componets/AuthForm";
import { toast } from 'react-toastify';

export default function SignUp() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);


  const handleSignUp = async (email: string, password: string, password2?: string) => {
    setIsLoading(true);
    setFormError(null);
    try {
      await signUp({ email, password });
      toast.success("Registration successful! Please log in.");
      navigate("/login");
    } catch (error: any) {
      console.error("Sign up failed:", error);
      let errorMessage = "Sign up failed. Please try again.";
      if (error.response && error.response.data) {
        const errors = error.response.data;
        let messages = [];
        for (const key in errors) {
          if (Array.isArray(errors[key])) {
            messages.push(`${key}: ${errors[key].join(", ")}`);
          } else {
            messages.push(`${key}: ${errors[key]}`);
          }
        }
        if (messages.length > 0) {
          errorMessage = messages.join("\n");
        }
      }
      setFormError(errorMessage);
      toast.error(errorMessage, { autoClose: 10000 });
    } finally {
      setIsLoading(false);
    }
  };

  return <AuthForm
            onSubmit={handleSignUp}
            submitText="Sign Up"
            isLoading={isLoading}
            formError={formError}
            setFormError={setFormError}
        />;
}
