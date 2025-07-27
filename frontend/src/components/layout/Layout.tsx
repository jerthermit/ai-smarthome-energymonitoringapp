import { Link, useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatbotWidget } from '../chatbot/ChatbotWidget';
import { useAuth } from '../../context/AuthContext';
import { cn } from '../../utils';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Icons } from '../shared/icons';

const Layout = () => {
  const location = useLocation();
  const { user, logout } = useAuth();
  
  // Get user display info with safe defaults
  const userDisplayName = user?.email?.split('@')[0] || 'User';
  const userInitial = userDisplayName.charAt(0).toUpperCase();
  const userRole = user?.is_superuser ? 'Admin' : 'User';

  // Navigation items with icons - Only Dashboard remains
  const navItems = [
    { 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: <Icons.dashboard className="h-4 w-4" /> 
    }
  ];

  // Check if current route matches nav item
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex flex-col">
      {/* Navigation */}
      <header className="sticky top-0 z-50 w-full border-b border-primary/10 bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 shadow-sm">
        <div className="container flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center space-x-8">
            <Link to="/" className="flex items-center space-x-2 group">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary to-secondary shadow-lg">
                <Icons.bolt className="h-5 w-5 text-primary-foreground group-hover:scale-110 transition-transform" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Energy Monitor
              </span>
            </Link>
            
            <nav className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={cn(
                      'inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50',
                      active
                        ? 'bg-gradient-to-r from-primary/5 to-primary/10 text-primary shadow-sm ring-1 ring-primary/10' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/30 hover:shadow-sm'
                    )}
                  >
                    <span className={cn('mr-2', active ? 'text-primary' : 'text-muted-foreground')}>
                      {item.icon}
                    </span>
                    {item.name}
                    {active && (
                      <motion.span 
                        className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary to-secondary"
                        layoutId="activeNav"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
          
          {user && (
            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative h-9 w-9 rounded-full p-0 overflow-hidden group"
                  >
                    <span className="sr-only">Open user menu</span>
                    <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground font-medium shadow-md">
                      <span className="relative z-10">{userInitial}</span>
                      <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-secondary/80 opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {user?.email || userDisplayName}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {userRole}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="cursor-pointer">
                      <Icons.user className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link to="/settings" className="cursor-pointer">
                      <Icons.settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={logout}
                    className="text-destructive focus:text-destructive cursor-pointer"
                  >
                    <Icons.logout className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <div className="container py-6 px-4 sm:px-6">
              <Outlet />
            </div>
          </motion.div>
        </AnimatePresence>
      </main>
      
      {/* Footer */}
      <footer className="border-t py-6 bg-muted/20">
        <div className="container px-4 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex flex-col items-center gap-4 px-8 md:flex-row md:gap-2 md:px-0">
              <Icons.bolt className="h-6 w-6 text-primary" />
              <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                &copy; {new Date().getFullYear()} Energy Monitor. All rights reserved.
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Contact
              </a>
            </div>
          </div>
        </div>
      </footer>
      
      {/* Chatbot Widget */}
      <ChatbotWidget />
    </div>
  );
};

export default Layout;
