import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  Typography,
  Divider,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  CssBaseline,
  useTheme,
  Avatar,
  Badge,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Storage as StorageIcon,
  Terminal as TerminalIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  ChevronLeft as ChevronLeftIcon,
  Computer as ComputerIcon,
  Code as CodeIcon,
  PlayCircle as PlayCircleIcon,
  Logout as LogoutIcon,
  Person as PersonIcon,
  Security as SecurityIcon,
  People as PeopleIcon,
  Brightness4 as Brightness4Icon,
  Brightness7 as Brightness7Icon,
  Group as GroupIcon,
  Language as LanguageIcon,
  Assignment as AssignmentIcon,
} from '@mui/icons-material';
import { useTerminal } from '../contexts/TerminalContext';
import { useSettings } from '../contexts/SettingsContext';
import { useTheme as useCustomTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

const drawerWidth = 240; // Web 优化：减小侧边栏宽度

interface MenuItem {
  text: string;
  icon: React.ReactElement;
  path: string;
  adminOnly?: boolean; // 是否仅管理员可见
}

// 菜单项的键值，用于国际化
const menuItemsConfig = [
  { key: 'dashboard', icon: <DashboardIcon />, path: '/' },
  { key: 'assets', icon: <StorageIcon />, path: '/assets' },
  { key: 'terminal', icon: <TerminalIcon />, path: '/terminal' },
  { key: 'systemUsers', icon: <PersonIcon />, path: '/system-users', adminOnly: true },
  { key: 'userGroups', icon: <GroupIcon />, path: '/user-groups', adminOnly: true },
  { key: 'hostGroups', icon: <GroupIcon />, path: '/host-groups', adminOnly: true },
  { key: 'permissionRules', icon: <SecurityIcon />, path: '/permission-rules', adminOnly: true },
  { key: 'approvals', icon: <AssignmentIcon />, path: '/approvals' },
  { key: 'commands', icon: <CodeIcon />, path: '/commands', adminOnly: true },
  { key: 'sessions', icon: <PlayCircleIcon />, path: '/sessions', adminOnly: true },
  { key: 'history', icon: <HistoryIcon />, path: '/history' },
  { key: 'blacklist', icon: <SecurityIcon />, path: '/blacklist', adminOnly: true },
  { key: 'users', icon: <PeopleIcon />, path: '/users', adminOnly: true },
  { key: 'profile', icon: <PersonIcon />, path: '/profile' },
  { key: 'settings', icon: <SettingsIcon />, path: '/settings', adminOnly: true },
];

export default function Layout() {
  const theme = useTheme();
  const { mode, toggleTheme } = useCustomTheme();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { sessions } = useTerminal();
  const { settings } = useSettings();
  const [open, setOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [langAnchorEl, setLangAnchorEl] = useState<null | HTMLElement>(null);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const username = user.username || 'User';
  const userRole = user.role || 'user'; // 获取用户角色

  // 根据角色过滤菜单项
  const filteredMenuItems = menuItemsConfig.filter(item => {
    if (item.adminOnly && userRole !== 'admin') {
      return false;
    }
    return true;
  });

  const handleDrawerToggle = () => {
    setOpen(!open);
  };

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLangMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setLangAnchorEl(event.currentTarget);
  };

  const handleLangMenuClose = () => {
    setLangAnchorEl(null);
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
    handleLangMenuClose();
  };

  const handleLogout = () => {
    // JWT token是无状态的，直接清除本地存储即可
    // 不需要调用后端API，避免token过期时显示"登录已过期"的提示
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // 跳转到登录页
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: theme.palette.background.default }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: theme.palette.background.paper,
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <IconButton
              aria-label="toggle drawer"
              onClick={handleDrawerToggle}
              edge="start"
              sx={{ 
                mr: 2,
                color: theme.palette.text.primary,
              }}
            >
              {open ? <ChevronLeftIcon /> : <MenuIcon />}
            </IconButton>
            <Avatar
              sx={{
                mr: 1.5,
                bgcolor: theme.palette.primary.main,
                width: 38,
                height: 38,
              }}
            >
              <ComputerIcon />
            </Avatar>
            <Box>
              <Typography 
                variant="h6" 
                noWrap 
                component="div" 
                sx={{ 
                  fontWeight: 600,
                  color: theme.palette.primary.main,
                  letterSpacing: '-0.3px',
                }}
              >
                {settings?.siteName?.split(' ')[0] || 'ZJump'}
              </Typography>
              <Typography 
                variant="caption" 
                sx={{ 
                  color: theme.palette.text.secondary,
                  fontSize: '0.7rem',
                }}
              >
                {t('common.systemSubtitle')}
              </Typography>
            </Box>
          </Box>

          {/* 工具栏：语言切换、主题切换、用户菜单 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* 语言切换 */}
            <Tooltip title={t('settings.language')}>
              <IconButton
                onClick={handleLangMenuOpen}
                size="small"
                sx={{ color: theme.palette.text.primary }}
              >
                <LanguageIcon />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={langAnchorEl}
              open={Boolean(langAnchorEl)}
              onClose={handleLangMenuClose}
            >
              <MenuItem 
                onClick={() => handleLanguageChange('zh')}
                selected={i18n.language === 'zh'}
              >
                🇨🇳 中文
              </MenuItem>
              <MenuItem 
                onClick={() => handleLanguageChange('en')}
                selected={i18n.language === 'en'}
              >
                🇺🇸 English
              </MenuItem>
            </Menu>

            {/* 主题切换 */}
            <Tooltip title={mode === 'dark' ? t('settings.lightMode') : t('settings.comfortMode')}>
              <IconButton
                onClick={toggleTheme}
                size="small"
                sx={{ color: theme.palette.text.primary }}
              >
                {mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
              </IconButton>
            </Tooltip>

            <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

            <Typography variant="body2" sx={{ color: theme.palette.text.secondary, mr: 1 }}>
              {username}
            </Typography>
            <Tooltip title={t('common.actions')}>
              <IconButton
                onClick={handleMenuOpen}
                size="small"
                sx={{ color: theme.palette.text.primary }}
              >
                <Avatar sx={{ width: 32, height: 32, bgcolor: '#667eea' }}>
                  <PersonIcon fontSize="small" />
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem onClick={() => { navigate('/profile'); handleMenuClose(); }}>
                <ListItemIcon>
                  <PersonIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('menu.profile')}</ListItemText>
              </MenuItem>
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>{t('login.logout')}</ListItemText>
              </MenuItem>
            </Menu>
          </Box>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="persistent"
        open={open}
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: drawerWidth,
            boxSizing: 'border-box',
            backgroundColor: theme.palette.background.paper,
            borderRight: `1px solid ${theme.palette.divider}`,
          },
        }}
      >
        <Toolbar />
        <Box sx={{ overflow: 'auto', mt: 3, px: 2 }}>
          <List>
            {filteredMenuItems.map((item) => (
              <ListItem key={item.key} disablePadding sx={{ mb: 0.5 }}>
                <ListItemButton
                  selected={location.pathname === item.path}
                  onClick={() => {
                    // 如果跳转到终端页面，保存当前路径
                    if (item.path === '/terminal') {
                      sessionStorage.setItem('terminal_previous_path', location.pathname);
                    }
                    navigate(item.path);
                  }}
                  sx={{
                    borderRadius: 1.5,
                    py: 1.2,
                    px: 2,
                    '&.Mui-selected': {
                      backgroundColor: mode === 'dark' ? 'rgba(91, 124, 153, 0.15)' : '#ebf4ff',
                      color: theme.palette.primary.main,
                      '&:hover': {
                        backgroundColor: mode === 'dark' ? 'rgba(91, 124, 153, 0.22)' : '#dbeafe',
                      },
                    },
                    '&:hover': {
                      backgroundColor: mode === 'dark' ? 'rgba(139, 157, 119, 0.08)' : '#f7fafc',
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: location.pathname === item.path 
                        ? theme.palette.primary.main 
                        : theme.palette.text.secondary,
                      minWidth: 42,
                    }}
                  >
                    {item.path === '/terminal' && sessions.length > 0 ? (
                      <Badge 
                        badgeContent={sessions.length} 
                        color="primary"
                        max={99}
                      >
                        {item.icon}
                      </Badge>
                    ) : (
                      item.icon
                    )}
                  </ListItemIcon>
                  <ListItemText 
                    primary={t(`menu.${item.key}`)}
                    primaryTypographyProps={{
                      fontSize: '0.9rem',
                      fontWeight: location.pathname === item.path ? 600 : 500,
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
          <Divider sx={{ my: 3 }} />
          <Box sx={{ px: 2, pb: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
              © 2025 ZJump v0.1.0
            </Typography>
          </Box>
        </Box>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: (location.pathname === '/terminal' || location.pathname === '/file-management') ? 0 : 3,
          width: { sm: `calc(100% - ${open && location.pathname !== '/terminal' && location.pathname !== '/file-management' ? drawerWidth : 0}px)` },
          ml: open && location.pathname !== '/terminal' && location.pathname !== '/file-management' ? 0 : `-${drawerWidth}px`,
          transition: theme.transitions.create(['margin', 'width'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.leavingScreen,
          }),
          minHeight: '100vh',
          backgroundColor: theme.palette.background.default,
          overflow: (location.pathname === '/terminal' || location.pathname === '/file-management') ? 'hidden' : 'auto',
        }}
      >
        {(location.pathname !== '/terminal' && location.pathname !== '/file-management') && <Toolbar />}
        <Box sx={{ mt: (location.pathname === '/terminal' || location.pathname === '/file-management') ? 0 : 3, height: (location.pathname === '/terminal' || location.pathname === '/file-management') ? '100vh' : 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}


