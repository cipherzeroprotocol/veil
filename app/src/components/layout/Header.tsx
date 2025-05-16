import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import Button from '../common/Button';

const Header: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  
  // Helper to check if a nav link is active
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <span className="text-2xl font-bold text-purple-700">SolanaVeil</span>
            </Link>
            
            <nav className="hidden md:ml-8 md:flex md:space-x-8">
              <NavLink to="/" isActive={isActive('/')}>Home</NavLink>
              <NavLink to="/deposit" isActive={isActive('/deposit')}>Deposit</NavLink>
              <NavLink to="/withdraw" isActive={isActive('/withdraw')}>Withdraw</NavLink>
            </nav>
          </div>
          
          <div className="flex items-center">
            <WalletMultiButton className="!bg-purple-700 !py-2" />
            
            {/* Mobile menu button */}
            <div className="md:hidden ml-4">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 text-gray-500"
                aria-label="Toggle menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <MobileNavLink to="/" isActive={isActive('/')}>Home</MobileNavLink>
            <MobileNavLink to="/deposit" isActive={isActive('/deposit')}>Deposit</MobileNavLink>
            <MobileNavLink to="/withdraw" isActive={isActive('/withdraw')}>Withdraw</MobileNavLink>
          </div>
        </div>
      )}
    </header>
  );
};

// Helper components
const NavLink: React.FC<{to: string; isActive: boolean; children: React.ReactNode}> = ({to, isActive, children}) => (
  <Link
    to={to}
    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
      isActive
        ? 'border-purple-500 text-gray-900'
        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
    }`}
  >
    {children}
  </Link>
);

const MobileNavLink: React.FC<{to: string; isActive: boolean; children: React.ReactNode}> = ({to, isActive, children}) => (
  <Link
    to={to}
    className={`block px-3 py-2 rounded-md text-base font-medium ${
      isActive
        ? 'bg-purple-100 text-purple-800'
        : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    {children}
  </Link>
);

export default Header;