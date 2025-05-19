// frontend/src/theme.ts
import { createTheme } from '@mui/material/styles';

// Основні кольори:
const primaryBlue = '#2196f3'; // Синій для росту (MUI blue)
const secondaryOrange = '#ff9800'; // Оранжевий для спаду (MUI orange)
const paperBackground = '#252933'; // Темний фон для елементів
const defaultBackground = '#1e222d'; // Основний фон сторінки
const textColor = '#eaecef';

const theme = createTheme({
  palette: {
    mode: 'dark', // Включаємо темний режим MUI
    primary: {
      main: primaryBlue, // Синій - основний, використовується для акцентів росту
    },
    secondary: {
      main: secondaryOrange, // Оранжевий - вторинний, для акцентів спаду
    },
    background: {
      default: defaultBackground,
      paper: paperBackground,
    },
    text: {
      primary: textColor,
      secondary: '#b0bec5', // Трохи світліший сірий для вторинного тексту
    },
    error: { // Можна залишити стандартний червоний для помилок
      main: '#f44336',
    },
    success: { // Стандартний зелений для успіху (можна змінити на синій, якщо потрібно)
      main: '#4caf50',
    },
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
    h5: {
      fontWeight: 700,
      textAlign: 'center',
      marginBottom: '24px',
      color: textColor, // Заголовок форми
    },
    // Можна налаштувати інші варіанти типографії
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none', // Без верхнього регістру для кнопок
          padding: '10px 20px',
          fontWeight: 'bold',
        },
        // Кнопка "primary" (синя)
        containedPrimary: {
          '&:hover': {
            backgroundColor: '#1976d2', // Трохи темніший синій при ховері
          },
        },
        // Кнопка "secondary" (оранжева)
        containedSecondary: {
            color: '#fff', // Білий текст на оранжевій кнопці для кращого контрасту
          '&:hover': {
            backgroundColor: '#f57c00', // Трохи темніший оранжевий
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& label.Mui-focused': {
            color: primaryBlue, // Колір лейбла при фокусі
          },
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#4a4f5b', // Колір рамки
            },
            '&:hover fieldset': {
              borderColor: '#6a6f7b',
            },
            '&.Mui-focused fieldset': {
              borderColor: primaryBlue, // Колір рамки при фокусі
            },
          },
        },
      },
    },
    MuiPaper: { // Стилізація для Paper компонентів (наприклад, Card)
      styleOverrides: {
        root: {
          backgroundImage: 'none', // Вимикаємо градієнт за замовчуванням для темної теми MUI
        }
      }
    }
  },
});

export default theme;