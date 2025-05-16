import { PublicKey } from '@solana/web3.js';
import { ethers } from 'ethers';
import { ChainId } from './index'; // Assuming ChainId enum is defined here

// Wormhole specific constants (replace with actual values if needed)
const WORMHOLE_SOLANA_CHAIN_ID = 1;
const WORMHOLE_ETHEREUM_CHAIN_ID = 2;
// Add other Wormhole chain IDs as needed

/**
 * Converts an EVM address (hex string) to Wormhole's 32-byte universal address format (bytes32 hex string).
 * @param address EVM address (e.g., "0x...")
 * @returns Wormhole universal address format (bytes32 hex string, e.g., "0x000000000000000000000000...")
 */
export function evmAddressToWormholeFormat(address: string): string {
    if (!ethers.utils.isAddress(address)) {
        throw new Error(`Invalid EVM address: ${address}`);
    }
    // Pad the 20-byte address to 32 bytes
    return ethers.utils.hexZeroPad(address, 32);
}

/**
 * Converts a Solana public key (PublicKey instance or base58 string) to Wormhole's 32-byte universal address format (bytes32 hex string).
 * @param publicKey Solana public key
 * @returns Wormhole universal address format (bytes32 hex string)
 */
export function solanaAddressToWormholeFormat(publicKey: PublicKey | string): string {
    let pubkeyBytes: Buffer;
    if (typeof publicKey === 'string') {
        pubkeyBytes = new PublicKey(publicKey).toBuffer();
    } else {
        pubkeyBytes = publicKey.toBuffer();
    }

    if (pubkeyBytes.length !== 32) {
        // This shouldn't happen for standard Solana public keys
        throw new Error('Invalid Solana public key buffer length.');
    }
    return `0x${pubkeyBytes.toString('hex')}`;
}

/**
 * Converts a native chain address to Wormhole's 32-byte universal address format based on the chain ID.
 * @param chainId The ChainId enum value for the source chain.
 * @param address The native address string (base58 for Solana, hex for EVM).
 * @returns Wormhole universal address format (bytes32 hex string).
 */
export function nativeAddressToWormholeFormat(chainId: ChainId, address: string): string {
    switch (chainId) {
        case ChainId.Solana:
            return solanaAddressToWormholeFormat(address);
        case ChainId.Ethereum:
        case ChainId.Optimism:
        case ChainId.Arbitrum:
        case ChainId.Base:
            // Add other EVM chains here
            return evmAddressToWormholeFormat(address);
        default:
            throw new Error(`Unsupported chain ID for Wormhole address conversion: ${chainId}`);
    }
}

/**
 * Converts a Wormhole 32-byte universal address format (bytes32 hex string) back to a native chain address string.
 * @param chainId The ChainId enum value for the target chain.
 * @param wormholeAddress The Wormhole universal address format (bytes32 hex string).
 * @returns Native address string (base58 for Solana, hex for EVM).
 */
export function wormholeFormatToNativeAddress(chainId: ChainId, wormholeAddress: string): string {
    if (!ethers.utils.isHexString(wormholeAddress) || wormholeAddress.length !== 66) { // 0x + 64 hex chars
        throw new Error(`Invalid Wormhole address format: ${wormholeAddress}`);
    }

    const addressBytes = Buffer.from(wormholeAddress.slice(2), 'hex');
    if (addressBytes.length !== 32) {
        throw new Error('Wormhole address buffer length is not 32.');
    }

    switch (chainId) {
        case ChainId.Solana:
            // Solana public keys are 32 bytes
            return new PublicKey(addressBytes).toBase58();
        case ChainId.Ethereum:
        case ChainId.Optimism:
        case ChainId.Arbitrum:
        case ChainId.Base:
            // EVM addresses are the last 20 bytes
            const evmAddressBytes = addressBytes.slice(12); // Get the last 20 bytes
            return ethers.utils.getAddress(`0x${evmAddressBytes.toString('hex')}`); // checksummed address
        default:
            throw new Error(`Unsupported chain ID for Wormhole address conversion: ${chainId}`);
    }
}

/**
 * Gets the Wormhole Chain ID for a given SolanaVeil ChainId.
 * @param chainId SolanaVeil ChainId enum value.
 * @returns Corresponding Wormhole Chain ID number.
 */
export function getWormholeChainId(chainId: ChainId): number {
    switch (chainId) {
        case ChainId.Solana:
            return WORMHOLE_SOLANA_CHAIN_ID;
        case ChainId.Ethereum:
            return WORMHOLE_ETHEREUM_CHAIN_ID;
        // Add mappings for Optimism, Arbitrum, Base, etc. based on official Wormhole chain IDs
        // case ChainId.Optimism: return 10; // Example
        // case ChainId.Arbitrum: return 23; // Example
        // case ChainId.Base: return 30; // Example
        default:
            throw new Error(`Wormhole Chain ID not configured for: ${chainId}`);
    }
}
