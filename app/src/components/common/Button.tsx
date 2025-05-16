import React from 'react';
import { twMerge } from 'tailwind-merge';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Button visual style variant
   */
  variant?: ButtonVariant;
  
  /**
   * Button size
   */
  size?: ButtonSize;
  
  /**
   * Is the button currently loading
   */
  isLoading?: boolean;
  
  /**
   * Full width button
   */
  fullWidth?: boolean;
  
  /**
   * Icon to display before text
   */
  leftIcon?: React.ReactNode;
  
  /**
   * Icon to display after text
   */
  rightIcon?: React.ReactNode;
  
  /**
   * Additional class names
   */
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className,
  ...props
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500 border-transparent';
      case 'secondary':
        return 'bg-indigo-100 hover:bg-indigo-200 text-indigo-700 focus:ring-indigo-500 border-transparent';
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 border-transparent';
      case 'outline':
        return 'bg-transparent hover:bg-gray-50 text-indigo-700 border-indigo-500 focus:ring-indigo-500';
      case 'ghost':
        return 'bg-transparent hover:bg-gray-50 text-gray-700 border-transparent focus:ring-gray-500';
      default:
        return 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500 border-transparent';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'py-1 px-3 text-sm';
      case 'md':
        return 'py-2 px-4 text-sm';
      case 'lg':
        return 'py-3 px-6 text-base';
      default:
        return 'py-2 px-4 text-sm';
    }
  };

  const getWidthClass = () => {
    return fullWidth ? 'w-full' : '';
  };

  const getDisabledClass = () => {
    return disabled || isLoading
      ? 'opacity-60 cursor-not-allowed'
      : '';
  };

  const baseClasses = 'inline-flex justify-center items-center border font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200';

  return (
    <button
      disabled={disabled || isLoading}
      className={twMerge(
        baseClasses,
        getVariantClasses(),
        getSizeClasses(),
        getWidthClass(),
        getDisabledClass(),
        className
      )}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center">
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Loading...</span>
        </span>
      ) : (
        <span className="flex items-center">
          {leftIcon && <span className="mr-2">{leftIcon}</span>}
          {children}
          {rightIcon && <span className="ml-2">{rightIcon}</span>}
        </span>
      )}
    </button>
  );
};

export default Button;