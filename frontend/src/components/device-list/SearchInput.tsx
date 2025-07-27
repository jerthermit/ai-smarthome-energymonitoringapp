// frontend/src/components/device-list/SearchInput.tsx

import React from 'react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

const SearchInput: React.FC<SearchInputProps> = ({ value, onChange }) => (
  <div className="w-full sm:w-64">
    <input
      type="text"
      placeholder="Search devices..."
      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  </div>
);

export default SearchInput;