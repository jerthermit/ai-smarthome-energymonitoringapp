// frontend/src/components/device-list/EmptyState.tsx

import React from 'react';

interface EmptyStateProps {
  searchTerm: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ searchTerm }) => (
  <div className="px-4 py-12 text-center">
    <svg
      className="mx-auto h-12 w-12 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
    <h3 className="mt-2 text-sm font-medium text-gray-900">
      {searchTerm ? 'No matching devices found' : 'No devices registered'}
    </h3>
    <p className="mt-1 text-sm text-gray-500">
      {searchTerm
        ? 'Try a different search term.'
        : 'Get started by adding your first device.'}
    </p>
  </div>
);

export default EmptyState;