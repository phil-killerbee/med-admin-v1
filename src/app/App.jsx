import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { RequireAuth, RequirePermission } from '../auth/RequireAuth';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { AppLayout } from './AppLayout';
import { appRoutes } from './navigation';
import LoginPage from '../features/auth/LoginPage';
import { ForbiddenPage, NotFoundPage } from '../features/errors/ErrorPages';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            {/* Tout ce qui suit exige d'être connecté */}
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                {appRoutes.map(({ path, anyOf, Component }) => (
                  <Route
                    key={path}
                    path={path}
                    element={
                      <RequirePermission anyOf={anyOf} home={path === '/'}>
                        <Component />
                      </RequirePermission>
                    }
                  />
                ))}
                <Route path="/403" element={<ForbiddenPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
