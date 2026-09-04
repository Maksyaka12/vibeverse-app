import { useState, useEffect, useCallback } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createPublicClient, http, fallback, parseEther, formatEther, encodeFunctionData, parseAbi } from 'viem';
import { base } from 'viem/chains';

export const NFT_CONTRACT_ADDRESS = '0x9E92307Dbec2d0aE4BBF14cA93E1cA00edC4b886';
export const OPENSEA_COLLECTION_URL = 'https://opensea.io/collection/vibeclubnft';
export const VIBE_TOKEN_ADDRESS = '0xb200000000000000000000df24ecb8bf51100a01';
export const ADMIN_ADDRESS = '0x4C91d3beD372c11795b9cE9A9017Dfe447Bf050A';
export const BUILDER_CODE = 'bc_wsbqqe2u';
// Official ERC-8021 Data Suffix for Base Builder Code bc_wsbqqe2u:
export const BUILDER_CODE_HEX = '62635f77736271716532750b00802180218021802180218021802180218021';

const withBuilderCode = (dataHex) => {
  const clean = dataHex.startsWith('0x') ? dataHex : `0x${dataHex}`;
  return `${clean}${BUILDER_CODE_HEX}`;
};

const RPC_TRANSPORTS = fallback([
  http('https://mainnet.base.org'),
  http('https://base.llamarpc.com'),
  http('https://1rpc.io/base'),
  http('https://base-mainnet.public.blastapi.io')
], { rank: false });

const publicClient = createPublicClient({
  chain: base,
  transport: RPC_TRANSPORTS
});

const NFT_ABI = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function MAX_PER_WALLET() view returns (uint256)',
  'function getCurrentPhase() view returns (uint8)',
  'function getCurrentEthPrice() view returns (uint256)',
  'function ethPrice() view returns (uint256)',
  'function vibePrice() view returns (uint256)',
  'function mintLive() view returns (bool)',
  'function totalMintedCount() view returns (uint256)',
  'function walletMintCount(address) view returns (uint256)',
  'function getRemainingTokens() view returns (uint256)',
  'function aggregatorRouter() view returns (address)',
  'function isTokenMinted(uint256 tokenId) view returns (bool)',
  'function mintWithETH() payable',
  'function mintWithETHAndSwap(bytes swapData) payable',
  'function mintWithVIBE(uint256 vibeAmount) external',
  'function mintWithVIBE() external',
  'function adminMint(address to, uint256 tokenId) external',
  'function adminSwapAndBurn(uint256 ethAmount, bytes customSwapCalldata) external',
  'function setAggregatorRouter(address _newAggregator) external',
  'function withdrawETH() external',
  'function withdrawVIBE() external',
  'function withdrawERC20(address token) external',
  'function transferFrom(address from, address to, uint256 tokenId) external',
  'function executeManualBurn(uint256 vibeAmount) external'
]);

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
]);

export function useVibeNftContract() {
  const { authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const walletAddress = user?.wallet?.address;

  const [totalMinted, setTotalMinted] = useState(0);
  const [remainingTokens, setRemainingTokens] = useState(333);
  const [maxSupply, setMaxSupply] = useState(333);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [ethPriceWei, setEthPriceWei] = useState(parseEther('0.005'));
  const [vibePriceWei, setVibePriceWei] = useState(BigInt('1000000000000000000000000'));
  const [hasMinted, setHasMinted] = useState(false);
  const [mintCount, setMintCount] = useState(0);
  const [mintLive, setMintLive] = useState(true);
  const [contractEthBalance, setContractEthBalance] = useState('0');
  const [contractVibeBalance, setContractVibeBalance] = useState('0');
  const [totalOnChainVibeBurned, setTotalOnChainVibeBurned] = useState(0);
  const [aggregatorRouterAddress, setAggregatorRouterAddress] = useState('');

  const [isMintingEth, setIsMintingEth] = useState(false);
  const [isMintingVibe, setIsMintingVibe] = useState(false);
  const [isApprovingVibe, setIsApprovingVibe] = useState(false);
  const [isAdminSwapping, setIsAdminSwapping] = useState(false);
  const [adminSwapSuccess, setAdminSwapSuccess] = useState(false);
  const [adminTxHash, setAdminTxHash] = useState('');
  const [isSettingRouter, setIsSettingRouter] = useState(false);
  const [setRouterSuccess, setSetRouterSuccess] = useState(false);
  const [txHash, setTxHash] = useState('');
  const [lastMintedId, setLastMintedId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [mintSuccess, setMintSuccess] = useState(false);

  // Dynamic DEX Swap Calldata fetcher (same engine as O1 Exchange on VibeVerse)
  const getKyberSwapCalldata = async (ethAmountWei) => {
    try {
      const amountStr = ethAmountWei.toString();
      const routeRes = await fetch(
        `https://aggregator-api.kyberswap.com/base/api/v1/routes?tokenIn=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE&tokenOut=${VIBE_TOKEN_ADDRESS}&amountIn=${amountStr}`
      );
      const routeData = await routeRes.json();
      if (routeData.code === 0 && routeData.data) {
        const buildRes = await fetch('https://aggregator-api.kyberswap.com/base/api/v1/route/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routeSummary: routeData.data.routeSummary,
            sender: NFT_CONTRACT_ADDRESS,
            recipient: NFT_CONTRACT_ADDRESS,
            slippageTolerance: 300, // 3%
            deadline: Math.floor(Date.now() / 1000) + 1200
          })
        });
        const buildData = await buildRes.json();
        if (buildData.code === 0 && buildData.data?.data) {
          return buildData.data.data;
        }
      }
    } catch (e) {
      console.error('Failed to fetch dynamic swap calldata:', e);
    }
    return '0x';
  };

  // Fetch On-Chain State
  const fetchContractState = useCallback(async () => {
    try {
      const [minted, remaining, supply, live, ethBal, contractVibeBal, aggRouter] = await Promise.all([
        publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: NFT_ABI, functionName: 'totalMintedCount' }).catch(() => 0),
        publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: NFT_ABI, functionName: 'getRemainingTokens' }).catch(() => 333),
        publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: NFT_ABI, functionName: 'MAX_SUPPLY' }).catch(() => 333),
        publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: NFT_ABI, functionName: 'mintLive' }).catch(() => true),
        publicClient.getBalance({ address: NFT_CONTRACT_ADDRESS }).catch(() => BigInt(0)),
        publicClient.readContract({ address: VIBE_TOKEN_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [NFT_CONTRACT_ADDRESS] }).catch(() => BigInt(0)),
        publicClient.readContract({ address: NFT_CONTRACT_ADDRESS, abi: NFT_ABI, functionName: 'aggregatorRouter' }).catch(() => '')
      ]);

      const mintedNum = Number(minted);
      setTotalMinted(mintedNum);
      setRemainingTokens(Number(remaining));
      setMaxSupply(Number(supply));
      setMintLive(live);
      setContractEthBalance(formatEther(ethBal));
      setContractVibeBalance(formatEther(contractVibeBal));
      setAggregatorRouterAddress(aggRouter);

      // Exact on-chain burned $VIBE: 80% burned to dead address, 20% kept on contract rewards pool => burned = contractVibe * 4
      const burnedWei = BigInt(contractVibeBal) * 4n;
      setTotalOnChainVibeBurned(Number(formatEther(burnedWei)));

      // Automated phase calculation
      let phase = 1;
      let price = parseEther('0.005');
      if (mintedNum < 103) {
        phase = 1;
        price = parseEther('0.005');
      } else if (mintedNum < 203) {
        phase = 2;
        price = parseEther('0.015');
      } else if (mintedNum < 303) {
        phase = 3;
        price = parseEther('0.05');
      } else {
        phase = 4;
        price = parseEther('0.1');
      }
      setCurrentPhase(phase);
      setEthPriceWei(price);

      if (walletAddress) {
        const userCount = await publicClient.readContract({
          address: NFT_CONTRACT_ADDRESS,
          abi: NFT_ABI,
          functionName: 'walletMintCount',
          args: [walletAddress]
        }).catch(() => 0);
        setMintCount(Number(userCount));
        setHasMinted(Number(userCount) >= 1);
      }
    } catch (e) {
      console.error('Error fetching NFT contract state:', e);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchContractState();
    const interval = setInterval(fetchContractState, 12000);
    return () => clearInterval(interval);
  }, [fetchContractState]);

  // Web3 Transaction Dispatcher with Official ERC-8021 Base Builder Code support (Smart Wallets + EOA + Base App)
  const sendWeb3Transaction = async (to, valueBigInt, dataHex, customGas = '0x7A120') => {
    const connectedWallet = wallets.find(
      (w) => w.address?.toLowerCase() === walletAddress?.toLowerCase()
    ) || wallets[0];

    const provider = connectedWallet ? await connectedWallet.getEthereumProvider() : window.ethereum;

    if (!provider) {
      throw new Error('No compatible Web3 wallet found');
    }

    const valueHex = valueBigInt ? '0x' + valueBigInt.toString(16) : '0x0';
    const calldataWithSuffix = withBuilderCode(dataHex);

    // 1. Try EIP-5792 wallet_sendCalls for Base Smart Wallet / Coinbase Smart Wallet / Base App / Mobile
    try {
      const callsResponse = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          chainId: '0x2105', // Base Mainnet (8453)
          from: walletAddress,
          calls: [{
            to,
            value: valueHex,
            data: calldataWithSuffix
          }],
          capabilities: {
            dataSuffix: {
              value: '0x' + BUILDER_CODE_HEX,
              optional: true
            }
          }
        }]
      });

      if (callsResponse) {
        if (typeof callsResponse === 'string' && callsResponse.startsWith('0x') && callsResponse.length === 66) {
          return callsResponse;
        }
        const callId = typeof callsResponse === 'object' ? (callsResponse.id || callsResponse) : callsResponse;
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const status = await provider.request({
              method: 'wallet_getCallsStatus',
              params: [callId]
            });
            if (status?.receipts?.[0]?.transactionHash) {
              return status.receipts[0].transactionHash;
            }
            if (status?.status === 'CONFIRMED' || status?.status === 'SUCCESS') {
              if (status.receipts?.[0]?.transactionHash) return status.receipts[0].transactionHash;
              return callId;
            }
          } catch (err) {
            // Ignore polling errors
          }
        }
        return callId;
      }
    } catch (e) {
      console.log('wallet_sendCalls not supported, falling back to eth_sendTransaction:', e?.message || e);
    }

    // 2. Fallback to standard eth_sendTransaction with data suffix for EOA (MetaMask, Rabby, etc.)
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{
        from: walletAddress,
        to,
        value: valueHex,
        data: calldataWithSuffix,
        gas: customGas
      }]
    });
    return hash;
  };

  // 1. Mint with ETH & Automatic DEX Swap + 80% Burn
  const mintWithETH = async () => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setMintSuccess(false);
    setIsMintingEth(true);

    try {
      // 1. Fetch optimal dynamic DEX swap route (exact same engine as O1 Exchange on VibeVerse)
      const swapData = await getKyberSwapCalldata(ethPriceWei);
      let dataHex;

      if (swapData && swapData !== '0x' && swapData.length > 20) {
        dataHex = encodeFunctionData({
          abi: NFT_ABI,
          functionName: 'mintWithETHAndSwap',
          args: [swapData]
        });
      } else {
        dataHex = encodeFunctionData({
          abi: NFT_ABI,
          functionName: 'mintWithETH'
        });
      }

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, ethPriceWei, withBuilderCode(dataHex), '0x7A120');
      setTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        let mintedId = null;
        if (receipt.logs) {
          const transferLog = receipt.logs.find((log) =>
            log.address?.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase() &&
            log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          );
          if (transferLog && transferLog.topics && transferLog.topics[3]) {
            mintedId = Number(BigInt(transferLog.topics[3]));
          }
        }
        if (!mintedId) {
          mintedId = (totalMinted || 0) + 1;
        }
        setLastMintedId(mintedId);
        setMintSuccess(true);
        await fetchContractState();
      } else {
        throw new Error('Transaction reverted on Base');
      }
    } catch (e) {
      console.error('Mint with ETH failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Transaction failed');
    } finally {
      setIsMintingEth(false);
    }
  };

  // 2. Mint with $VIBE
  const mintWithVIBE = async (customVibeAmountWei) => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setMintSuccess(false);
    setIsMintingVibe(false);

    const amountToSend = customVibeAmountWei || vibePriceWei;

    try {
      // Check ERC20 allowance
      const currentAllowance = await publicClient.readContract({
        address: VIBE_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddress, NFT_CONTRACT_ADDRESS]
      });

      if (currentAllowance < amountToSend) {
        setIsApprovingVibe(true);
        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [NFT_CONTRACT_ADDRESS, BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')]
        });

        const approveHash = await sendWeb3Transaction(VIBE_TOKEN_ADDRESS, BigInt(0), withBuilderCode(approveData));
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        setIsApprovingVibe(false);
      }

      setIsMintingVibe(true);

      // Execute Mint with VIBE
      const mintData = encodeFunctionData({
        abi: NFT_ABI,
        functionName: 'mintWithVIBE',
        args: [amountToSend]
      });

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(mintData));
      setTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        let mintedId = null;
        if (receipt.logs) {
          const transferLog = receipt.logs.find((log) =>
            log.address?.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase() &&
            log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
          );
          if (transferLog && transferLog.topics && transferLog.topics[3]) {
            mintedId = Number(BigInt(transferLog.topics[3]));
          }
        }
        if (!mintedId) {
          mintedId = (totalMinted || 0) + 1;
        }
        setLastMintedId(mintedId);
        setMintSuccess(true);
        await fetchContractState();
      } else {
        throw new Error('Mint with VIBE reverted on Base');
      }
    } catch (e) {
      console.error('Mint with VIBE failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Transaction failed');
    } finally {
      setIsApprovingVibe(false);
      setIsMintingVibe(false);
    }
  };

  // 3. Admin Swap & Auto-Burn with Dynamic KyberSwap Route
  const executeAdminSwapAndBurn = async (ethAmountStr) => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setAdminSwapSuccess(false);
    setIsAdminSwapping(true);
    setAdminTxHash('');

    try {
      const ethAmountWei = parseEther(ethAmountStr.toString());
      const swapData = await getKyberSwapCalldata(ethAmountWei);

      const dataHex = encodeFunctionData({
        abi: NFT_ABI,
        functionName: 'adminSwapAndBurn',
        args: [ethAmountWei, swapData]
      });

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(dataHex), '0x7A120');
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setAdminSwapSuccess(true);
        await fetchContractState();
      } else {
        throw new Error('Admin Swap & Burn reverted on Base');
      }
    } catch (e) {
      console.error('Admin Swap & Burn failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Admin Swap & Burn failed');
    } finally {
      setIsAdminSwapping(false);
    }
  };

  // 4. Admin Set Active Kyber Router on Contract (One-click update)
  const executeSetAggregatorRouter = async () => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setSetRouterSuccess(false);
    setIsSettingRouter(true);
    setAdminTxHash('');

    try {
      const ACTIVE_KYBER_ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5';
      const dataHex = encodeFunctionData({
        abi: NFT_ABI,
        functionName: 'setAggregatorRouter',
        args: [ACTIVE_KYBER_ROUTER]
      });

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(dataHex), '0x7A120');
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setSetRouterSuccess(true);
        await fetchContractState();
      } else {
        throw new Error('Set Aggregator Router reverted on Base');
      }
    } catch (e) {
      console.error('Set Router failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Set Router failed');
    } finally {
      setIsSettingRouter(false);
    }
  };

  // 5. Admin Withdraw ETH from contract
  const [isWithdrawingEth, setIsWithdrawingEth] = useState(false);
  const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  const executeWithdrawEth = async () => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setWithdrawSuccess(false);
    setIsWithdrawingEth(true);
    setAdminTxHash('');

    try {
      const dataHex = encodeFunctionData({
        abi: NFT_ABI,
        functionName: 'withdrawETH'
      });

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(dataHex), '0x7A120');
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setWithdrawSuccess(true);
        await fetchContractState();
      } else {
        throw new Error('Withdraw ETH reverted on Base');
      }
    } catch (e) {
      console.error('Withdraw ETH failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Withdraw ETH failed');
    } finally {
      setIsWithdrawingEth(false);
    }
  };

  // 6. Admin Direct Mint (Free - specify recipient & tokenId)
  const [isAdminDirectMinting, setIsAdminDirectMinting] = useState(false);
  const [adminMintSuccess, setAdminMintSuccess] = useState(false);
  const [adminMintedTokenId, setAdminMintedTokenId] = useState(null);

  const executeAdminDirectMint = async (recipientAddress, tokenId) => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setAdminMintSuccess(false);
    setIsAdminDirectMinting(true);
    setAdminTxHash('');

    try {
      const to = (recipientAddress && recipientAddress.trim().length > 0) ? recipientAddress.trim() : walletAddress;
      const tId = BigInt(tokenId);

      const dataHex = encodeFunctionData({
        abi: NFT_ABI,
        functionName: 'adminMint',
        args: [to, tId]
      });

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(dataHex), '0x7A120');
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setAdminMintedTokenId(Number(tId));
        setAdminMintSuccess(true);
        setLastMintedId(Number(tId));
        await fetchContractState();
      } else {
        throw new Error('Admin Mint reverted on Base');
      }
    } catch (e) {
      console.error('Admin Direct Mint failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Admin Direct Mint failed');
    } finally {
      setIsAdminDirectMinting(false);
    }
  };

  // 7. Admin Withdraw VIBE from contract
  const [isWithdrawingVibe, setIsWithdrawingVibe] = useState(false);
  const [withdrawVibeSuccess, setWithdrawVibeSuccess] = useState(false);

  const executeWithdrawVibe = async () => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setWithdrawVibeSuccess(false);
    setIsWithdrawingVibe(true);
    setAdminTxHash('');

    try {
      const dataHex = encodeFunctionData({
        abi: NFT_ABI,
        functionName: 'withdrawVIBE'
      });

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(dataHex), '0x7A120');
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setWithdrawVibeSuccess(true);
        await fetchContractState();
      } else {
        throw new Error('Withdraw VIBE reverted on Base');
      }
    } catch (e) {
      console.error('Withdraw VIBE failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Withdraw VIBE failed');
    } finally {
      setIsWithdrawingVibe(false);
    }
  };

  // 8. Admin Send VIBE to another wallet (Transfer ERC20)
  const [isSendingVibe, setIsSendingVibe] = useState(false);
  const [sendVibeSuccess, setSendVibeSuccess] = useState(false);

  const executeSendVibeToWallet = async (recipientAddress, vibeAmountStr) => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    if (!recipientAddress || !recipientAddress.startsWith('0x') || recipientAddress.length !== 42) {
      setErrorMessage('Please provide a valid 0x recipient address');
      return;
    }
    if (!vibeAmountStr || parseFloat(vibeAmountStr) <= 0) {
      setErrorMessage('Please provide a valid $VIBE amount');
      return;
    }
    setErrorMessage('');
    setSendVibeSuccess(false);
    setIsSendingVibe(true);
    setAdminTxHash('');

    try {
      const amountWei = parseEther(vibeAmountStr.toString());
      const dataHex = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipientAddress.trim(), amountWei]
      });

      const hash = await sendWeb3Transaction(VIBE_TOKEN_ADDRESS, BigInt(0), withBuilderCode(dataHex), '0x7A120');
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === 'success') {
        setSendVibeSuccess(true);
        await fetchContractState();
      } else {
        throw new Error('Transfer $VIBE reverted on Base');
      }
    } catch (e) {
      console.error('Transfer $VIBE failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Transfer $VIBE failed');
    } finally {
      setIsSendingVibe(false);
    }
  };

  // 9. Admin Paid Mint with ETH / VIBE & Direct Forwarding to Recipient
  const [isAdminPaidMinting, setIsAdminPaidMinting] = useState(false);
  const [adminPaidMintSuccess, setAdminPaidMintSuccess] = useState(false);
  const [adminPaidMintedTokenId, setAdminPaidMintedTokenId] = useState(null);
  const [adminPaidRecipient, setAdminPaidRecipient] = useState('');

  const executeAdminPaidMintWithEth = async (recipientAddress) => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setAdminPaidMintSuccess(false);
    setIsAdminPaidMinting(true);
    setAdminTxHash('');

    try {
      const targetRecipient = (recipientAddress && recipientAddress.trim().length === 42 && recipientAddress.trim().startsWith('0x'))
        ? recipientAddress.trim()
        : null;

      const ethAmountWei = ethPriceWei;
      const swapData = await getKyberSwapCalldata(ethAmountWei);

      let dataHex;
      if (swapData && swapData !== '0x' && aggregatorRouterAddress) {
        dataHex = encodeFunctionData({
          abi: NFT_ABI,
          functionName: 'mintWithETHAndSwap',
          args: [swapData]
        });
      } else {
        dataHex = encodeFunctionData({
          abi: NFT_ABI,
          functionName: 'mintWithETH'
        });
      }

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, ethAmountWei, withBuilderCode(dataHex), '0x7A120');
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('Mint with ETH reverted on Base');
      }

      let mintedId = null;
      if (receipt.logs) {
        const transferLog = receipt.logs.find((log) =>
          log.address?.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase() &&
          log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        );
        if (transferLog && transferLog.topics && transferLog.topics[3]) {
          mintedId = Number(BigInt(transferLog.topics[3]));
        }
      }
      if (!mintedId) {
        mintedId = (totalMinted || 0) + 1;
      }

      setAdminPaidMintedTokenId(mintedId);
      setLastMintedId(mintedId);

      if (targetRecipient && targetRecipient.toLowerCase() !== walletAddress.toLowerCase()) {
        setAdminPaidRecipient(targetRecipient);
        const transferDataHex = encodeFunctionData({
          abi: NFT_ABI,
          functionName: 'transferFrom',
          args: [walletAddress, targetRecipient, BigInt(mintedId)]
        });
        const transferHash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(transferDataHex), '0x7A120');
        setAdminTxHash(transferHash);
        await publicClient.waitForTransactionReceipt({ hash: transferHash });
      } else {
        setAdminPaidRecipient(walletAddress);
      }

      setAdminPaidMintSuccess(true);
      await fetchContractState();
    } catch (e) {
      console.error('Admin Paid Mint with ETH failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Admin Paid Mint with ETH failed');
    } finally {
      setIsAdminPaidMinting(false);
    }
  };

  const executeAdminPaidMintWithVibe = async (recipientAddress, customVibeAmountWei) => {
    if (!authenticated || !walletAddress) {
      login();
      return;
    }
    setErrorMessage('');
    setAdminPaidMintSuccess(false);
    setIsAdminPaidMinting(true);
    setAdminTxHash('');

    const amountToSend = customVibeAmountWei || vibePriceWei;

    try {
      const targetRecipient = (recipientAddress && recipientAddress.trim().length === 42 && recipientAddress.trim().startsWith('0x'))
        ? recipientAddress.trim()
        : null;

      const currentAllowance = await publicClient.readContract({
        address: VIBE_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [walletAddress, NFT_CONTRACT_ADDRESS]
      });

      if (currentAllowance < amountToSend) {
        setIsApprovingVibe(true);
        const approveData = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [NFT_CONTRACT_ADDRESS, BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')]
        });
        const approveHash = await sendWeb3Transaction(VIBE_TOKEN_ADDRESS, BigInt(0), withBuilderCode(approveData));
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        setIsApprovingVibe(false);
      }

      const mintData = encodeFunctionData({
        abi: NFT_ABI,
        functionName: 'mintWithVIBE',
        args: [amountToSend]
      });

      const hash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(mintData));
      setAdminTxHash(hash);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('Mint with VIBE reverted on Base');
      }

      let mintedId = null;
      if (receipt.logs) {
        const transferLog = receipt.logs.find((log) =>
          log.address?.toLowerCase() === NFT_CONTRACT_ADDRESS.toLowerCase() &&
          log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
        );
        if (transferLog && transferLog.topics && transferLog.topics[3]) {
          mintedId = Number(BigInt(transferLog.topics[3]));
        }
      }
      if (!mintedId) {
        mintedId = (totalMinted || 0) + 1;
      }

      setAdminPaidMintedTokenId(mintedId);
      setLastMintedId(mintedId);

      if (targetRecipient && targetRecipient.toLowerCase() !== walletAddress.toLowerCase()) {
        setAdminPaidRecipient(targetRecipient);
        const transferDataHex = encodeFunctionData({
          abi: NFT_ABI,
          functionName: 'transferFrom',
          args: [walletAddress, targetRecipient, BigInt(mintedId)]
        });
        const transferHash = await sendWeb3Transaction(NFT_CONTRACT_ADDRESS, BigInt(0), withBuilderCode(transferDataHex), '0x7A120');
        setAdminTxHash(transferHash);
        await publicClient.waitForTransactionReceipt({ hash: transferHash });
      } else {
        setAdminPaidRecipient(walletAddress);
      }

      setAdminPaidMintSuccess(true);
      await fetchContractState();
    } catch (e) {
      console.error('Admin Paid Mint with VIBE failed:', e);
      setErrorMessage(e?.shortMessage || e?.message || 'Admin Paid Mint with VIBE failed');
    } finally {
      setIsApprovingVibe(false);
      setIsAdminPaidMinting(false);
    }
  };

  return {
    contractAddress: NFT_CONTRACT_ADDRESS,
    totalMinted,
    remainingTokens,
    maxSupply,
    currentPhase,
    ethPriceFormatted: formatEther(ethPriceWei),
    vibePriceFormatted: Number(formatEther(vibePriceWei)).toLocaleString('en-US'),
    contractEthBalance,
    contractVibeBalance,
    totalOnChainVibeBurned,
    aggregatorRouterAddress,
    hasMinted,
    mintCount,
    mintLive,
    isMintingEth,
    isMintingVibe,
    isApprovingVibe,
    isAdminSwapping,
    adminSwapSuccess,
    adminTxHash,
    isSettingRouter,
    setRouterSuccess,
    isWithdrawingEth,
    withdrawSuccess,
    isWithdrawingVibe,
    withdrawVibeSuccess,
    isSendingVibe,
    sendVibeSuccess,
    isAdminPaidMinting,
    adminPaidMintSuccess,
    adminPaidMintedTokenId,
    adminPaidRecipient,
    isAdminDirectMinting,
    adminMintSuccess,
    adminMintedTokenId,
    txHash,
    lastMintedId,
    errorMessage,
    mintSuccess,
    mintWithETH,
    mintWithVIBE,
    executeAdminSwapAndBurn,
    executeSetAggregatorRouter,
    executeWithdrawEth,
    executeWithdrawVibe,
    executeSendVibeToWallet,
    executeAdminPaidMintWithEth,
    executeAdminPaidMintWithVibe,
    executeAdminDirectMint,
    refetch: fetchContractState
  };
}
