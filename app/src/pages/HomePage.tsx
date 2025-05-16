import React from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Link } from 'react-router-dom';

// Make sure to import the wallet adapter styles in your main index or App file if not already done:
// import '@solana/wallet-adapter-react-ui/styles.css';

const HomePage: React.FC = () => {
  const { publicKey } = useWallet();
  
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
          SolanaVeil
        </h1>
        <p className="mt-4 text-xl text-gray-500">
          Privacy-preserving mixer with ZK Compression
        </p>
        
        <div className="mt-8 mb-12 flex justify-center">
          <WalletMultiButton className="!bg-indigo-600 !rounded-md !py-2 !px-4 !text-white !hover:bg-indigo-700" />
        </div>
        
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-2">
          <FeatureCard
            title="Deposit"
            description="Deposit funds into a privacy pool to break the on-chain link between source and destination addresses."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            }
            linkTo="/deposit"
            disabled={!publicKey}
          />
          
          <FeatureCard
            title="Withdraw"
            description="Withdraw your funds to any address. No one will be able to link the withdrawal to your original deposit."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            }
            linkTo="/withdraw"
            disabled={!publicKey}
          />
        </div>
        
        <div className="mt-16 grid gap-8 md:grid-cols-3 lg:grid-cols-3">
          <InfoCard
            title="ZK Compression"
            description="Leverages Helius's ZK Compression to reduce on-chain storage costs by ~95%."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            }
          />
          
          <InfoCard
            title="Fixed Denominations"
            description="Different pool sizes to enhance privacy and reduce gas costs."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            }
          />
          
          <InfoCard
            title="Compliance Focused"
            description="Built-in safeguards to prevent illicit use while respecting privacy."
            icon={
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            }
          />
        </div>
        
        <div className="mt-16 border-t border-gray-200 pt-8">
          <h2 className="text-2xl font-bold text-gray-900">How It Works</h2>
          <div className="mt-6 prose prose-indigo prose-lg text-gray-500 mx-auto">
            <p className="text-left">
              SolanaVeil uses zero-knowledge proofs to enable private transactions on Solana. When you deposit
              funds, a commitment is added to a Merkle tree stored using ZK Compression technology. Later,
              you can withdraw those funds to any address by generating a zero-knowledge proof showing you know
              the secret inputs that created the commitment, without revealing which specific commitment you're
              withdrawing from.
            </p>
            <ol className="text-left">
              <li>
                <strong>Deposit:</strong> Select a pool, make a deposit, and save your deposit note securely.
              </li>
              <li>
                <strong>Withdraw:</strong> Use your deposit note to withdraw to any address without revealing
                the link between your deposit and withdrawal.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};

interface FeatureCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  linkTo: string;
  disabled?: boolean;
}

/**
 * FeatureCard component for displaying a main feature with a link
 */
const FeatureCard: React.FC<FeatureCardProps> = ({
  title,
  description,
  icon,
  linkTo,
  disabled = false
}) => {
  return (
    <div className={`bg-white shadow-md rounded-lg p-6 transform transition duration-500 hover:shadow-lg ${disabled ? 'opacity-50' : 'hover:-translate-y-1'}`}>
      <div className="mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-gray-900">{title}</h3>
      <p className="mt-2 text-base text-gray-500">
        {description}
      </p>
      {disabled ? (
        <button disabled className="mt-4 w-full inline-flex justify-center items-center px-4 py-2 bg-gray-300 text-gray-500 rounded-md cursor-not-allowed">
          Connect Wallet First
        </button>
      ) : (
        <Link
          to={linkTo}
          className="mt-4 w-full inline-flex justify-center items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          {title} Now
        </Link>
      )}
    </div>
  );
};

interface InfoCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
}

/**
 * InfoCard component for displaying information about a feature
 */
const InfoCard: React.FC<InfoCardProps> = ({
  title,
  description,
  icon
}) => {
  return (
    <div className="bg-white shadow-sm rounded-lg p-5">
      <div className="mb-3">
        {icon}
      </div>
      <h3 className="text-md font-medium text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">
        {description}
      </p>
    </div>
  );
};

export default HomePage;