import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Assets from './pages/Assets';
import TerminalPage from './pages/TerminalPage';
import FileManagementPage from './pages/FileManagementPage';
import Commands from './pages/Commands';
import History from './pages/History';
import Sessions from './pages/Sessions';
import Settings from './pages/Settings';
import Blacklist from './pages/Blacklist';
import Users from './pages/Users';
import HostGroups from './pages/HostGroups';
import Approvals from './pages/Approvals';
import Login from './pages/Login';
import SystemUsers from './pages/SystemUsers';
import UserGroups from './pages/UserGroups';
import PermissionRules from './pages/PermissionRules';
import Profile from './pages/Profile';
import { TerminalProvider } from './contexts/TerminalContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './i18n';

// 认证守卫组件
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

// 管理员路由守卫组件
const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <TerminalProvider>
          <Router>
            <Routes>
              {/* 登录页面（公开路由） */}
              <Route path="/login" element={<Login />} />
              
              {/* 需要认证的路由 */}
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Layout />
                  </PrivateRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="assets" element={<Assets />} />
                <Route path="terminal" element={<TerminalPage />} />
                <Route path="file-management" element={<FileManagementPage />} />
                <Route path="commands" element={<Commands />} />
                <Route path="history" element={<History />} />
                <Route path="approvals" element={<Approvals />} />
                <Route path="profile" element={<Profile />} />
                
                {/* 管理员专属路由 */}
                <Route
                  path="sessions"
                  element={
                    <AdminRoute>
                      <Sessions />
                    </AdminRoute>
                  }
                />
                <Route
                  path="system-users"
                  element={
                    <AdminRoute>
                      <SystemUsers />
                    </AdminRoute>
                  }
                />
                <Route
                  path="user-groups"
                  element={
                    <AdminRoute>
                      <UserGroups />
                    </AdminRoute>
                  }
                />
                <Route
                  path="permission-rules"
                  element={
                    <AdminRoute>
                      <PermissionRules />
                    </AdminRoute>
                  }
                />
                <Route
                  path="blacklist"
                  element={
                    <AdminRoute>
                      <Blacklist />
                    </AdminRoute>
                  }
                />
                <Route
                  path="users"
                  element={
                    <AdminRoute>
                      <Users />
                    </AdminRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <AdminRoute>
                      <Settings />
                    </AdminRoute>
                  }
                />
                <Route
                  path="host-groups"
                  element={
                    <AdminRoute>
                      <HostGroups />
                    </AdminRoute>
                  }
                />
              </Route>
            </Routes>
          </Router>
        </TerminalProvider>
      </SettingsProvider>
    </ThemeProvider>
  );
}

export default App;

