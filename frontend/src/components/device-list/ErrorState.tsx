// frontend/src/components/device-list/ErrorState.tsx

import React from 'react';
import { Link } from 'react-router-dom';

const ErrorState: React.FC = () => (
  <div className="rounded-md bg-red-50 p-4">
    <div className="flex">
      <div className="flex-shrink-0">
        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3a1 1 0 002 0V7zm0 5a1 1 0 10-2 0 1 1 0 002 0z" />
        </svg>
      </div>
      <div className="ml-3">
        <h3 className="text-sm font-medium text-red-800">Error loading devices</h3>
        <div className="mt-2 text-sm text-red-700">
          <p>Failed to load device list. Please <Link to="" className="font-medium underline">try again</Link> later.</p>
        </div>
      </div>
    </div>
  </div>
);

export default ErrorState;