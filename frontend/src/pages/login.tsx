import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { TextField, Button, Container, Typography, Box, Alert, CircularProgress, Link } from '@mui/material';

const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login, isAuthenticated, loading, error: authError } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!username || !password) {
      setFormError(t('loginPage.error.credentialsRequired'));
      return;
    }
    try {
      await login({ username, password });
      // Navigation is handled by the useEffect hook now
    } catch (err) {
      // The error is already set in AuthContext, but you might want to display it here
      // or handle specific login errors if needed.
      // authError will be updated by the login function in AuthContext.
      // If the error from context isn't specific enough, setFormError here based on caught error.
      setFormError(t('loginPage.error.invalidCredentials')); // Generic fallback
    }
  };

  // Display context error if formError is not set
  const displayError = formError || authError;

  if (loading && !displayError) { // Show loading spinner only if no error is present or not specifically a form submission loading
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
        {displayError && (
          <Alert severity="error" sx={{ width: '100%', mt: 2 }}>
            {displayError}
          </Alert>
        )}
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label={t('loginPage.label.username')}
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={!!formError && !username} // Example: highlight if formError and field empty
            helperText={!!formError && !username ? t('loginPage.error.usernameRequired') : ''}
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
            error={!!formError && !password}
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
            <Link component={RouterLink} to="/signup" variant="body2">
              {t('loginPage.link.signUp')}
            </Link>
          </Box>
        </Box>
      </Box>
    </Container>
  );
};

export default LoginPage;