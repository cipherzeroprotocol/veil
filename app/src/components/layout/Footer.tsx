import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-800 text-white py-8">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-xl font-bold mb-2">SolanaVeil</h3>
            <p className="text-gray-400 text-sm">
              Privacy-preserving mixer with ZK Compression technology
            </p>
          </div>
          
          <div className="text-center md:text-right">
            <div className="mb-2">
              <a
                href="https://github.com/your-username/solana-veil"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 transition-colors duration-200 mx-2"
              >
                GitHub
              </a>
              <a
                href="https://docs.yourproject.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 transition-colors duration-200 mx-2"
              >
                Documentation
              </a>
              <a
                href="#"
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 transition-colors duration-200 mx-2"
              >
                Report Issue
              </a>
            </div>
            
            <p className="text-gray-500 text-xs">
              Built with ❤️ for Solana Hackathon
            </p>
            <p className="text-gray-500 text-xs mt-1">
              © {new Date().getFullYear()} SolanaVeil Team. All rights reserved.
            </p>
          </div>
        </div>
        
        <div className="mt-6 border-t border-gray-700 pt-6 text-center text-gray-500 text-xs">
          <p className="mb-2">
            This project is for educational and demonstration purposes only. Not financial advice.
          </p>
          <p>
            SolanaVeil is designed to enable legitimate privacy use cases while implementing safeguards against illicit usage.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;