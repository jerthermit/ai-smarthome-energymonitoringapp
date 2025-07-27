import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils';

interface PrivateRouteProps {
  children: ReactNode;
}

const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className={cn(
          'h-12 w-12 rounded-full',
          'border-2 border-muted-foreground/20',
          'border-t-primary border-r-primary',
          'animate-spin'
        )} />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  const location = useLocation();

  if (!isAuthenticated) {
    // Store the current location they were trying to access
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
};

export default PrivateRoute;
