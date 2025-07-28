// frontend/src/components/dashboard/sections/Header.tsx

import React, { useState, useEffect } from 'react';
import { getGreeting, formatTime, formatDate } from '../../../utils/timeUtils';
import { useAuth } from '../../../contexts/AuthContext';

const Header: React.FC = () => {
  const { user } = useAuth();
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [greeting, setGreeting] = useState<string>(getGreeting());
  const [displayTime, setDisplayTime] = useState<string>(formatTime());
  const [displayDate, setDisplayDate] = useState<string>(formatDate());
  
  // Get user's first name or fallback to empty string
  const userName = user?.full_name?.split(' ')[0] || '';

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      setDisplayTime(formatTime(now));
      setDisplayDate(formatDate(now));
      
      // Update greeting only when the time of day changes
      const hour = now.getHours();
      if (hour !== currentTime.getHours()) {
        setGreeting(getGreeting());
      }
    }, 60000); // Update every minute

    return () => clearInterval(timer);
  }, [currentTime]);

  return (
    <header className="mb-6 sm:mb-8 px-1">
      <div className="max-w-7xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Dashboard
          </h1>
          
          <div className="flex flex-col gap-1">
            <p className="text-sm sm:text-base text-muted-foreground">
              {userName ? `${greeting}, ${userName}!` : `${greeting}!`} It is {displayTime}, {displayDate}.
            </p>
            <p className="text-sm sm:text-base text-muted-foreground max-w-3xl">
          Here are your latest real-time smart home energy consumption metrics.
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;