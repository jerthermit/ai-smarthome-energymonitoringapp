// frontend/src/components/layout/Layout.tsx
import { useLocation, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import NavBar from './NavBar';
import Footer from './Footer';
import { ChatbotWidget } from '../chatbot/ChatbotWidget';

const Layout = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30 flex flex-col">
      <NavBar />

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
            <div className="container py-4 px-3 sm:px-4 md:py-6 md:px-6">
              <Outlet />
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      <Footer />

      <ChatbotWidget />
    </div>
  );
};

export default Layout;