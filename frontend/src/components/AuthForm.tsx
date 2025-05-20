import React, {useState, useEffect, useCallback} from "react";
import {Link as RouterLink} from "react-router-dom";
import {
    Box,
    Button,
    TextField,
    Typography,
    Container,
    Paper,
    CircularProgress,
    Link,
    Alert
} from "@mui/material";
import {useTranslation} from 'react-i18next';

interface Props {
    onSubmit: (email: string, password: string, password2?: string) => Promise<void>;
    submitTextKey: string; // Key for translation, e.g., "loginButton" or "signUpButton"
    isLoading: boolean;
    formError?: string | null;
    clearFormError?: () => void;
}

const AuthForm: React.FC<Props> = ({onSubmit, submitTextKey, isLoading, formError, clearFormError}) => {
    const {t} = useTranslation(); // Call hook inside the component

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [password2, setPassword2] = useState("");

    const [emailFieldMessage, setEmailFieldMessage] = useState("");
    const [passwordFieldMessage, setPasswordFieldMessage] = useState("");
    const [password2FieldMessage, setPassword2FieldMessage] = useState("");

    const isSignUpPage = submitTextKey === "signUp.submitButton"; // Example key for Sign Up

    const validateEmail = useCallback(() => {
        if (!email) {
            setEmailFieldMessage(t('validation.emailRequired'));
            return false;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setEmailFieldMessage(t('validation.emailInvalid'));
            return false;
        }
        setEmailFieldMessage("");
        return true;
    }, [email, t]);

    const validatePassword = useCallback(() => {
        if (!password) {
            setPasswordFieldMessage(t('validation.passwordRequired'));
            return false;
        }
        if (isSignUpPage && password.length < 8) {
            setPasswordFieldMessage(t('validation.passwordTooShort', {minLength: 8}));
            return false;
        }
        setPasswordFieldMessage("");
        return true;
    }, [password, isSignUpPage, t]);

    const validatePassword2 = useCallback(() => {
        if (!isSignUpPage) return true;
        if (!password2) {
            setPassword2FieldMessage(t('validation.confirmPasswordRequired'));
            return false;
        }
        if (password !== password2) {
            setPassword2FieldMessage(t('validation.passwordsDoNotMatch'));
            return false;
        }
        setPassword2FieldMessage("");
        return true;
    }, [password, password2, isSignUpPage, t]);

    useEffect(() => {
        // Validate on blur or as user types after initial error
        if (email || email === "") validateEmail();
    }, [email, validateEmail]);

    useEffect(() => {
        if (password || password === "") validatePassword();
    }, [password, validatePassword]);

    useEffect(() => {
        if (password2 || password2 === "") validatePassword2();
    }, [password2, validatePassword2]);

    const handleInputChange = (
        setter: React.Dispatch<React.SetStateAction<string>>,
        value: string
    ) => {
        setter(value);
        if (formError && clearFormError) {
            clearFormError();
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) return;

        if (formError && clearFormError) {
            clearFormError();
        }

        const isEmailValid = validateEmail();
        const isPasswordValid = validatePassword();
        const isPassword2Valid = validatePassword2();

        if (isEmailValid && isPasswordValid && isPassword2Valid) {
            if (isSignUpPage) {
                onSubmit(email, password, password2);
            } else {
                onSubmit(email, password);
            }
        }
    };

    const canSubmit = !emailFieldMessage && !passwordFieldMessage && (!isSignUpPage || !password2FieldMessage);

    return (
        <Container component="main" maxWidth="xs">
            <Paper
                elevation={6}
                sx={{
                    marginTop: 8,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    padding: {xs: 2, sm: 4},
                    backgroundColor: 'background.paper'
                }}
            >
                <Typography component="h1" variant="h5" color="text.primary" sx={{mb: 2}}>
                    {isSignUpPage ? t('signUp.title') : t('login.title')}
                </Typography>
                {formError && (
                    <Alert severity="error" sx={{width: '100%', mt: 1, mb: 1}}>
                        { /* Try to translate known error messages, otherwise show the raw error */}
                        {formError.includes("Network Error") ? t('error.network') :
                            formError.toLowerCase().includes("user with this email does not exist") ? t('error.emailDoesNotExist') :
                                formError.toLowerCase().includes("no active account found with the given credentials") ? t('error.noActiveAccount') :
                                    formError.toLowerCase().includes("incorrect password") ? t('error.incorrectPassword') :
                                        t(formError, {defaultValue: formError})
                        }

                        { /* Suggestion for non-existent email */}
                        {formError.toLowerCase().includes("user with this email does not exist") && (
                            <Typography variant="caption" display="block" sx={{mt: 1}}>
                                {t('login.emailDoesNotExistSuggestion')}{' '}
                                <Link component={RouterLink} to="/sign_up" variant="caption" color="error.contrastText">
                                    {t('signUp.link')}
                                </Link>
                            </Typography>
                        )}

                        { /* Suggestion for incorrect credentials (which might cover incorrect password for existing user) */}
                        {formError.toLowerCase().includes("no active account found with the given credentials") && (
                            <Typography variant="caption" display="block" sx={{mt: 1}}>
                                {t('login.credentialErrorSuggestion')}{' '}
                                <Link component={RouterLink} to="/sign_up" variant="caption" color="error.contrastText">
                                    {t('signUp.link')}
                                </Link>
                            </Typography>
                        )}
                    </Alert>
                )}
                <Box component="form" onSubmit={handleSubmit} sx={{mt: 1, width: '100%'}} noValidate>
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="email"
                        label={t('form.emailLabel')}
                        name="email"
                        autoComplete="email"
                        autoFocus
                        value={email}
                        onChange={(e) => handleInputChange(setEmail, e.target.value)}
                        error={!!emailFieldMessage}
                        helperText={emailFieldMessage}
                        disabled={isLoading}
                    />
                    <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label={t('form.passwordLabel')}
                        type="password"
                        id="password"
                        autoComplete={isSignUpPage ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => handleInputChange(setPassword, e.target.value)}
                        error={!!passwordFieldMessage}
                        helperText={passwordFieldMessage}
                        disabled={isLoading}
                    />
                    {isSignUpPage && (
                        <TextField
                            margin="normal"
                            required
                            fullWidth
                            name="password2"
                            label={t('form.confirmPasswordLabel')}
                            type="password"
                            id="password2"
                            autoComplete="new-password"
                            value={password2}
                            onChange={(e) => handleInputChange(setPassword2, e.target.value)}
                            error={!!password2FieldMessage}
                            helperText={password2FieldMessage}
                            disabled={isLoading}
                        />
                    )}
                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        color={isSignUpPage ? "secondary" : "primary"}
                        sx={{mt: 3, mb: 2, position: 'relative'}}
                        disabled={isLoading || !canSubmit}
                    >
                        {isLoading ? (
                            <CircularProgress size={24} sx={{color: 'common.white', position: 'absolute'}}/>
                        ) : (
                            t(submitTextKey)
                        )}
                    </Button>
                    <Box sx={{textAlign: 'center'}}>
                        {isSignUpPage ? (
                            <Typography variant="body2">
                                {t('signUp.alreadyHaveAccount')}{" "}
                                <Link component={RouterLink} to="/login" variant="body2" color="secondary.main">
                                    {t('login.link')}
                                </Link>
                            </Typography>
                        ) : (
                            <Typography variant="body2">
                                {t('login.dontHaveAccount')}{" "}
                                <Link component={RouterLink} to="/sign_up" variant="body2" color="primary.main">
                                    {t('signUp.link')}
                                </Link>
                            </Typography>
                        )}
                    </Box>
                </Box>
            </Paper>
        </Container>
    );
}

export default AuthForm;
