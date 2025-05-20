import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signUp } from "../api/auth"; // Ensure this API function returns the response data
import AuthForm from "../components/AuthForm"; // Check your path: componets/ or components/
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import {Link as RouterLink} from "react-router-dom";
import {Link} from "@mui/material";

export default function SignUp() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSignUp = async (email: string, password: string) => {
    setIsLoading(true);
    setFormError(null);
    try {
      const response = await signUp({ email, password }); // Capture the response
      // Assuming response.data contains { email, access, refresh }
      if (response.data && response.data.access && response.data.refresh) {
        localStorage.setItem("accessToken", response.data.access);
        localStorage.setItem("refreshToken", response.data.refresh);
        toast.success(t('signUp.successfulAndLoggedIn')); // New translation key
        navigate("/profile"); // Navigate to profile directly
      } else {
        // Fallback if tokens are not returned, though they should be
        toast.success(t('signUp.successfulPleaseLogin'));
        navigate("/login");
      }
    } catch (error: any) {
      console.error("Sign up failed:", error);
      let errorMessage = t('signUp.failedDefault');
      if (error.response && error.response.data) {
        const errors = error.response.data;
        let messages = [];
        let emailExists = false;
        for (const key in errors) {
          const fieldErrorKey = `form.${key}Label`;
          const translatedKey = t(fieldErrorKey, { defaultValue: key });
          if (Array.isArray(errors[key])) {
            const fieldErrors = errors[key].join(", ");
            messages.push(`${translatedKey}: ${fieldErrors}`);
            if (key === 'email' && (fieldErrors.toLowerCase().includes('already exists') || fieldErrors.toLowerCase().includes('вже існує'))) {
                emailExists = true;
            }
          } else {
            messages.push(`${translatedKey}: ${errors[key]}`);
            if (key === 'email' && (errors[key].toLowerCase().includes('already exists') || errors[key].toLowerCase().includes('вже існує'))) {
                emailExists = true;
            }
          }
        }
        if (messages.length > 0) {
          errorMessage = messages.join("\n");
        }
        setFormError(errorMessage);

        if (emailExists) {
          toast.info(
            <div>
              {t('signUp.emailExistsSuggestion')}{' '}
              <Link component={RouterLink} to="/login" style={{ color: '#fff', fontWeight: 'bold' }}>
                   {t('login.link')}
              </Link>
            </div>,
            { autoClose: 8000 }
          );
        }
      } else if (error.message) {
        setFormError(error.message);
      } else {
        setFormError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const clearFormError = () => {
    setFormError(null);
  }

  return <AuthForm onSubmit={handleSignUp} submitTextKey="signUp.submitButton" isLoading={isLoading} formError={formError} clearFormError={clearFormError} />;
}
