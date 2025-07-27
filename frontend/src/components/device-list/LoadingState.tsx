// frontend/src/components/device-list/LoadingState.tsx

import React from 'react';

const LoadingState: React.FC = () => (
  <div className="flex items-center justify-center h-64">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
  </div>
);

export default LoadingState;