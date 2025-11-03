import React, { useState } from 'react';

interface HeaderProps {
  authUser: any | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({ authUser, onSignIn, onSignOut }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Reusable component for Login/Logout buttons, adapted for desktop/mobile
  const AuthButtons = ({ isMobile = false }) => {
    if (authUser) {
      return (
        <div className={`flex items-center ${isMobile ? 'flex-col w-full space-y-3' : 'space-x-3'}`}>
          <div className="flex items-center justify-center">
            <img 
              src={authUser.user_metadata?.avatar_url || `https://ui-avatars.com/api/?name=${authUser.email}&background=random`} 
              alt="User avatar" 
              className="w-9 h-9 rounded-full" 
              title={authUser.email}
            />
            {isMobile && <span className="text-sm text-gray-300 ml-3">{authUser.email}</span>}
          </div>
          <button 
            onClick={() => { onSignOut(); if (isMobile) setIsMobileMenuOpen(false); }} 
            className={`bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg text-sm transition-colors ${isMobile ? 'w-full py-2.5' : 'px-4 py-1.5'}`}
          >
            Logout
          </button>
        </div>
      );
    } else {
      return (
        <button 
          onClick={() => { onSignIn(); if (isMobile) setIsMobileMenuOpen(false); }} 
          className={`login-btn-animated bg-[color:var(--theme-color)] hover:bg-[color:var(--theme-color-hover)] text-white font-medium rounded-lg transition-colors shadow-lg ${isMobile ? 'w-full py-2.5 text-base' : 'px-5 py-2 text-base'}`}
        >
          Login
        </button>
      );
    }
  };

  return (
    <header className="bg-[#1f2022] border-b border-gray-700/50 shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 lg:px-6">
        <nav className="py-4 flex justify-between items-center">
          <img src="/assets/images/logo.png" alt="Robi Technology Logo" style={{ width: 100, height: 45 }} />
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            <a href="https://robitechnology.com" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors text-sm">OUR SERVICE</a>
            <a href="https://robiaistore.com/" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors text-sm">BUY AI</a>
            <a href="#" className="text-gray-300 hover:text-white transition-colors text-sm">CONTACT US</a>
            <div className="pl-4">
              <AuthButtons />
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-gray-300 hover:text-white focus:outline-none text-3xl">
              <i className={`bi ${isMobileMenuOpen ? 'bi-x' : 'bi-list'}`}></i>
            </button>
          </div>
        </nav>
        
        {/* Mobile Menu Dropdown */}
        <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out bg-[#1f2022] ${isMobileMenuOpen ? 'max-h-96 border-t border-gray-700/50' : 'max-h-0'}`}>
          <div className="flex flex-col space-y-3 px-2 pt-2 pb-4">
            <a href="https://robitechnology.com" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors block py-2 rounded-md text-center">OUR SERVICE</a>
            <a href="https://robiaistore.com/" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors block py-2 rounded-md text-center">BUY AI</a>
            <a href="#" className="text-gray-300 hover:text-white transition-colors block py-2 rounded-md text-center">CONTACT US</a>
            <div className="pt-3 border-t border-gray-700">
              <AuthButtons isMobile={true} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};