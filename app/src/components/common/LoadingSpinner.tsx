import React from 'react';
import { twMerge } from 'tailwind-merge';

export type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

export interface LoadingSpinnerProps {
  /**
   * Size of the spinner
   */
  size?: SpinnerSize;
  
  /**
   * Color of the spinner (Tailwind color class without the text- prefix)
   */
  color?: string;
  
  /**
   * Text displayed next to spinner
   */
  text?: string;
  
  /**
   * Additional class names
   */
  className?: string;
  
  /**
   * Center the spinner in its container
   */
  centered?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  color = 'indigo-600',
  text,
  className,
  centered = false
}) => {
  const getSizeClass = () => {
    switch (size) {
      case 'sm':
        return 'h-4 w-4';
      case 'md':
        return 'h-6 w-6';
      case 'lg':
        return 'h-8 w-8';
      case 'xl':
        return 'h-12 w-12';
      default:
        return 'h-6 w-6';
    }
  };

  const getTextSizeClass = () => {
    switch (size) {
      case 'sm':
        return 'text-xs';
      case 'md':
        return 'text-sm';
      case 'lg':
        return 'text-base';
      case 'xl':
        return 'text-lg';
      default:
        return 'text-sm';
    }
  };

  return (
    <div className={twMerge(
      'flex items-center',
      centered ? 'justify-center' : '',
      className
    )}>
      <svg
        className={twMerge(
          `animate-spin text-${color}`,
          getSizeClass()
        )}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        data-testid="loading-spinner"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      
      {text && (
        <span className={twMerge(
          `ml-2 font-medium text-${color}`,
          getTextSizeClass()
        )}>
          {text}
        </span>
      )}
    </div>
  );
};

export default LoadingSpinner;