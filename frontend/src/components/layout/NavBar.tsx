// frontend/src/components/layout/NavBar.tsx
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getGreeting, formatTime, formatDate } from '../../utils/timeUtils';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '../ui/dropdown-menu';
import { Icons } from '../shared/icons';
import { cn } from '../../utils';

const NavBar: React.FC = () => {
  const location = useLocation();
  const { user, logout } = useAuth();

  // Time & greeting
  const [now, setNow] = useState<Date>(new Date());
  const [greeting, setGreeting] = useState(getGreeting());
  const [timeStr, setTimeStr] = useState(formatTime(now));
  const [dateStr, setDateStr] = useState(formatDate(now));

  useEffect(() => {
    const interval = setInterval(() => {
      const current = new Date();
      setNow(current);
      setTimeStr(formatTime(current));
      setDateStr(formatDate(current));
      if (current.getHours() !== now.getHours()) {
        setGreeting(getGreeting());
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [now]);

  const userName = user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'User';
  const userRole = user?.is_superuser ? 'Admin' : 'User';

  // Nav items (unused)
  const navItems: { name: string; href: string; icon: React.ReactNode }[] = [];
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-primary/10 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <Link to="/" className="flex items-center space-x-3">
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-secondary shadow-md">
            <Icons.dashboard className="h-6 w-6 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            AI Smart Home Energy Monitor
          </span>
        </Link>

        {/* Spacer */}
        <div />

        {/* User greeting and menu */}
        {user && (
          <div className="flex items-center space-x-4">
            <span className="hidden md:block text-sm text-foreground font-medium">
  {`${greeting}${userName ? `, ${userName}` : ''}! It’s ${timeStr}, ${dateStr}.`}
</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open user menu">
                  <Icons.user className="h-5 w-5 text-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={4}>
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{userName}</span>
                    <span className="text-xs text-muted-foreground">{userRole}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/profile" className="flex items-center gap-2">
                    <Icons.user className="h-4 w-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="flex items-center gap-2">
                    <Icons.settings className="h-4 w-4" /> Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={logout} className="flex items-center gap-2 text-destructive">
                  <Icons.logout className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </header>
  );
};

export default NavBar;
