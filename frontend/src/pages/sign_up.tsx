import {useState} from "react";
import {useNavigate} from "react-router-dom";
import {Link as RouterLink} from "react-router-dom";
import {Link} from "@mui/material";
import {login, signUp} from "../api/auth";
import AuthForm from "../components/AuthForm";
import {toast} from 'react-toastify';
import {t} from "i18next";
import {useAuth} from "../../context/AuthContext";


export default function SignUp() {
    const navigate = useNavigate();
    const {setTokens} = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null); // Added for consistency, though sign-up errors are usually field-specific

    const handleSignUp = async (email: string, password: string) => {
        setIsLoading(true);
        setFormError(null);
        try {
            await signUp({email, password});

            const tokenResponse = await login({ email, password });
            setTokens(tokenResponse.data);

            toast.success(t("signUp.success")); // перекладене повідомлення
            navigate("/profile");
        } catch (error: any) {
            console.error("Sign up failed:", error);
            let errorMessage = t("signUp.failed");

            if (error.response && error.response.data) {
                const errors = error.response.data;
                let messages = [];
                let emailExists = false;

                for (const key in errors) {
                    if (Array.isArray(errors[key])) {
                        const fieldErrors = errors[key].join(", ");
                        messages.push(`${t(`form.${key}Label`, key)}: ${fieldErrors}`);
                        if (key === 'email' && fieldErrors.toLowerCase().includes('already exists')) {
                            emailExists = true;
                        }
                    } else {
                        messages.push(`${t(`form.${key}Label`, key)}: ${errors[key]}`);
                        if (key === 'email' && errors[key].toLowerCase().includes('already exists')) {
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
                            <Link component={RouterLink} to="/login" style={{color: '#fff', fontWeight: 'bold'}}>
                                {t('login.link')}
                            </Link>
                        </div>,
                        {autoClose: 8000}
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

    return <AuthForm onSubmit={handleSignUp} submitTextKey="signUp.submitButton" isLoading={isLoading}
                     formError={formError} clearFormError={clearFormError}/>;
}
