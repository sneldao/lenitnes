import { ethers } from 'ethers';
import { getWallet, getChainConfig } from './client.js';
import { logger } from '../../logger.js';

const ABI = [
  'function recordSignal(bytes32 signalHash, string metadataURI) external returns (uint256)',
  'function signalCount() external view returns (uint256)',
  'event SignalRecorded(uint256 indexed id, bytes32 signalHash, address recorder, uint256 timestamp)',
];

export async function recordSignalOnChain(
  chain: string,
  signalId: string,
  evidence: string,
  summary: string,
): Promise<{ txHash: string; chainId: number }> {
  const wallet = getWallet(chain);
  const cfg = getChainConfig(chain);
  const contract = new ethers.Contract(cfg.signalRegistryAddress, ABI, wallet);

  const signalHash = ethers.keccak256(ethers.toUtf8Bytes(`${signalId}:${evidence}:${summary}`));
  const metadataURI = `lenitnes://signal/${signalId}`;

  const tx = await contract.recordSignal(signalHash, metadataURI);
  const receipt = await tx.wait();

  logger.info({ chain, txHash: receipt.hash, signalId }, 'signal recorded on-chain');

  return { txHash: receipt.hash, chainId: cfg.chainId };
}
