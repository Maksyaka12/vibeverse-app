import React, { useState, useEffect, useMemo } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { parseUnits, formatUnits, createPublicClient, http, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import { useUserBalances } from '../hooks/useUserBalances';

const BUILDER_CODE = 'bc_zo20mc2e';
// Official ERC-8021 Data Suffix for Base Builder Code bc_zo20mc2e:
const BUILDER_CODE_HEX = '62635f7a6f32306d6332650b00802180218021802180218021802180218021';

const ETH_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const KYBER_ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const VIBE_TOKEN_ADDRESS = '0xb200000000000000000000df24ecb8bf51100a01';

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: false,
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  }
];

const publicClient = createPublicClient({ chain: base, transport: http() });

export default function DeFiVibePanel({ player }) {
  const { authenticated, user, sendTransaction, login } = usePrivy();
  const { wallets } = useWallets();
  const rawAddress = user?.wallet?.address;
  const balances = useUserBalances(rawAddress);

  const [mode, setMode] = useState('buy'); // 'buy' (ETH -> VIBE) | 'sell' (VIBE -> ETH)
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [rawEthOutput, setRawEthOutput] = useState(0);
  const [slippage, setSlippage] = useState(1.0); // 1%
  const [quoteData, setQuoteData] = useState(null);
  const [isFetchingQuote, setIsFetchingQuote] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [txStatus, setTxStatus] = useState({ type: '', msg: '', hash: '' });
  const [ethPriceUsd, setEthPriceUsd] = useState(2700);

  // Fetch ETH USD price from public API
  useEffect(() => {
    let active = true;
    async function fetchEthPrice() {
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
        const data = await res.json();
        if (active && data?.ethereum?.usd) {
          setEthPriceUsd(data.ethereum.usd);
        }
      } catch (e) {
        // Fallback default ~2700 USD
      }
    }
    fetchEthPrice();
    const interval = setInterval(fetchEthPrice, 30000);
    return () => { active = false; clearInterval(interval); };
  }, []);

  // Optimized Direct Route Quote Fetching (LI.FI Engine with KyberSwap fallback)
  useEffect(() => {
    if (!fromAmount || isNaN(fromAmount) || Number(fromAmount) <= 0) {
      setQuoteData(null);
      setToAmount('');
      setRawEthOutput(0);
      return;
    }

    const timer = setTimeout(async () => {
      setIsFetchingQuote(true);
      try {
        const tokenIn = mode === 'buy' ? ETH_ZERO_ADDRESS : VIBE_TOKEN_ADDRESS;
        const tokenOut = mode === 'buy' ? VIBE_TOKEN_ADDRESS : ETH_ZERO_ADDRESS;
        const amountInWei = parseUnits(fromAmount, 18).toString();
        const userAddr = rawAddress || '0x0000000000000000000000000000000000000001';
        const slippageDecimal = slippage / 100;

        // Try LI.FI Direct Route Quote API (Optimal Uniswap v4 / Direct Pool Routing)
        const lifiUrl = `https://li.quest/v1/quote?fromChain=8453&toChain=8453&fromToken=${tokenIn}&toToken=${tokenOut}&fromAmount=${amountInWei}&fromAddress=${userAddr}&slippage=${slippageDecimal}`;
        const res = await fetch(lifiUrl);
        const data = await res.json();

        if (res.ok && data && data.estimate && data.transactionRequest) {
          setQuoteData({
            engine: 'lifi',
            txRequest: data.transactionRequest,
            toAmountWei: data.estimate.toAmount
          });
          const outWei = BigInt(data.estimate.toAmount);
          const outFormatted = formatUnits(outWei, 18);
          const outNum = Number(outFormatted);

          if (mode === 'sell') {
            setRawEthOutput(outNum);
            setToAmount(outNum.toFixed(6));
          } else {
            setRawEthOutput(Number(fromAmount));
            setToAmount(outNum > 1000000
              ? (outNum / 1000000).toFixed(2) + 'M'
              : outNum > 1000
              ? (outNum / 1000).toFixed(2) + 'K'
              : outNum.toFixed(2)
            );
          }
        } else {
          // Fallback KyberSwap Route Fetcher
          const kTokenIn = mode === 'buy' ? KYBER_ETH_ADDRESS : VIBE_TOKEN_ADDRESS;
          const kTokenOut = mode === 'buy' ? VIBE_TOKEN_ADDRESS : KYBER_ETH_ADDRESS;
          const kRes = await fetch(`https://aggregator-api.kyberswap.com/base/api/v1/routes?tokenIn=${kTokenIn}&tokenOut=${kTokenOut}&amountIn=${amountInWei}`);
          const kData = await kRes.json();

          if (kData.code === 0 && kData.data?.routeSummary) {
            setQuoteData({
              engine: 'kyberswap',
              summary: kData.data.routeSummary,
              routerAddress: kData.data.routerAddress
            });
            const outWei = BigInt(kData.data.routeSummary.amountOut);
            const outFormatted = formatUnits(outWei, 18);
            const outNum = Number(outFormatted);

            if (mode === 'sell') {
              setRawEthOutput(outNum);
              setToAmount(outNum.toFixed(6));
            } else {
              setRawEthOutput(Number(fromAmount));
              setToAmount(outNum > 1000000
                ? (outNum / 1000000).toFixed(2) + 'M'
                : outNum > 1000
                ? (outNum / 1000).toFixed(2) + 'K'
                : outNum.toFixed(2)
              );
            }
          } else {
            // Estimated rate fallback
            const vibeRate = 238000000;
            if (mode === 'buy') {
              const out = Number(fromAmount) * vibeRate;
              setRawEthOutput(Number(fromAmount));
              setToAmount(out >= 1000000 ? (out / 1000000).toFixed(2) + 'M' : out.toLocaleString());
            } else {
              const outEth = Number(fromAmount) / vibeRate;
              setRawEthOutput(outEth);
              setToAmount(outEth.toFixed(6));
            }
          }
        }
      } catch (e) {
        console.error('Quote fetch error:', e);
      } finally {
        setIsFetchingQuote(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [fromAmount, mode, slippage, rawAddress]);

  // Calculate ~$ USD Equivalence (Exact Market USD Price)
  const fromUsd = useMemo(() => {
    if (!fromAmount || isNaN(fromAmount) || Number(fromAmount) <= 0) return '$0.00';
    if (mode === 'buy') {
      const usd = Number(fromAmount) * ethPriceUsd;
      return `~$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    } else {
      const ethVal = rawEthOutput || (Number(fromAmount) / 238000000);
      const usd = ethVal * ethPriceUsd;
      return `~$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
  }, [fromAmount, mode, ethPriceUsd, rawEthOutput]);

  const toUsd = useMemo(() => {
    if (!fromAmount || isNaN(fromAmount) || Number(fromAmount) <= 0) return '$0.00';
    if (mode === 'buy') {
      const usd = Number(fromAmount) * ethPriceUsd;
      return `~$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    } else {
      const ethVal = rawEthOutput || (Number(fromAmount) / 238000000);
      const usd = ethVal * ethPriceUsd;
      return `~$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
    }
  }, [fromAmount, mode, ethPriceUsd, rawEthOutput]);

  // Percentage Button Handler (25%, 50%, 75%, MAX)
  const handlePercentage = (percent) => {
    setTxStatus({ type: '', msg: '', hash: '' });
    if (mode === 'buy') {
      const ethStr = (balances.ethFormatted || '0').replace(',', '.');
      const rawEth = parseFloat(ethStr);
      if (isNaN(rawEth) || rawEth <= 0) return;
      if (percent === 100) {
        // Reserve 0.0001 ETH for gas when selecting 100% ETH
        const maxEth = Math.max(0, rawEth - 0.0001);
        setFromAmount(maxEth > 0 ? maxEth.toFixed(6).replace(/\.?0+$/, '') : '0');
      } else {
        const ethVal = rawEth * (percent / 100);
        setFromAmount(ethVal.toFixed(6).replace(/\.?0+$/, ''));
      }
    } else {
      // Robust VIBE Balance Extraction using exact numeric string
      const vibeStr = (balances.exactVibeStr || balances.vibe || '0').toString().replace(',', '.');
      const rawVibe = parseFloat(vibeStr);
      if (isNaN(rawVibe) || rawVibe <= 0) return;

      if (percent === 100) {
        // Truncate to 2 decimals without rounding (e.g. 400000.326745 -> 400000.32)
        const [intPart, fracPart] = vibeStr.split('.');
        if (!fracPart) {
          setFromAmount(intPart);
        } else {
          setFromAmount(`${intPart}.${fracPart.slice(0, 2)}`);
        }
      } else {
        const vibeVal = (rawVibe * (percent / 100)).toString();
        const [intPart, fracPart] = vibeVal.split('.');
        if (!fracPart) {
          setFromAmount(intPart);
        } else {
          setFromAmount(`${intPart}.${fracPart.slice(0, 2)}`);
        }
      }
    }
  };

  // Universal Web3 transaction executor
  const executeWeb3Tx = async (to, valueBigInt, dataHex) => {
    const connectedWallet = wallets.find(
      (w) => w.address?.toLowerCase() === rawAddress?.toLowerCase()
    ) || wallets[0];

    const provider = connectedWallet ? await connectedWallet.getEthereumProvider() : window.ethereum;

    if (!provider) {
      if (sendTransaction) {
        const res = await sendTransaction({
          to,
          value: valueBigInt,
          data: dataHex
        });
        return res?.transactionHash || res?.hash || '';
      }
      throw new Error('No active Web3 wallet found');
    }

    const valueHex = valueBigInt ? '0x' + valueBigInt.toString(16) : '0x0';
    const calldataWithSuffix = dataHex.includes(BUILDER_CODE_HEX) ? dataHex : dataHex + BUILDER_CODE_HEX;

    // 1. Try EIP-5792 wallet_sendCalls for Base Smart Wallet / Coinbase Smart Wallet / Base App / Mobile
    try {
      const callsResponse = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '1.0',
          chainId: '0x2105', // Base Mainnet (8453)
          from: rawAddress,
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
        from: rawAddress,
        to,
        value: valueHex,
        data: calldataWithSuffix
      }]
    });
    return hash;
  };

  const handleToggleMode = () => {
    setMode((prev) => (prev === 'buy' ? 'sell' : 'buy'));
    setFromAmount('');
    setToAmount('');
    setRawEthOutput(0);
    setQuoteData(null);
    setTxStatus({ type: '', msg: '', hash: '' });
  };

  const handleSwap = async () => {
    if (!authenticated || !rawAddress) {
      if (login) login();
      return;
    }
    if (!fromAmount || isNaN(fromAmount) || Number(fromAmount) <= 0) {
      setTxStatus({ type: 'error', msg: '⚠️ Enter a valid swap amount' });
      return;
    }

    setSwapping(true);
    setTxStatus({ type: 'info', msg: '⌛ Confirming in your Web3 wallet...' });

    try {
      let targetAddress = '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE';
      let calldataHex = '';
      let txValue = 0n;

      if (quoteData && quoteData.engine === 'lifi' && quoteData.txRequest) {
        setTxStatus({ type: 'info', msg: '⌛ Executing optimal Direct DEX swap...' });
        targetAddress = quoteData.txRequest.to || targetAddress;
        calldataHex = quoteData.txRequest.data || '0x';
        txValue = quoteData.txRequest.value ? BigInt(quoteData.txRequest.value) : 0n;
      } else if (quoteData && quoteData.engine === 'kyberswap' && quoteData.summary) {
        setTxStatus({ type: 'info', msg: '⌛ Building KyberSwap route...' });

        const buildRes = await fetch('https://aggregator-api.kyberswap.com/base/api/v1/route/build', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            routeSummary: quoteData.summary,
            sender: rawAddress,
            recipient: rawAddress,
            slippageTolerance: Math.round(slippage * 100),
            deadline: Math.floor(Date.now() / 1000) + 1200
          })
        });

        const buildData = await buildRes.json();
        if (buildData.code === 0 && buildData.data) {
          targetAddress = buildData.data.routerAddress || quoteData.routerAddress || targetAddress;
          calldataHex = buildData.data.data;
          txValue = buildData.data.value ? BigInt(buildData.data.value) : 0n;
          if (mode === 'buy') txValue = parseUnits(fromAmount, 18);
        }
      }

      if (mode === 'sell') {
        const amountVibeWei = parseUnits(fromAmount, 18);
        setTxStatus({ type: 'info', msg: '⌛ Step 1/2: Approving $VIBE for Swap Router...' });

        const allowance = await publicClient.readContract({
          address: VIBE_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [rawAddress, targetAddress]
        }).catch(() => 0n);

        if (allowance < amountVibeWei) {
          const maxApproval = parseUnits('999999999999999', 18);
          const approveCalldata = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [targetAddress, maxApproval]
          });
          await executeWeb3Tx(VIBE_TOKEN_ADDRESS, 0n, approveCalldata);
        }

        setTxStatus({ type: 'info', msg: '⌛ Step 2/2: Confirming $VIBE ➔ ETH Swap in wallet...' });
      }

      if (!calldataHex) {
        calldataHex = '0x';
        if (mode === 'buy') txValue = parseUnits(fromAmount, 18);
      }

      // Append Official ERC-8021 Data Suffix for Base Builder Code bc_wsbqqe2u
      const finalCalldata = calldataHex + BUILDER_CODE_HEX;

      const txHash = await executeWeb3Tx(targetAddress, txValue, finalCalldata);

      setTxStatus({
        type: 'success',
        msg: '🎉 Swap Submitted to Base Mainnet!',
        hash: txHash
      });
    } catch (err) {
      console.error('Swap execution error:', err);
      if (err?.message?.includes('user rejected') || err?.message?.includes('User rejected')) {
        setTxStatus({ type: 'error', msg: '✕ Transaction rejected in wallet' });
      } else {
        setTxStatus({ type: 'error', msg: `⚠️ Swap failed: ${err?.shortMessage || err?.message || 'Error'}` });
      }
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="vv-defi-panel-wrap" style={{ fontFamily: 'var(--vv-pixel)', color: '#fff', fontSize: '10px', padding: '4px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header & Mode Switcher (Single row: BUY $VIBE left, Slippage right) */}
      <div className="vv-defi-header-row" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: '12px', color: '#ffd700', fontWeight: 900, letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
          {mode === 'buy' ? 'BUY $VIBE' : 'SELL $VIBE'}
        </div>

        {/* Slippage Tolerance Selector */}
        <div className="vv-defi-slippage-row" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
          <span style={{ fontSize: '7px', color: '#88aacc', fontWeight: 900 }}>SLIPPAGE:</span>
          {[0.5, 1.0, 3.0, 5.0].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                padding: '3px 6px',
                borderRadius: '5px',
                border: slippage === s ? '1px solid #00f5ff' : '1px solid rgba(255, 255, 255, 0.15)',
                background: slippage === s ? 'rgba(0, 245, 255, 0.25)' : 'rgba(2, 11, 26, 0.6)',
                color: slippage === s ? '#00f5ff' : '#aaa',
                cursor: 'pointer',
                fontWeight: 900
              }}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {/* INPUT CARD 1: YOU PAY */}
      <div className="vv-defi-input-card" style={{
        background: '#020b1a',
        border: '2px solid rgba(0, 245, 255, 0.4)',
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '10px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '9px', marginBottom: '8px', fontWeight: 900 }}>
          <span>YOU PAY</span>
          <span>
            BALANCE:{' '}
            <strong style={{ color: mode === 'buy' ? '#00f5ff' : '#ffd700' }}>
              {balances.loading
                ? '...'
                : mode === 'buy'
                ? `${balances.ethFormatted} ETH`
                : `${balances.vibeFormatted} $VIBE`}
            </strong>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="0.00"
            value={fromAmount}
            onChange={(e) => {
              setFromAmount(e.target.value);
              setTxStatus({ type: '', msg: '', hash: '' });
            }}
            style={{
              flex: 1,
              width: '100%',
              minWidth: '0',
              fontFamily: 'var(--vv-pixel)',
              fontSize: '16px',
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              outline: 'none',
              fontWeight: 900
            }}
          />
          <span style={{
            fontFamily: 'var(--vv-pixel)',
            fontSize: '10px',
            fontWeight: 900,
            color: mode === 'buy' ? '#00f5ff' : '#ffd700',
            background: mode === 'buy' ? 'rgba(0, 245, 255, 0.15)' : 'rgba(255, 215, 0, 0.15)',
            border: mode === 'buy' ? '1px solid #00f5ff' : '1px solid #ffd700',
            padding: '6px 10px',
            borderRadius: '8px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}>
            {mode === 'buy' ? 'ETH' : '$VIBE'}
          </span>
        </div>

        {/* Small USD Equivalent Display */}
        <div style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '8px', marginTop: '4px', fontWeight: 700 }}>
          {fromUsd}
        </div>

        {/* Percentage Preset Buttons (25%, 50%, 75%, MAX) */}
        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
          {[25, 50, 75, 100].map((p) => (
            <button
              key={p}
              onClick={() => handlePercentage(p)}
              style={{
                flex: 1,
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                background: mode === 'buy' ? 'rgba(0, 245, 255, 0.12)' : 'rgba(255, 215, 0, 0.12)',
                border: mode === 'buy' ? '1px solid rgba(0, 245, 255, 0.4)' : '1px solid rgba(255, 215, 0, 0.4)',
                color: mode === 'buy' ? '#00f5ff' : '#ffd700',
                padding: '6px 0',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 900
              }}
            >
              {p === 100 ? 'MAX' : `${p}%`}
            </button>
          ))}
        </div>
      </div>

      {/* FLIP DIRECTION BUTTON ↕ */}
      <div style={{ textAlign: 'center', margin: '-4px 0 8px 0' }}>
        <button
          onClick={handleToggleMode}
          title="Switch Swap Direction"
          style={{
            fontFamily: 'var(--vv-pixel)',
            fontSize: '14px',
            background: 'rgba(4, 20, 48, 0.95)',
            border: '2px solid #00f5ff',
            color: '#ffd700',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            cursor: 'pointer',
            boxShadow: '0 0 14px rgba(0, 245, 255, 0.5)',
            transition: 'transform 0.2s ease'
          }}
        >
          ↕
        </button>
      </div>

      {/* INPUT CARD 2: YOU RECEIVE */}
      <div className="vv-defi-input-card" style={{
        background: '#020b1a',
        border: '2px solid rgba(0, 245, 255, 0.4)',
        borderRadius: '12px',
        padding: '14px 16px',
        marginBottom: '16px',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '9px', marginBottom: '8px', fontWeight: 900 }}>
          <span>YOU RECEIVE</span>
          <span>
            BALANCE:{' '}
            <strong style={{ color: mode === 'buy' ? '#ffd700' : '#00f5ff' }}>
              {balances.loading
                ? '...'
                : mode === 'buy'
                ? `${balances.vibeFormatted} $VIBE`
                : `${balances.ethFormatted} ETH`}
            </strong>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{
            flex: 1,
            width: '100%',
            minWidth: '0',
            fontFamily: 'var(--vv-pixel)',
            fontSize: '16px',
            color: '#00ff88',
            fontWeight: 900
          }}>
            {isFetchingQuote ? 'CALC...' : (toAmount || '0.00')}
          </div>
          <span style={{
            fontFamily: 'var(--vv-pixel)',
            fontSize: '10px',
            fontWeight: 900,
            color: mode === 'buy' ? '#ffd700' : '#00f5ff',
            background: mode === 'buy' ? 'rgba(255, 215, 0, 0.15)' : 'rgba(0, 245, 255, 0.15)',
            border: mode === 'buy' ? '1px solid #ffd700' : '1px solid #00f5ff',
            padding: '6px 10px',
            borderRadius: '8px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}>
            {mode === 'buy' ? '$VIBE' : 'ETH'}
          </span>
        </div>

        {/* Small USD Equivalent Display */}
        <div style={{ color: 'rgba(255, 255, 255, 0.55)', fontSize: '8px', marginTop: '4px', fontWeight: 700 }}>
          {toUsd}
        </div>
      </div>

      {/* Status Toast Message */}
      {txStatus.msg && (
        <div style={{
          marginBottom: '14px',
          padding: '10px 14px',
          borderRadius: '10px',
          background: txStatus.type === 'success'
            ? 'rgba(0, 255, 136, 0.15)'
            : txStatus.type === 'error'
            ? 'rgba(255, 68, 102, 0.15)'
            : 'rgba(0, 245, 255, 0.15)',
          border: txStatus.type === 'success'
            ? '1.5px solid #00ff88'
            : txStatus.type === 'error'
            ? '1.5px solid #ff4466'
            : '1.5px solid #00f5ff',
          color: txStatus.type === 'success'
            ? '#00ff88'
            : txStatus.type === 'error'
            ? '#ff4466'
            : '#00f5ff',
          fontSize: '9px',
          fontWeight: 900,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{txStatus.msg}</span>
          {txStatus.hash && (
            <a
              href={`https://basescan.org/tx/${txStatus.hash}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: '#00f5ff', textDecoration: 'underline' }}
            >
              BASESCAN ↗
            </a>
          )}
        </div>
      )}

      {/* MAIN SWAP ACTION BUTTON (Enlarged, Prominent & Heavy) */}
      <button
        onClick={handleSwap}
        disabled={swapping || !fromAmount || Number(fromAmount) <= 0}
        style={{
          width: '100%',
          height: '52px',
          fontFamily: 'var(--vv-pixel)',
          fontSize: '14px',
          fontWeight: 900,
          background: mode === 'buy'
            ? 'linear-gradient(135deg, #00f5ff 0%, #0050ff 100%)'
            : 'linear-gradient(135deg, #ffd700 0%, #ff6b35 100%)',
          border: '2.5px solid #ffffff',
          borderRadius: '12px',
          padding: '14px',
          color: '#ffffff',
          cursor: swapping || !fromAmount || Number(fromAmount) <= 0 ? 'not-allowed' : 'pointer',
          opacity: swapping || !fromAmount || Number(fromAmount) <= 0 ? 0.6 : 1,
          boxShadow: '0 4px 20px rgba(0, 245, 255, 0.4), 0 0 12px rgba(255, 255, 255, 0.5)',
          letterSpacing: '1px'
        }}
      >
        {swapping ? 'SWAPPING...' : (mode === 'buy' ? 'BUY $VIBE' : 'SELL $VIBE')}
      </button>
    </div>
  );
}
