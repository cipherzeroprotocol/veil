import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
  icon?: string;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /**
   * Select label
   */
  label?: string;
  
  /**
   * Select options
   */
  options: SelectOption[] | SelectOptionGroup[];
  
  /**
   * Helper text shown below select
   */
  helperText?: string;
  
  /**
   * Error message
   */
  error?: string;
  
  /**
   * Full width select
   */
  fullWidth?: boolean;
  
  /**
   * Size of the select
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Additional class names
   */
  className?: string;
  
  /**
   * Left icon component
   */
  leftIcon?: React.ReactNode;
  
  /**
   * Show selected option details below select
   */
  showSelectedDetails?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({
    label,
    options,
    helperText,
    error,
    fullWidth = true,
    size = 'md',
    className,
    leftIcon,
    showSelectedDetails = false,
    ...props
  }, ref) => {
    const getSizeClass = () => {
      switch (size) {
        case 'sm':
          return 'py-1 text-xs';
        case 'md':
          return 'py-2 text-sm';
        case 'lg':
          return 'py-3 text-base';
        default:
          return 'py-2 text-sm';
      }
    };

    // Check if options are grouped
    const isGrouped = options.length > 0 && 'options' in options[0];
    
    // Helper to get the selected option details
    const getSelectedOption = () => {
      const selectedValue = props.value?.toString();
      
      if (isGrouped) {
        for (const group of options as SelectOptionGroup[]) {
          const found = group.options.find(opt => opt.value.toString() === selectedValue);
          if (found) return found;
        }
      } else {
        return (options as SelectOption[]).find(opt => opt.value.toString() === selectedValue);
      }
      
      return undefined;
    };
    
    const selectedOption = getSelectedOption();
    
    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        
        <div className="relative">
          <select
            ref={ref}
            className={twMerge(
              'block w-full pl-3 pr-10 border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md',
              leftIcon ? 'pl-10' : 'pl-3',
              getSizeClass(),
              error ? 'border-red-300 text-red-900' : 'border-gray-300 text-gray-900',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            {...props}
          >
            {isGrouped ? (
              (options as SelectOptionGroup[]).map((group, groupIndex) => (
                <optgroup key={groupIndex} label={group.label}>
                  {group.options.map((option, optionIndex) => (
                    <option
                      key={`${groupIndex}-${optionIndex}`}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </optgroup>
              ))
            ) : (
              (options as SelectOption[]).map((option, index) => (
                <option
                  key={index}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))
            )}
          </select>
          
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              {leftIcon}
            </div>
          )}
          
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
        
        {error && (
          <p className="mt-1 text-sm text-red-600">
            {error}
          </p>
        )}
        
        {!error && helperText && (
          <p className="mt-1 text-sm text-gray-500">
            {helperText}
          </p>
        )}
        
        {showSelectedDetails && selectedOption && (
          <div className="mt-2 flex items-center">
            {selectedOption.icon && (
              <img
                src={selectedOption.icon}
                alt={selectedOption.label}
                className="h-5 w-5 mr-2"
              />
            )}
            <span className="text-sm text-gray-500">
              {selectedOption.label}
            </span>
          </div>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;