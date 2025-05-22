import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; // Assuming signUp is added here
import { useTranslation } from 'react-i18next';
import { TextField, Button, Container, Typography, Box, Alert, CircularProgress, Link } from '@mui/material';

const SignUpPage: React.FC = () => {
  const { t } = useTranslation();
  const { signUp, isAuthenticated, loading } = useAuth();
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

  const validateEmail = (emailToValidate: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailToValidate);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
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
      const response = await signUp({ username, email, password });
      setSuccessMessage(response.message || t('signUpPage.success'));
      // Optional: redirect after a delay or let user click a link
      // setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setFormError(err.message || t('signUpPage.error.generic'));
    }
  };

  if (loading && !formError && !successMessage) {
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
        {formError && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
            {formError}
          </Alert>
        )}
        {successMessage && (
          <Alert severity="success" sx={{ width: '100%', mt: 2 }}>
            {successMessage}
          </Alert>
        )}
        {!successMessage && ( // Hide form on success
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
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : t('signUpPage.button.signUp')}
            </Button>
          </Box>
        )}
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