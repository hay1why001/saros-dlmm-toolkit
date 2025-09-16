// --- src/components/PositionCard.tsx (Final Version) ---

import React, { useMemo } from 'react';
import BN from 'bn.js';

// Helper function remains the same
const calculatePriceFromBinId = (binId: number, binStep: number): number => {
  if (binStep === 0) return 1; // Avoid division by zero
  return (1 + binStep / 10000) ** binId;
};

const PositionCard = ({ pos, pairInfo }: { pos: any, pairInfo: any }) => {
  // If the essential data isn't passed down, don't render anything.
  if (!pos || !pairInfo) {
    return null;
  }

  // Calculate total liquidity FIRST, as it determines how we display other info.
  const liquidityAmount = useMemo(() => {
    if (!pos.liquidityShares || !Array.isArray(pos.liquidityShares)) {
      return new BN(0);
    }
    return pos.liquidityShares.reduce((acc: BN, current: BN) => acc.add(current), new BN(0));
  }, [pos.liquidityShares]);
  
  const hasLiquidity = !liquidityAmount.isZero();

  const tokenInfo = useMemo(() => {
    const tokenXMint = pairInfo.tokenXMint?.toBase58() ?? 'Unknown';
    const tokenYMint = pairInfo.tokenYMint?.toBase58() ?? 'Unknown';
    return {
      tokenX: tokenXMint.substring(0, 6) + '...',
      tokenY: tokenYMint.substring(0, 6) + '...',
    }
  }, [pairInfo]);

  const priceRange = useMemo(() => {
    // If there's no liquidity, the price range is not meaningful. Display N/A.
    if (!hasLiquidity) {
        return { lower: 'N/A', upper: 'N/A' };
    }
    try {
      const lowerPrice = calculatePriceFromBinId(pos.lowerBinId, pairInfo.binStep);
      const upperPrice = calculatePriceFromBinId(pos.upperBinId, pairInfo.binStep);
      return {
        lower: lowerPrice.toFixed(4),
        upper: upperPrice.toFixed(4),
      };
    } catch (e) {
      // Catch potential Infinity errors, though the check above should handle most cases.
      return { lower: 'Error', upper: 'Error' };
    }
  }, [pos, pairInfo, hasLiquidity]);

  return (
    // Make empty shells appear faded to distinguish them visually.
    <li className={`bg-gray-800 rounded-lg shadow-md p-4 flex flex-col justify-between ${!hasLiquidity ? 'opacity-50' : ''}`}>
      <div>
        <h3 className="text-lg font-bold text-white">{tokenInfo.tokenX} / {tokenInfo.tokenY}</h3>
        <p className="text-sm text-gray-400 mt-2">
          Liquidity: 
          <span className={`${hasLiquidity ? 'text-green-400' : 'text-gray-500'} font-mono ml-2`}>
            {liquidityAmount.toString()}
          </span>
          {/* Add a helpful label for empty positions */}
          {!hasLiquidity && <span className="text-xs text-yellow-500 ml-2">(Empty Shell)</span>}
        </p>
        <p className="text-sm text-gray-400">
          Price Range: <span className="text-white font-mono">{priceRange.lower} - {priceRange.upper}</span>
        </p>
      </div>
      <div className="text-xs text-gray-500 mt-4 truncate">
        Mint: {pos.positionMint?.toBase58() ?? '...'}
      </div>
    </li>
  );
};

export default PositionCard;