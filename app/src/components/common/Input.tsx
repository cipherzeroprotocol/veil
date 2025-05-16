import React, { forwardRef } from 'react';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /**
   * Input label
   */
  label?: string;
  
  /**
   * Helper text shown below input
   */
  helperText?: string;
  
  /**
   * Error message
   */
  error?: string;
  
  /**
   * Success state
   */
  isSuccess?: boolean;
  
  /**
   * Full width input
   */
  fullWidth?: boolean;
  
  /**
   * Additional class names
   */
  className?: string;
  
  /**
   * Right addon (icon or button)
   */
  rightAddon?: React.ReactNode;
  
  /**
   * Left addon (icon)
   */
  leftAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ 
    label, 
    helperText, 
    error, 
    isSuccess, 
    fullWidth = true, 
    className,
    rightAddon,
    leftAddon,
    ...props 
  }, ref) => {
    const getInputClasses = () => {
      const baseClasses = 'block px-3 py-2 border rounded-md focus:outline-none focus:ring-1 sm:text-sm';
      
      if (error) {
        return `${baseClasses} border-red-300 text-red-900 placeholder-red-300 focus:ring-red-500 focus:border-red-500`;
      }
      
      if (isSuccess) {
        return `${baseClasses} border-green-300 text-green-900 placeholder-green-300 focus:ring-green-500 focus:border-green-500`;
      }
      
      return `${baseClasses} border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-indigo-500 focus:border-indigo-500`;
    };

    return (
      <div className={fullWidth ? 'w-full' : ''}>
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {label}
          </label>
        )}
        
        <div className="relative rounded-md shadow-sm">
          {leftAddon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              {leftAddon}
            </div>
          )}
          
          <input
            ref={ref}
            className={twMerge(
              getInputClasses(),
              leftAddon ? 'pl-10' : '',
              rightAddon ? 'pr-10' : '',
              fullWidth ? 'w-full' : '',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${props.id}-error` : helperText ? `${props.id}-helper` : undefined}
            {...props}
          />
          
          {rightAddon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              {rightAddon}
            </div>
          )}
        </div>
        
        {error && (
          <p className="mt-1 text-sm text-red-600" id={`${props.id}-error`}>
            {error}
          </p>
        )}
        
        {!error && helperText && (
          <p className="mt-1 text-sm text-gray-500" id={`${props.id}-helper`}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;