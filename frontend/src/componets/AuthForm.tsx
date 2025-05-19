import React, { useState, useEffect } from "react";
import { Link as RouterLink } from "react-router-dom";
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

interface Props {
  onSubmit: (email: string, password: string, password2?: string) => Promise<void>;
  submitText: string;
  isLoading: boolean;
  formError?: string | null;
  setFormError?: React.Dispatch<React.SetStateAction<string | null>>;
}

export default function AuthForm({ onSubmit, submitText, isLoading, formError, setFormError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [password2Error, setPassword2Error] = useState("");

  const isSignUpPage = submitText === "Sign Up";

  const clearFormLevelErrorOnChange = () => {
    if (formError && setFormError) {
        setFormError(null);
    }
  }

  useEffect(() => {
    if (email) {
        clearFormLevelErrorOnChange();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setEmailError("Invalid email format.");
        } else {
            setEmailError("");
        }
    } else {
        setEmailError("");
    }
  }, [email]);

  useEffect(() => {
    if (password){
        clearFormLevelErrorOnChange();
    }
    if (isSignUpPage && password) {
        if (password.length < 8) {
            setPasswordError("Password must be at least 8 characters long.");
        } else {
            setPasswordError("");
        }
    } else {
        setPasswordError("");
    }
  }, [password, isSignUpPage]);


  useEffect(() => {
    if (password2){
        clearFormLevelErrorOnChange();
    }
    if (isSignUpPage && password2) {
        if (password !== password2) {
            setPassword2Error("Passwords do not match.");
        } else {
            setPassword2Error("");
        }
    } else {
        setPassword2Error("");
    }
  }, [password, password2, isSignUpPage]);


  const validate = (): boolean => {
    let isValid = true;
    if (!email) {
      setEmailError("Email is required.");
      isValid = false;
    } else {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setEmailError("Invalid email format.");
            isValid = false;
        } else {
            setEmailError("");
        }
    }

    if (!password) {
      setPasswordError("Password is required.");
      isValid = false;
    } else if (isSignUpPage && password.length < 8) {
      setPasswordError("Password must be at least 8 characters long.");
      isValid = false;
    } else {
      setPasswordError("");
    }

    if (isSignUpPage) {
      if (!password2) {
        setPassword2Error("Please confirm your password.");
        isValid = false;
      } else if (password !== password2) {
        setPassword2Error("Passwords do not match.");
        isValid = false;
      } else {
        setPassword2Error("");
      }
    }
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (formError && setFormError) setFormError(null);


    if (validate()) {
      if (isSignUpPage) {
        onSubmit(email, password, password2);
      } else {
        onSubmit(email, password);
      }
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Paper
        elevation={6}
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: 4,
          backgroundColor: 'background.paper'
        }}
      >
        <Typography component="h1" variant="h5" color="text.primary">
          {submitText}
        </Typography>
        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 1, width: '100%' }} noValidate>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={!!emailError}
            helperText={emailError}
            disabled={isLoading}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete={isSignUpPage ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={!!passwordError}
            helperText={passwordError}
            disabled={isLoading}
          />
          {isSignUpPage && (
            <TextField
              margin="normal"
              required
              fullWidth
              name="password2"
              label="Confirm Password"
              type="password"
              id="password2"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              error={!!password2Error}
              helperText={password2Error}
              disabled={isLoading}
            />
          )}

          {formError && (
            <Alert severity="error" sx={{ mt: 2, mb: 1, width: '100%' }}>
                {formError}
                {!isSignUpPage && formError.toLowerCase().includes("no active account found") && (
                    <>
                        <br />
                        <Link component={RouterLink} to="/sign_up" variant="body2" color="error.contrastText" sx={{fontWeight: 'bold'}}>
                            Sign Up here.
                        </Link>
                    </>
                )}
            </Alert>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            color={isSignUpPage ? "secondary" : "primary" }
            sx={{ mt: formError ? 1 : 3, mb: 2, position: 'relative' }}
            disabled={isLoading || !!emailError || !!passwordError || (isSignUpPage && !!password2Error)}
          >
            {isLoading ? (
              <CircularProgress size={24} sx={{ color: 'common.white', position: 'absolute' }} />
            ) : (
              submitText
            )}
          </Button>
          <Box sx={{ textAlign: 'center' }}>
            {isSignUpPage ? (
              <Typography variant="body2">
                Already have an account?{" "}
                <Link component={RouterLink} to="/login" variant="body2" color="secondary.main">
                  Login
                </Link>
              </Typography>
            ) : (
              <Typography variant="body2">
                Don't have an account?{" "}
                <Link component={RouterLink} to="/sign_up" variant="body2" color="primary.main">
                  Sign Up
                </Link>
              </Typography>
            )}
          </Box>
        </Box>
      </Paper>
    </Container>
  );
}
