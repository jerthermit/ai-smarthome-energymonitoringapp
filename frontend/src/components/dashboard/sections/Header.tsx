// frontend/src/components/dashboard/sections/Header.tsx

import React from 'react';

const Header: React.FC = () => (
  <header className="mb-6 sm:mb-8">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
      <div className="space-y-0.5">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          Energy Dashboard
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Monitor and analyze your home energy consumption
        </p>
      </div>
    </div>
  </header>
);

export default Header;