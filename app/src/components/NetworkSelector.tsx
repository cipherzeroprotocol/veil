import React, { useMemo } from 'react';
import { ChainId } from '../services/bridgeService';

interface Network {
  id: ChainId;
  name: string;
  icon: string;
  color: string;
  enabled: boolean;
}

interface NetworkSelectorProps {
  label: string;
  selectedNetwork: ChainId;
  onChange: (network: ChainId) => void;
  excludeNetworks?: ChainId[];
  sourceNetwork?: ChainId;
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({
  label,
  selectedNetwork,
  onChange,
  excludeNetworks = [],
  sourceNetwork
}) => {
  // Network definitions with icons, colors, and enabled status
  const allNetworks: Network[] = useMemo(() => [
    {
      id: ChainId.Solana,
      name: 'Solana',
      icon: '/images/networks/solana.svg',
      color: '#14F195',
      enabled: true
    },
    {
      id: ChainId.Ethereum,
      name: 'Ethereum',
      icon: '/images/networks/ethereum.svg',
      color: '#627EEA',
      enabled: true
    },
    {
      id: ChainId.Optimism,
      name: 'Optimism',
      icon: '/images/networks/optimism.svg',
      color: '#FF0420',
      enabled: true
    },
    {
      id: ChainId.Arbitrum,
      name: 'Arbitrum',
      icon: '/images/networks/arbitrum.svg',
      color: '#28A0F0',
      enabled: true
    },
    {
      id: ChainId.Base,
      name: 'Base',
      icon: '/images/networks/base.svg',
      color: '#0052FF',
      enabled: true
    }
  ], []);

  // Filter networks based on exclusions and availability
  const availableNetworks = useMemo(() => {
    return allNetworks.filter(network => {
      // Exclude specified networks
      if (excludeNetworks.includes(network.id)) {
        return false;
      }

      // Disable incompatible directions (e.g., L2 to L2 not supported directly)
      if (sourceNetwork !== undefined) {
        // If source is Solana, all Ethereum networks are valid
        if (sourceNetwork === ChainId.Solana) {
          return network.id !== ChainId.Solana && network.enabled;
        }
        
        // If source is Ethereum network, only Solana is valid
        return network.id === ChainId.Solana && network.enabled;
      }

      return network.enabled;
    });
  }, [allNetworks, excludeNetworks, sourceNetwork]);

  // Handle network selection
  const handleNetworkChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(Number(event.target.value) as ChainId);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <select
          value={selectedNetwork}
          onChange={handleNetworkChange}
          className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
        >
          {availableNetworks.map((network) => (
            <option key={network.id} value={network.id}>
              {network.name}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      {selectedNetwork !== undefined && (
        <div className="mt-2 flex items-center">
          <img
            src={allNetworks.find(n => n.id === selectedNetwork)?.icon}
            alt={allNetworks.find(n => n.id === selectedNetwork)?.name}
            className="h-5 w-5 mr-2"
          />
          <span className="text-sm text-gray-500">
            {allNetworks.find(n => n.id === selectedNetwork)?.name}
          </span>
        </div>
      )}
    </div>
  );
};

export default NetworkSelector;