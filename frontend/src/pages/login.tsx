import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { TextField, Button, Container, Typography, Box, Alert, CircularProgress, Link } from '@mui/material';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login, isAuthenticated, loading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (authError) {
      setFormError(authError);
    } else {
      setFormError(null); // Clear error if authError is null
    }
  }, [authError]);

  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    clearError();
    setFormError(null);

    if (!email || !password) {
      setFormError(t('loginPage.error.credentialsRequired'));
      return;
    }
    try {
      await login({ email, password });
    } catch (err: any) {
      setFormError(err.message || t('loginPage.error.invalidCredentials'));
    }
  };

  // Display context error if formError is not set
  const displayError = formError || authError;

  if (loading && !isAuthenticated && !displayError) {
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
          {t('loginPage.title')}
        </Typography>
        {displayError && ( // displayError is formError
          <Alert severity="error" sx={{ width: '100%', mt: 2 }} onClose={() => {setFormError(null); clearError();}}>
            {displayError}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label={t('loginPage.label.email')}
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={!!formError}
            helperText={!!formError && !email ? t('loginPage.error.emailRequired') : ''}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label={t('loginPage.label.password')}
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!formError}
            helperText={!!formError && !password ? t('loginPage.error.passwordRequired') : ''}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : t('loginPage.button.login')}
          </Button>
          <Box textAlign="center">
            <Link component={RouterLink} to="/sign-up" variant="body2">
              {t('loginPage.link.signUp')}
            </Link>
          </Box>
        </Box>
      </Box>
    </Container>
  );
};

export default LoginPage;