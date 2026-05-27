import { createTheme } from '@mui/material/styles';
import { cyan, teal, grey } from '@mui/material/colors';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: cyan[400],
      light: cyan[200],
      dark: cyan[700],
    },
    secondary: {
      main: teal[400],
      light: teal[200],
      dark: teal[700],
    },
    background: {
      default: '#050508',
      paper: '#0d0d14',
    },
    text: {
      primary: '#e8eaf6',
      secondary: grey[400],
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h6: { fontWeight: 600, letterSpacing: '0.05em' },
    caption: { letterSpacing: '0.08em' },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: { color: cyan[400] },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', letterSpacing: '0.05em' },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderColor: 'rgba(255,255,255,0.1)',
          '&.Mui-selected': {
            borderColor: cyan[400],
          },
        },
      },
    },
  },
});

export default theme;
