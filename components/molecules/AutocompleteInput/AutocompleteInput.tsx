import { useState, useRef, useEffect, useMemo } from 'react';
import { Input } from '@/components/atoms';
import { useTheme } from '@/hooks/useTheme';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  disabled?: boolean;
}

export function AutocompleteInput({
  value,
  onChange,
  onSelect,
  suggestions,
  placeholder = 'Type to search...',
  disabled = false,
}: AutocompleteInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();

  // Filter suggestions based on input value using useMemo
  const filteredSuggestions = useMemo(() => {
    if (value.length >= 2) {
      return suggestions
        .filter((suggestion) =>
          suggestion.toLowerCase().includes(value.toLowerCase()),
        )
        .slice(0, 10); // Limit to 10 suggestions
    }
    return [];
  }, [value, suggestions]);

  // Show suggestions when we have filtered results and input is focused
  const showSuggestions = isFocused && filteredSuggestions.length > 0;

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsFocused(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  const handleSuggestionClick = (suggestion: string) => {
    onSelect(suggestion);
    setIsFocused(false);
  };

  const handleClear = () => {
    onChange('');
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setIsFocused(false);
    }
  };

  const clearButtonClasses =
    theme === 'dark'
      ? 'absolute top-1/2 right-2 -translate-y-1/2 text-gray-500 hover:text-gray-300 focus:outline-none'
      : 'absolute top-1/2 right-2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none';

  const dropdownClasses =
    theme === 'dark'
      ? 'absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-600 bg-gray-800 shadow-lg sm:max-h-60'
      : 'absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg sm:max-h-60';

  const suggestionClasses =
    theme === 'dark'
      ? 'block w-full px-4 py-3 text-left text-sm transition-colors hover:bg-gray-700 focus:bg-gray-700 focus:outline-none sm:text-base dark:text-gray-100'
      : 'block w-full px-4 py-3 text-left text-sm transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none sm:text-base';

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-10"
        />
        {value && !disabled && (
          <button
            onClick={handleClear}
            className={clearButtonClasses}
            aria-label="Clear input"
            type="button"
          >
            <svg
              className="h-4 w-4 sm:h-5 sm:w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && (
        <div className={dropdownClasses}>
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={suggestion}
              onClick={() => handleSuggestionClick(suggestion)}
              className={`${suggestionClasses} ${
                index === 0 ? 'rounded-t-lg' : ''
              } ${
                index === filteredSuggestions.length - 1 ? 'rounded-b-lg' : ''
              }`}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
