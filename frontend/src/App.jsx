import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Ranking from './pages/Ranking';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { useState, createContext, useContext } from 'react';
import './i18n';

// Demo Context
const DemoContext = createContext();
export const useDemo = () => useContext(DemoContext);

import LoadingSpinner from './components/LoadingSpinner';

// Simple wrapper for protected routes
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const { demoMode } = useDemo();
  if (loading) return <LoadingSpinner fullScreen />;
  return (user || demoMode) ? children : <Navigate to="/register" />;
};

function AppContent() {
  const [demoMode, setDemoMode] = useState(false);
  const { isDark } = useTheme();

  return (
    <DemoContext.Provider value={{ demoMode, setDemoMode }}>
      <div className={`min-h-screen font-sans selection:bg-indigo-100 selection:text-indigo-900 transition-colors duration-300 ${isDark ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'}`}>
        <Navbar />
        <main className="relative">
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected Routes */}
            <Route path="/" element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } />
            <Route path="/rankings" element={
              <PrivateRoute>
                <Ranking />
              </PrivateRoute>
            } />
          </Routes>
        </main>
      </div>
    </DemoContext.Provider>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;

