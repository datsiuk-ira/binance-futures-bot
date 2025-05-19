// frontend/src/pages/profile.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchProfile } from "../api/auth";
import {
  Container,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Box,
  List,
  ListItem,
  ListItemText,
  Divider,
  Alert
} from "@mui/material";
import { toast } from 'react-toastify';
import LogoutIcon from '@mui/icons-material/Logout'; // Іконка для кнопки

interface ProfileData {
  email: string;
  balance: string;
  leverage: number;
  risk_percentage: number;
  trade_mode: string;
  binance_api_key?: string;
  // date_joined: string; // Можна додати, якщо потрібно
}

export default function Profile() {
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetchProfile();
        setProfileData(response.data);
      } catch (err: any) {
        console.error("Failed to fetch profile:", err);
        setError("Could not load profile data. You might be logged out.");
        // Interceptor в axiosInstance повинен обробити 401 та перенаправити на /login
        // але якщо токена немає зовсім, то краще перевірити і перенаправити тут теж
        if (!localStorage.getItem('accessToken')) {
            navigate("/login");
        }
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    toast.info("You have been logged out.");
    navigate("/login");
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error && !profileData) { // Показуємо помилку тільки якщо дані не завантажені
    return (
        <Container maxWidth="sm" sx={{mt: 4}}>
             <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>
             <Button variant="contained" onClick={() => navigate("/login")}>Go to Login</Button>
        </Container>
    );
  }


  return profileData ? (
    <Container component="main" maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ padding: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center', color: 'primary.main' }}>
          User Profile
        </Typography>
        <List>
          <ListItem disablePadding>
            <ListItemText primary="Email" secondary={profileData.email} />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText
                primary="Balance"
                secondary={`$${parseFloat(profileData.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText primary="Leverage" secondary={`${profileData.leverage}x`} />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText primary="Risk per Trade" secondary={`${profileData.risk_percentage}%`} />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText primary="Trade Mode" secondary={profileData.trade_mode} />
          </ListItem>
          <Divider component="li" sx={{ my: 1 }} />
          <ListItem disablePadding>
            <ListItemText primary="Binance API Key" secondary={profileData.binance_api_key ? "Configured" : "Not Configured"} />
          </ListItem>
        </List>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <Button
            variant="contained"
            color="secondary" // Оранжева кнопка для виходу
            onClick={handleLogout}
            startIcon={<LogoutIcon />}
          >
            Logout
          </Button>
        </Box>
      </Paper>
    </Container>
  ) : (
     <Container maxWidth="sm" sx={{mt: 4}}>
        <Alert severity="warning">Could not load profile data. Please try logging in again.</Alert>
     </Container>
  );
}
