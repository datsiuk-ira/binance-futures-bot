import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { TextField, Button, Container, Typography, Box, Alert, CircularProgress, Link } from '@mui/material';

const SignUpPage: React.FC = () => {
  const { t } = useTranslation();
  const { register, isAuthenticated, loading, error: authErrorHook, clearError } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Set formError based on authErrorHook from context
    if (authErrorHook) {
        setFormError(authErrorHook);
    } else {
        setFormError(null); // Clear error if authErrorHook is null
    }
  }, [authErrorHook]);

  // Clear auth error on component unmount or when navigating away
  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);


  const validateEmail = (emailToValidate: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToValidate);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError(); // Clear context error first
    setFormError(null); // Clear local form error
    setSuccessMessage(null);

    if (!username || !email || !password) {
      setFormError(t('signUpPage.error.fieldsRequired'));
      return;
    }
    if (!validateEmail(email)) {
      setFormError(t('signUpPage.error.emailInvalid'));
      return;
    }
    if (password.length < 6) { // Example: Basic password length validation
      setFormError(t('signUpPage.error.passwordTooShort'));
      return;
    }

    try {
      // Changed signUp to register
      await register({ username, email, password });
      // AuthContext's register function now attempts to log in the user.
      // If successful, isAuthenticated becomes true, and the useEffect hook redirects to /dashboard.
      setSuccessMessage(t('signUpPage.success'));
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setFormError(err.message || t('signUpPage.error.generic'));
    }
  };

  // Display context error (authErrorHook via formError) or local formError
  const displayError = formError;

  if (loading && !displayError && !successMessage) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography component="h1" variant="h5">
          {t('signUpPage.title')}
        </Typography>
        {displayError && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }} onClose={() => { setFormError(null); clearError(); }}>
            {displayError}
          </Alert>
        )}
        {successMessage && !displayError && ( // Show success only if no error
          <Alert severity="success" sx={{ width: '100%', mt: 2 }}>
            {successMessage} {t('signUpPage.successRedirect')}
             <Link component={RouterLink} to="/login" variant="body2" sx={{ml:1}}>
                {t('loginPage.title')}
            </Link>
          </Alert>
        )}
        {/* Hide form on success if you want to prevent re-submission, or keep it shown */}
        {/* For this example, we'll keep the form visible but disable submit if loading */}
         <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="username"
              label={t('signUpPage.label.username')}
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={!!formError && !username}
              helperText={!!formError && !username ? t('signUpPage.error.usernameRequired') : ''}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label={t('signUpPage.label.email')}
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!(formError && (!email || (email && !validateEmail(email))))}
              helperText={!!formError && (!email ? t('signUpPage.error.emailRequired') : (email && !validateEmail(email) ? t('signUpPage.error.emailInvalid') : ''))}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label={t('signUpPage.label.password')}
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!formError && (!password || password.length < 6)}
              helperText={!!formError && (!password ? t('signUpPage.error.passwordRequired') : (password.length < 6 ? t('signUpPage.error.passwordTooShort') : ''))}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading || (!!successMessage && !formError)} // Disable if loading or successful
            >
              {loading ? <CircularProgress size={24} /> : t('signUpPage.button.signUp')}
            </Button>
          </Box>
        <Box textAlign="center" sx={{ mt: 2 }}>
          <Link component={RouterLink} to="/login" variant="body2">
            {t('signUpPage.link.signIn')}
          </Link>
        </Box>
      </Box>
    </Container>
  );
};

export default SignUpPage;