// src/pages/Register.tsx
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { Zap } from 'lucide-react';
import Footer from '../components/layout/Footer';

const Register: React.FC = () => {
  const [formData, setFormData] = useState({
    email: '',
    full_name: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const { register, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'AI Smart Home Energy Monitor | Register';
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return setError("Passwords don't match");
    }
    if (!formData.full_name.trim()) {
      return setError('Full name is required');
    }
    if (formData.password.length < 8) {
      return setError('Password must be at least 8 characters long');
    }
    setError('');
    try {
      await register({
        email: formData.email,
        full_name: formData.full_name,
        password: formData.password,
      });
      navigate('/login');
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(
        err.response?.data?.detail ||
        err.message ||
        'Failed to create an account. Please try again.'
      );
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Animated Header with Lightning */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 100, damping: 10 }}
            className="relative inline-block"
          >
            <h1 className="text-center text-4xl font-extrabold text-foreground">
              AI Smart Home Energy Monitor
            </h1>
            <motion.div
              initial={{ opacity: 0, x: 0, y: 0 }}
              animate={{
                opacity: [0, 0.3, 0],
                x: [0, 8, -8],
                y: [0, -8, 8],
              }}
              transition={{ repeat: 1, duration: 0.6, ease: 'easeInOut', delay: 0.5 }}
              className="absolute top-0 right-0 text-primary"
            >
              <Zap size={32} strokeWidth={2} />
            </motion.div>
          </motion.div>

          {/* Form Title */}
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
              Create a new account
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Or{' '}
              <Link to="/login" className="font-medium text-primary hover:text-primary/90">
                sign in to your existing account
              </Link>
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-destructive/10 border-l-4 border-destructive p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-destructive"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Registration Form */}
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="full-name" className="sr-only">Full Name</label>
                <input
                  id="full-name"
                  name="full_name"
                  type="text"
                  autoComplete="name"
                  required
                  className="appearance-none rounded-t-md relative block w-full px-3 py-2 border border-input bg-background placeholder:text-muted-foreground/50 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:z-10 sm:text-sm"
                  placeholder="Full name"
                  value={formData.full_name}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label htmlFor="email-address" className="sr-only">Email address</label>
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-t-0 border-input bg-background placeholder:text-muted-foreground/50 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:z-10 sm:text-sm"
                  placeholder="Email address"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">Password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none relative block w-full px-3 py-2 border border-t-0 border-input bg-background placeholder:text-muted-foreground/50 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:z-10 sm:text-sm"
                  placeholder="Password"
                  value={formData.password}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="sr-only">Confirm Password</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="appearance-none rounded-b-md relative block w-full px-3 py-2 border border-t-0 border-input bg-background placeholder:text-muted-foreground/50 text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:z-10 sm:text-sm"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isLoading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default Register;