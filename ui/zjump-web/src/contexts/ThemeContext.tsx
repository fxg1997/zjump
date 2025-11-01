import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { ThemeProvider as MuiThemeProvider, createTheme, Theme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const savedMode = localStorage.getItem('themeMode');
    return (savedMode as ThemeMode) || 'light';
  });

  useEffect(() => {
    localStorage.setItem('themeMode', mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const theme = useMemo<Theme>(
    () =>
      createTheme({
        palette: {
          mode: mode === 'dark' ? 'light' : mode, // 护眼模式使用light的MUI组件样式
          ...(mode === 'light'
            ? {
                // 亮色主题
                primary: {
                  main: '#1a365d',
                  light: '#2d4a7c',
                  dark: '#0f2744',
                },
                secondary: {
                  main: '#3182ce',
                  light: '#4299e1',
                  dark: '#2c5aa0',
                },
                background: {
                  default: '#f7fafc',
                  paper: '#ffffff',
                },
                text: {
                  primary: '#2d3748',
                  secondary: '#718096',
                },
              }
            : {
                // 护眼模式 - 现代清新的浅灰蓝色调
                primary: {
                  main: '#5B7C99', // 柔和的蓝灰色
                  light: '#7B9BB8',
                  dark: '#3D5A70',
                },
                secondary: {
                  main: '#6B8BA3', // 清爽的蓝灰色
                  light: '#8AA4BA',
                  dark: '#4D6A7E',
                },
                background: {
                  default: '#E8EEF2', // 清新的浅灰蓝背景
                  paper: '#F3F6F8',   // 更浅的灰蓝纸张色
                },
                text: {
                  primary: '#3E3E3E',  // 柔和的深灰色文本
                  secondary: '#6B6B6B', // 中灰色次要文本
                },
                divider: 'rgba(107, 139, 163, 0.15)', // 淡蓝灰色分隔线
                success: {
                  main: '#7FA074',
                },
                info: {
                  main: '#5B7C99',
                },
                warning: {
                  main: '#C9A76B',
                },
                error: {
                  main: '#C07575',
                },
              }),
        },
        typography: {
          fontFamily: [
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            '"Helvetica Neue"',
            'Arial',
            'sans-serif',
          ].join(','),
          h4: {
            fontWeight: 600,
            letterSpacing: '-0.5px',
          },
          h5: {
            fontWeight: 600,
          },
          h6: {
            fontWeight: 600,
          },
        },
        shape: {
          borderRadius: 8,
        },
        shadows: (mode === 'light'
            ? [
                'none',
                '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              ]
            : [
                // 护眼模式使用更柔和的阴影
                'none',
                '0 1px 3px 0 rgba(91, 124, 153, 0.08), 0 1px 2px 0 rgba(91, 124, 153, 0.05)',
                '0 4px 6px -1px rgba(91, 124, 153, 0.1), 0 2px 4px -1px rgba(91, 124, 153, 0.06)',
                '0 10px 15px -3px rgba(91, 124, 153, 0.12), 0 4px 6px -2px rgba(91, 124, 153, 0.05)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
                '0 20px 25px -5px rgba(91, 124, 153, 0.14), 0 10px 10px -5px rgba(91, 124, 153, 0.04)',
              ]) as any,
      }),
    [mode]
  );

  return (
    <ThemeContext.Provider value={{ mode, toggleTheme }}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

