// --- lib/dmm-actions.tsx (Full Corrected File) ---

"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableProgram,
} from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import BN from "bn.js";
import {
  LiquidityBookServices,
  MODE,
  LiquidityShape,
} from "@saros-finance/dlmm-sdk";
import { 
    getAssociatedTokenAddress, 
    createAssociatedTokenAccountInstruction, 
    NATIVE_MINT 
} from "@solana/spl-token";
import { createUniformDistribution } from "@saros-finance/dlmm-sdk/utils";
import PositionCard from "@/components/PositionCard";

export function getBinArrayPda(
  pairAddress: PublicKey,
  binArrayIndex: number,
  programId: PublicKey
): PublicKey {
  const indexBuffer = Buffer.from(new BN(binArrayIndex).toArray("le", 4));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bin_array"), pairAddress.toBuffer(), indexBuffer],
    programId
  );
  return pda;
}

// ======================= FIX #1 START =======================
// Since the SDK can't discover all pairs, we provide a manual list.
// A production app would get this list from a trusted API or configuration file.
const KNOWN_DEVNET_PAIRS = [
  new PublicKey("C8xWcMpzqetpxwLj7tJfSQ6J8Juh1wHFdT5KrkwdYPQB"), // The main SOL/USDC pair you are using
  // You can add more known devnet pair addresses here to check them too.
];
// ======================= FIX #1 END =======================


export function SarosDmmComponent() {
const { connected, publicKey, signTransaction } = useWallet();

  const [positions, setPositions] = useState<any[]>([]);
  // ========= NEW STATE: To store pair information =========
  const [pairInfos, setPairInfos] = useState<Map<string, any>>(new Map());
  
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isAddingLiquidity, setIsAddingLiquidity] = useState(false);
  const [createdPosition, setCreatedPosition] = useState<any | null>(null);


  // ======================= FIX #1 (Continued) START =======================
  // This function now iterates through the KNOWN_DEVNET_PAIRS list.
   const fetchDmmPositions = useCallback(async () => {
    if (!connected || !publicKey) return;
    
    setIsLoading(true);
    setPositions([]); // Clear old data
    setPairInfos(new Map()); // Clear old data
    
    try {
      const liquidityBookServices = new LiquidityBookServices({ mode: MODE.DEVNET });
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!;
      liquidityBookServices.connection = new Connection(rpcUrl, 'confirmed');

      // Step 1: Fetch all positions from known pairs
      const positionPromises = KNOWN_DEVNET_PAIRS.map(pairAddress =>
        liquidityBookServices.getUserPositions({ payer: publicKey, pair: pairAddress })
      );
      const results = await Promise.all(positionPromises);
      const allPositions = results.flat();
      
      if (allPositions.length === 0) {
        console.log("No positions found.");
        setPositions([]);
        return;
      }
      
      // Step 2: Find all the unique pair addresses from the positions we found
      const uniquePairAddresses = [...new Set(allPositions.map(p => p.pair.toBase58()))];
      console.log(`Found ${allPositions.length} positions across ${uniquePairAddresses.length} unique pairs. Fetching pair info...`);

      // Step 3: Fetch the account info for each unique pair (this is efficient)
      const pairInfoPromises = uniquePairAddresses.map(addr => 
        liquidityBookServices.getPairAccount(new PublicKey(addr))
      );
      const pairInfoResults = await Promise.all(pairInfoPromises);

      // Step 4: Store the pair info in a Map for easy lookup
      const newPairInfos = new Map<string, any>();
      pairInfoResults.forEach((info, index) => {
        if (info) {
          newPairInfos.set(uniquePairAddresses[index], info);
        }
      });

      setPositions(allPositions);
      setPairInfos(newPairInfos);
      console.log("Finished fetching all data.");

    } catch (error) {
      console.error("A critical error occurred while fetching DLMM positions:", error);
      setPositions([]);
      setPairInfos(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [connected, publicKey]);
  // ======================= FIX #1 (Continued) END =======================


  // ======================= FIX #2 START =======================
  // This function now creates a position centered around the current active price.
// --- In lib/dmm-actions.tsx ---
// REPLACE ONLY the handleCreatePositionShell function with this new version.

const handleCreatePositionShell = useCallback(async () => {
    if (!connected || !publicKey || !signTransaction) {
      alert("Wallet not connected or configured.");
      return;
    }
    setIsCreating(true);
    try {
      const liquidityBookServices = new LiquidityBookServices({
        mode: MODE.DEVNET,
      });
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!;
      const connection = new Connection(rpcUrl, "confirmed");
      liquidityBookServices.connection = connection;
      const pairAddress = new PublicKey("C8xWcMpzqetpxwLj7tJfSQ6J8Juh1wHFdT5KrkwdYPQB");
      const pairInfo = await liquidityBookServices.getPairAccount(pairAddress);
      
      if (!pairInfo) {
        throw new Error("Could not fetch pair info.");
      }
      const activeBin = pairInfo.activeId;

      // ======================= THE BOUNDARY-AWARE FIX =======================
      // Find the current bin array index.
      const currentBinArrayIndex = Math.floor(activeBin / 70);
      // Find the binId of the NEXT boundary.
      const nextBoundaryBinId = (currentBinArrayIndex + 1) * 70;
      
      // Create a NARROW, VALID position (+/- 20) CENTERED ON THE BOUNDARY.
      // This GUARANTEES the lower and upper bins are in different arrays.
      const BIN_WIDTH = 20; 
      const binRange: [number, number] = [
        nextBoundaryBinId - BIN_WIDTH, 
        nextBoundaryBinId + BIN_WIDTH, 
      ];
      // =====================================================================

      const relativeBinIdLeft = binRange[0] - activeBin;
      const relativeBinIdRight = binRange[1] - activeBin;

      // This is the bin array where the position STARTS.
      const lowerBinArrayIndex = Math.floor(binRange[0] / 70);
      const positionMint = Keypair.generate();
      const createPositionTx = new Transaction();

      await liquidityBookServices.createPosition({
        pair: pairAddress,
        payer: publicKey,
        relativeBinIdLeft: relativeBinIdLeft,
        relativeBinIdRight: relativeBinIdRight,
        positionMint: positionMint.publicKey,
        transaction: createPositionTx,
        binArrayIndex: lowerBinArrayIndex,
      });

      createPositionTx.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      createPositionTx.feePayer = publicKey;
      createPositionTx.sign(positionMint);
      const signedTx = await signTransaction(createPositionTx);
      const txSignature = await connection.sendRawTransaction(
        signedTx.serialize()
      );
      await connection.confirmTransaction(txSignature, "confirmed");

      console.log("Step 1 SUCCESS! Position shell created:", txSignature);
      const newPosition = {
        lowerBinId: binRange[0],
        upperBinId: binRange[1],
        positionMint: positionMint.publicKey.toBase58(),
      };
      setCreatedPosition(newPosition);
      alert(
        `Position shell created successfully! Mint: ${newPosition.positionMint}. You can now add liquidity.`
      );
    } catch (error) {
      console.error("Failed to create position shell:", error);
      alert("Failed to create position shell.");
    } finally {
      setIsCreating(false);
    }
}, [connected, publicKey, signTransaction]);
  // ======================= FIX #2 END =======================


// --- In lib/dmm-actions.tsx ---

// --- In lib/dmm-actions.tsx ---
// REPLACE your entire handleAddLiquidity function with this one.

// --- In lib/dmm-actions.tsx ---
// REPLACE your entire handleAddLiquidity function with this one.

 // --- In lib/dmm-actions.tsx ---
// REPLACE your entire handleAddLiquidity function with this FINAL, PRODUCTION-READY version.

const handleAddLiquidity = useCallback(async () => {
    if (!createdPosition) {
      alert("Please create a position shell first.");
      return;
    }
    if (!connected || !publicKey || !signTransaction) {
      alert("Wallet not connected or configured.");
      return;
    }

    setIsAddingLiquidity(true);
    try {
      const liquidityBookServices = new LiquidityBookServices({
        mode: MODE.DEVNET,
      });
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!;
      const connection = new Connection(rpcUrl, "confirmed");
      liquidityBookServices.connection = connection;
      const programId = liquidityBookServices.getDexProgramId();

      const pairAddress = new PublicKey("C8xWcMpzqetpxwLj7tJfSQ6J8Juh1wHFdT5KrkwdYPQB");
      const { lowerBinId, upperBinId, positionMint } = createdPosition;
      
      // --- SETUP PHASE: Initialize Accounts (if needed) in a separate transaction ---
      const setupTx = new Transaction();
      
      // ======================= THE DEFINITIVE FIX =======================
      // Pre-create the Wrapped SOL (wSOL) account if it doesn't exist.
      // This is the root cause for new wallets failing the simulation.
      const associatedTokenAddress = await getAssociatedTokenAddress(
        NATIVE_MINT, // This is the public key for Wrapped SOL
        publicKey    // The owner of the new account
      );

      const wSolAccountInfo = await connection.getAccountInfo(associatedTokenAddress);
      if (!wSolAccountInfo) {
          console.log("Wrapped SOL account not found. Adding instruction to create it...");
          setupTx.add(
              createAssociatedTokenAccountInstruction(
                  publicKey,              // Payer (who pays for the rent)
                  associatedTokenAddress, // The new account address
                  publicKey,              // Owner of the new account
                  NATIVE_MINT             // Mint of the new account (wSOL)
              )
          );
      }
      // =================================================================

      // Now, continue with the bin array checks, adding them to the SAME setupTx
      const lowerBinArrayIndex = Math.floor(lowerBinId / 70);
      const upperBinArrayIndex = Math.floor(upperBinId / 70);
      const lowerBinArrayPk = getBinArrayPda(pairAddress, lowerBinArrayIndex, programId);
      const upperBinArrayPk = getBinArrayPda(pairAddress, upperBinArrayIndex, programId);

      const lowerInfo = await connection.getAccountInfo(lowerBinArrayPk);
      if (!lowerInfo) {
        await liquidityBookServices.getBinArray({
          binArrayIndex: lowerBinArrayIndex, pair: pairAddress, payer: publicKey, transaction: setupTx,
        });
      }
      if (lowerBinArrayIndex !== upperBinArrayIndex) {
        const upperInfo = await connection.getAccountInfo(upperBinArrayPk);
        if (!upperInfo) {
          await liquidityBookServices.getBinArray({
            binArrayIndex: upperBinArrayIndex, pair: pairAddress, payer: publicKey, transaction: setupTx,
          });
        }
      }

      // If we added any setup instructions, send that transaction first.
      if (setupTx.instructions.length > 0) {
        console.log("Sending setup transaction to initialize accounts (wSOL/bins)...");
        setupTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        setupTx.feePayer = publicKey;
        const signedSetupTx = await signTransaction(setupTx);
        const setupSig = await connection.sendRawTransaction(signedSetupTx.serialize());
        await connection.confirmTransaction(setupSig, "confirmed");
        console.log("✅ Accounts initialized:", setupSig);
      }

      // --- MAIN PHASE: Build and send the Add Liquidity instruction using a LUT ---
      console.log("Building the large add liquidity instruction...");
      const addLiquidityInstructionTx = new Transaction();
      const shape = LiquidityShape.Spot;
      const positionWidth = upperBinId - lowerBinId;
      const liquidityDistribution = createUniformDistribution({ shape, binRange: [0, positionWidth] });

      await liquidityBookServices.addLiquidityIntoPosition({
        amountX: 0.1 * Math.pow(10, 9), // Keeping this at 0.1 is fine
        amountY: 0.1 * Math.pow(10, 6),
        pair: pairAddress,
        payer: publicKey,
        positionMint: new PublicKey(positionMint),
        liquidityDistribution,
        transaction: addLiquidityInstructionTx,
        binArrayLower: lowerBinArrayPk,
        binArrayUpper: upperBinArrayPk,
      });

      const addLiquidityInstruction = addLiquidityInstructionTx.instructions[0];

      // Create and extend the Address Lookup Table
      console.log("Creating Address Lookup Table...");
      const [lookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
          authority: publicKey,
          payer: publicKey,
          recentSlot: await connection.getSlot("finalized"),
        });
      
      const extendInst = AddressLookupTableProgram.extendLookupTable({
        payer: publicKey,
        authority: publicKey,
        lookupTable: lookupTableAddress,
        addresses: addLiquidityInstruction.keys.map((key) => key.pubkey),
      });

      const lutTx = new Transaction().add(lookupTableInst, extendInst);
      lutTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      lutTx.feePayer = publicKey;
      const signedLutTx = await signTransaction(lutTx);
      const lutSig = await connection.sendRawTransaction(signedLutTx.serialize());
      await connection.confirmTransaction(lutSig, "confirmed");
      console.log("✅ LUT Created and Extended:", lutSig);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      const lookupTableAccount = await connection.getAddressLookupTable(lookupTableAddress).then((res) => res.value);
      if (!lookupTableAccount) throw new Error("Could not fetch lookup table account!");

      // Build, sign, and send the final Versioned Transaction.
      console.log("Building final VersionedTransaction...");
      const latestBlockhash = await connection.getLatestBlockhash();
      const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [addLiquidityInstruction],
      }).compileToV0Message([lookupTableAccount]);

      const versionedTx = new VersionedTransaction(messageV0);

      console.log("Signing and sending final transaction...");
      const signedTx = await signTransaction(versionedTx);
      const txSignature = await connection.sendTransaction(signedTx);
      await connection.confirmTransaction({ ...latestBlockhash, signature: txSignature }, "confirmed");

      console.log("✅ Liquidity added successfully!", txSignature);
      alert("Liquidity added successfully!");
      
      console.log("Waiting 2 seconds for RPC sync before refreshing...");
      await new Promise(resolve => setTimeout(resolve, 2000));

      setCreatedPosition(null);
      fetchDmmPositions();

    } catch (error) {
      console.error("❌ Failed to add liquidity:", error);
      alert("Failed to add liquidity. Check the console for details.");
    } finally {
      setIsAddingLiquidity(false);
    }
}, [connected, publicKey, signTransaction, createdPosition, fetchDmmPositions]);

 useEffect(() => {
    if (connected) {
     // fetchDmmPositions();
    } else {
      setPositions([]);
      setPairInfos(new Map());
    }
  }, [connected, fetchDmmPositions]);

  return (
    <>
      <div className="my-8 flex flex-col items-center gap-4">
        <button
          onClick={handleCreatePositionShell}
          disabled={!publicKey || isCreating}
          className="px-4 py-2 bg-green-600 text-white font-semibold rounded-lg shadow-md disabled:bg-gray-600 w-80"
        >
          {isCreating ? "Creating Shell..." : "Step 1: Create Position Shell"}
        </button>

        {createdPosition && (
          <div className="text-center text-sm text-gray-400">
            <p>
              Shell created! Mint:{" "}
              {createdPosition.positionMint.substring(0, 10)}...
            </p>
          </div>
        )}

        <button
          onClick={handleAddLiquidity}
          disabled={!publicKey || !createdPosition || isAddingLiquidity}
          className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md disabled:bg-gray-600 w-80"
        >
          {isAddingLiquidity ? "Adding Liquidity..." : "Step 2: Add Liquidity"}
        </button>
      </div>
        <div className="mt-12 w-full max-w-5xl">
        <h2 className="text-2xl font-semibold mb-4">Your DLMM Positions</h2>
        {isLoading ? (
          <p className="mt-4 text-center">Loading positions...</p>
        ) : positions.length > 0 ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {/* ======================= THE FINAL FIX ======================= */}
            {positions.map((pos) => {
              // For each position (`pos`), find its corresponding pair information
              // from the `pairInfos` Map you stored in the state.
              const pairInfoForThisCard = pairInfos.get(pos.pair.toBase58());

              return (
                <PositionCard 
                  key={pos.positionMint?.toBase58()} 
                  pos={pos} 
                  // Pass the specific pairInfo for this card as the prop.
                  pairInfo={pairInfoForThisCard} 
                />
              );
            })}
            {/* ============================================================= */}

          </ul>
        ) : (
          publicKey && (
            <p className="mt-4 text-center text-gray-500">
              No liquidity positions found for this wallet.
            </p>
          )
        )}
      </div>
    </>
  );
}