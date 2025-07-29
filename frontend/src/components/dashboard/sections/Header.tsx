// frontend/src/components/dashboard/sections/Header.tsx
import React from 'react';

const Header: React.FC = () => {
  return (
    <div className="my-6 px-4 sm:px-6 lg:px-8 text-center">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
      <p className="mt-1 text-sm sm:text-base text-muted-foreground">
        Here are your latest real-time energy metrics.
      </p>
    </div>
  );
};

export default Header;
