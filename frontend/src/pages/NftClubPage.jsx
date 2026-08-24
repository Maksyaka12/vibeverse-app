import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { parseEther } from 'viem';
import { useUserBalances } from '../verse/hooks/useUserBalances';
import { useVibeNftContract, NFT_CONTRACT_ADDRESS } from '../hooks/useVibeNftContract';
import nftNames from '../data/nftNames.json';

// Pixel SVG Wallet Icon
const WalletSvgIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <rect x="2" y="6" width="20" height="13" rx="2" />
    <path d="M16 12.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0z" fill="currentColor" />
    <path d="M6 6V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" />
  </svg>
);

// NFT Deck strictly from #5 to #35 (31 NFTs)
const NFT_DECK = Array.from({ length: 31 }, (_, i) => i + 5);

export default function NftClubPage() {
  const { login, logout, authenticated, user } = usePrivy();
  const walletAddress = user?.wallet?.address;
  const balances = useUserBalances(walletAddress);

  const {
    totalMinted,
    remainingTokens,
    maxSupply,
    currentPhase,
    ethPriceFormatted,
    contractEthBalance,
    totalOnChainVibeBurned,
    hasMinted,
    isMintingEth,
    isMintingVibe,
    isApprovingVibe,
    isAdminSwapping,
    adminSwapSuccess,
    adminTxHash,
    aggregatorRouterAddress,
    isSettingRouter,
    setRouterSuccess,
    isWithdrawingEth,
    withdrawSuccess,
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
    executeAdminDirectMint
  } = useVibeNftContract();

  const [deckIndex, setDeckIndex] = useState(0);
  const [vibePerEthRatio, setVibePerEthRatio] = useState(50000000); // 1 ETH = ~50M VIBE fallback
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [adminEthInput, setAdminEthInput] = useState('0.005');
  const [adminMintRecipient, setAdminMintRecipient] = useState('');
  const [adminMintTokenId, setAdminMintTokenId] = useState('104');

  const isAdmin = walletAddress?.toLowerCase() === '0x4c91d3bed372c11795b9ce9a9017dfe447bf050a';

  // Auto show success modal when mint completes
  useEffect(() => {
    if (mintSuccess) {
      setShowSuccessModal(true);
    }
  }, [mintSuccess]);

  // Fetch live $VIBE pool price from DEX Screener on Base
  useEffect(() => {
    let isMounted = true;
    async function fetchLiveVibePrice() {
      try {
        const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/0xb200000000000000000000df24ecb8bf51100a01');
        const data = await res.json();
        if (data?.pairs && data.pairs.length > 0) {
          const mainPair = data.pairs[0];
          const ethPriceInUsd = parseFloat(mainPair.priceNative) ? (parseFloat(mainPair.priceUsd) / parseFloat(mainPair.priceNative)) : 2700;
          const vibePriceInUsd = parseFloat(mainPair.priceUsd) || 0.00005;
          if (vibePriceInUsd > 0 && isMounted) {
            const calculatedRatio = Math.round(ethPriceInUsd / vibePriceInUsd);
            setVibePerEthRatio(calculatedRatio);
          }
        }
      } catch (e) {
        console.error('Error fetching VIBE live price:', e);
      }
    }

    fetchLiveVibePrice();
    const interval = setInterval(fetchLiveVibePrice, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Smooth horizontal slide loop: slides to next card every 2.0s
  useEffect(() => {
    const timer = setInterval(() => {
      setDeckIndex((prev) => (prev + 1) % NFT_DECK.length);
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  // Current dynamic $VIBE price based on active phase
  const ethPriceNum = parseFloat(ethPriceFormatted) || 0.005;
  const currentDynamicVibeAmount = Math.floor(ethPriceNum * vibePerEthRatio);

  // Exact on-chain burned $VIBE (0 if swap hasn't executed yet)
  const totalVibeBurnedByContract = totalOnChainVibeBurned;

  const currentNftId = NFT_DECK[deckIndex];

  // Clean character name without duplicate numbers
  const rawCharacterName = nftNames[currentNftId] || 'Maltipoo';
  const cleanCharacterName = rawCharacterName.replace(/^#\d+\s*/, '').replace(/#\d+/, '').trim() || 'VIBE';

  const [testMintedId, setTestMintedId] = useState(null);

  // Details for Minted NFT Modal
  const modalNftId = testMintedId || lastMintedId || 3;
  const modalRawName = nftNames[modalNftId] || 'Maltipoo';
  const modalCleanName = modalRawName.replace(/^#\d+\s*/, '').replace(/#\d+/, '').trim() || 'VIBE';

  const formatVibeComma = (amount) => {
    return Math.floor(Number(amount || 0)).toLocaleString('en-US') + ' $VIBE';
  };

  // Download / Save NFT Image to device gallery
  const handleSaveImage = async () => {
    const imageUrl = `/nft/images/${modalNftId}.png`;
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], `Vibe_Club_${modalNftId}.png`, { type: 'image/png' });

      // 1. Try Native Mobile Web Share (Direct save to iOS Photos / Android Gallery)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `Vibe Club #${modalNftId}`,
            text: `Vibe Club #${modalNftId} NFT`
          });
          return;
        } catch (shareErr) {
          if (shareErr.name === 'AbortError') return;
        }
      }

      // 2. Standard Browser Download fallback
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `Vibe_Club_${modalNftId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error('Download error:', e);
      window.open(imageUrl, '_blank');
    }
  };

  // Share on X (Twitter Intent with rich formatting)
  const handleShareOnX = () => {
    const tweetText = `I JOINED 333 VIBE CLUB 🐶🔥\n\nVibe Club – the first NFT collection officially integrated into @o1_exchange B20 ecosystem & directly related to $VIBE B20 economy\n\nI grabbed Vibe Club #${modalNftId} ${modalCleanName.toUpperCase()} 🐶\n\nMint yours (FCFS) → https://vibeverse.dog/vibeclub`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(shareUrl, '_blank', 'noopener,noreferrer');
  };

  // Target Launch: August 15, 2026 17:00:00 UTC
  const LAUNCH_TIMESTAMP = Date.UTC(2026, 7, 15, 17, 0, 0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeRemainingMs = Math.max(0, LAUNCH_TIMESTAMP - currentTime);
  const isLaunchLive = timeRemainingMs <= 0;

  const isBypassPreview = typeof window !== 'undefined' && (
    window.location.search.includes('preview') ||
    window.location.search.includes('admin') ||
    window.location.search.includes('dev')
  );

  const showLockScreen = !isLaunchLive && !isAdmin && !isBypassPreview;

  const totalRemainingSec = Math.floor(timeRemainingMs / 1000);
  const countdownHours = String(Math.floor(totalRemainingSec / 3600)).padStart(2, '0');
  const countdownMins = String(Math.floor((totalRemainingSec % 3600) / 60)).padStart(2, '0');
  const countdownSecs = String(totalRemainingSec % 60).padStart(2, '0');

  // 4 Mint Phases definition
  const phases = [
    { phase: 'PHASE 1', count: '103 NFT', price: '0.005 ETH', vibePrice: formatVibeComma(Math.floor(0.005 * vibePerEthRatio)), active: currentPhase === 1, done: currentPhase > 1 || totalMinted >= 103 },
    { phase: 'PHASE 2', count: '100 NFT', price: '0.015 ETH', vibePrice: formatVibeComma(Math.floor(0.015 * vibePerEthRatio)), active: currentPhase === 2, done: currentPhase > 2 || totalMinted >= 203 },
    { phase: 'PHASE 3', count: '100 NFT', price: '0.05 ETH', vibePrice: formatVibeComma(Math.floor(0.05 * vibePerEthRatio)), active: currentPhase === 3, done: currentPhase > 3 || totalMinted >= 303 },
    { phase: 'PHASE 4', count: '30 NFT', price: '0.1 ETH', vibePrice: formatVibeComma(Math.floor(0.1 * vibePerEthRatio)), active: currentPhase === 4, done: false },
  ];

  const handleMintWithVibeClick = () => {
    const vibeWei = parseEther(currentDynamicVibeAmount.toString());
    mintWithVIBE(vibeWei);
  };

  // 100% Reliable Image Fallback Handler for Mobile & Web
  const handleImageError = (e, id) => {
    if (!e.target.src.includes('pinata.cloud')) {
      e.target.src = `https://gateway.pinata.cloud/ipfs/bafybeifoc434thlscysnqvy45idxfjn7g7qjtedntek3rckn3vukffczxe/${id}.png`;
    } else if (!e.target.src.includes('ipfs.io')) {
      e.target.src = `https://ipfs.io/ipfs/bafybeifoc434thlscysnqvy45idxfjn7g7qjtedntek3rckn3vukffczxe/${id}.png`;
    }
  };

  if (showLockScreen) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100vw',
        background: 'radial-gradient(circle at 50% 30%, #041430 0%, #020b1a 70%, #000511 100%)',
        color: '#fff',
        fontFamily: 'var(--vv-pixel)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px 16px',
        boxSizing: 'border-box',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        textTransform: 'uppercase'
      }}>
        {/* Inline animation keyframes */}
        <style>{`
          @keyframes vvPulseDotAnimation {
            0% { transform: scale(0.9); opacity: 0.7; box-shadow: 0 0 4px #00ff88; }
            50% { transform: scale(1.35); opacity: 1; box-shadow: 0 0 12px #00ff88, 0 0 20px #00ff88; }
            100% { transform: scale(0.9); opacity: 0.7; box-shadow: 0 0 4px #00ff88; }
          }
          .vv-lock-pulse-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #00ff88;
            display: inline-block;
            animation: vvPulseDotAnimation 1.6s infinite ease-in-out;
          }
          @media (max-width: 768px) {
            .vv-lock-title {
              font-size: 16px !important;
              line-height: 1.4 !important;
            }
            .vv-lock-badge {
              font-size: 8px !important;
              padding: 6px 12px !important;
            }
            .vv-timer-box {
              padding: 12px 14px !important;
              min-width: 58px !important;
            }
            .vv-timer-digit {
              font-size: 20px !important;
            }
          }
        `}</style>

        {/* Top Right Header with Connect Wallet (Allows Admin to connect and instantly bypass) */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          zIndex: 10
        }}>
          {authenticated ? (
            <button
              onClick={logout}
              style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                background: 'rgba(0, 245, 255, 0.12)',
                border: '1.5px solid #00f5ff',
                color: '#00ff88',
                padding: '8px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <WalletSvgIcon size={12} /> {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </button>
          ) : (
            <button
              onClick={login}
              style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                background: 'linear-gradient(135deg, #00f5ff, #0050ff)',
                color: '#fff',
                border: '1.5px solid #ffffff',
                padding: '8px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: 900,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <WalletSvgIcon size={12} /> CONNECT WALLET
            </button>
          )}
        </div>

        {/* Background Map Glow */}
        <div style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(0, 245, 255, 0.15) 0%, rgba(0, 0, 0, 0) 70%)',
          pointerEvents: 'none'
        }} />

        {/* Mascot Logo */}
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <img
            src="/vibe-logo.png"
            alt="VIBE"
            style={{
              width: '96px',
              height: '96px',
              borderRadius: '24px',
              border: '3px solid #00f5ff',
              boxShadow: '0 0 32px rgba(0, 245, 255, 0.5)'
            }}
          />
        </div>

        {/* Title */}
        <h1 className="vv-lock-title" style={{
          fontFamily: 'var(--vv-pixel)',
          fontSize: '22px',
          color: '#00f5ff',
          textShadow: '0 0 20px rgba(0, 245, 255, 0.6)',
          marginBottom: '14px',
          maxWidth: '750px',
          lineHeight: 1.4,
          letterSpacing: '0.5px'
        }}>
          VIBE CLUB IS COMING
        </h1>

        {/* Green Badge */}
        <div className="vv-lock-badge" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(0, 255, 136, 0.12)',
          border: '1.5px solid #00ff88',
          color: '#00ff88',
          borderRadius: '20px',
          padding: '8px 18px',
          fontSize: '9.5px',
          fontFamily: 'var(--vv-pixel)',
          letterSpacing: '0.6px',
          marginBottom: '32px',
          boxShadow: '0 0 18px rgba(0, 255, 136, 0.25)',
          whiteSpace: 'nowrap'
        }}>
          <span className="vv-lock-pulse-dot" />
          <span>VIBE VERSE: GENESIS PHASE</span>
        </div>

        {/* Pixel Countdown Box */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          marginBottom: '20px'
        }}>
          <div className="vv-timer-box" style={{
            background: 'rgba(2, 11, 26, 0.92)',
            border: '2px solid #00f5ff',
            borderRadius: '14px',
            padding: '16px 22px',
            minWidth: '76px',
            boxShadow: '0 0 24px rgba(0, 245, 255, 0.35)',
            textAlign: 'center'
          }}>
            <div className="vv-timer-digit" style={{ fontSize: '26px', color: '#00f5ff', textShadow: '0 0 16px #00f5ff' }}>
              {countdownHours}
            </div>
            <div style={{ fontSize: '7.5px', color: '#88aacc', marginTop: '4px', letterSpacing: '0.5px' }}>HOURS</div>
          </div>

          <span style={{ fontSize: '24px', color: '#ffd700' }}>:</span>

          <div className="vv-timer-box" style={{
            background: 'rgba(2, 11, 26, 0.92)',
            border: '2px solid #ffd700',
            borderRadius: '14px',
            padding: '16px 22px',
            minWidth: '76px',
            boxShadow: '0 0 24px rgba(255, 215, 0, 0.35)',
            textAlign: 'center'
          }}>
            <div className="vv-timer-digit" style={{ fontSize: '26px', color: '#ffd700', textShadow: '0 0 16px #ffd700' }}>
              {countdownMins}
            </div>
            <div style={{ fontSize: '7.5px', color: '#88aacc', marginTop: '4px', letterSpacing: '0.5px' }}>MINS</div>
          </div>

          <span style={{ fontSize: '24px', color: '#ffd700' }}>:</span>

          <div className="vv-timer-box" style={{
            background: 'rgba(2, 11, 26, 0.92)',
            border: '2px solid #ff007f',
            borderRadius: '14px',
            padding: '16px 22px',
            minWidth: '76px',
            boxShadow: '0 0 24px rgba(255, 0, 127, 0.35)',
            textAlign: 'center'
          }}>
            <div className="vv-timer-digit" style={{ fontSize: '26px', color: '#ff007f', textShadow: '0 0 16px #ff007f' }}>
              {countdownSecs}
            </div>
            <div style={{ fontSize: '7.5px', color: '#88aacc', marginTop: '4px', letterSpacing: '0.5px' }}>SECS</div>
          </div>
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: '9px',
          color: '#88aacc',
          letterSpacing: '0.8px',
          fontFamily: 'var(--vv-pixel)',
          lineHeight: 1.6
        }}>
          PUBLIC MINT LAUNCHES AT 17:00 UTC • 333 TOTAL SUPPLY • FCFS
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 10%, #041430 0%, #020b1a 70%, #000511 100%)',
      color: '#fff',
      fontFamily: 'var(--vv-pixel)',
      paddingBottom: '80px',
      overflowX: 'hidden',
      textTransform: 'uppercase',
      width: '100vw'
    }}>
      {/* Inline animation & Mobile CSS Override */}
      <style>{`
        @keyframes vvPulseDotAnimation {
          0% { transform: scale(0.9); opacity: 0.7; box-shadow: 0 0 4px #00ff88; }
          50% { transform: scale(1.35); opacity: 1; box-shadow: 0 0 12px #00ff88, 0 0 20px #00ff88; }
          100% { transform: scale(0.9); opacity: 0.7; box-shadow: 0 0 4px #00ff88; }
        }
        .vv-pulse-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #00ff88;
          display: inline-block;
          animation: vvPulseDotAnimation 1.6s infinite ease-in-out;
        }

        /* ── MOBILE SPECIFIC STYLES (< 768px) ── */
        @media (max-width: 768px) {
          .vv-opensea-btn {
            display: none !important;
          }
          .vv-desktop-phase-row {
            display: none !important;
          }
          .vv-mobile-phase-row {
            display: flex !important;
          }
          .vv-nft-club-header {
            padding: 12px 14px !important;
          }
          .vv-nft-club-header-subtext {
            white-space: nowrap !important;
            font-size: 7px !important;
          }
          .vv-nft-club-container {
            padding: 0 12px !important;
            margin-top: 14px !important;
          }
          .vv-nft-club-main-card {
            padding: 16px 14px !important;
            border-radius: 16px !important;
          }
          .vv-nft-club-main-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
            margin-bottom: 20px !important;
          }
          .vv-nft-card-frame {
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }
          .vv-nft-phase-row {
            padding: 12px 14px !important;
          }
          .vv-nft-phase-text {
            font-size: 8px !important;
            white-space: nowrap !important;
          }
          .vv-nft-phase-prices {
            font-size: 8px !important;
            white-space: nowrap !important;
          }
          .vv-phase-vibe-part {
            display: none !important;
          }
          .vv-faq-section-title {
            font-size: 12px !important;
            white-space: nowrap !important;
          }
          .vv-faq-card {
            padding: 16px 18px !important;
          }
          .vv-faq-title {
            font-size: 9px !important;
          }
          .vv-faq-text {
            font-size: 7.5px !important;
          }
          .vv-desktop-wallet-btn {
            display: none !important;
          }
          .vv-mobile-wallet-btn {
            display: flex !important;
          }
        }

        @media (min-width: 769px) {
          .vv-mobile-phase-row {
            display: none !important;
          }
          .vv-desktop-phase-row {
            display: flex !important;
          }
          .vv-mobile-wallet-btn {
            display: none !important;
          }
        }
      `}</style>

      {/* ── TOP HEADER / NAV ── */}
      <header className="vv-nft-club-header" style={{
        padding: '16px 20px',
        borderBottom: '1px solid rgba(0, 245, 255, 0.15)',
        background: 'rgba(2, 11, 26, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/new-logo-vibe.png" alt="VIBE" style={{ width: '34px', height: '34px', borderRadius: '8px' }} />
          <div>
            <div style={{ fontFamily: 'var(--vv-pixel)', fontSize: '11px', color: '#00f5ff', letterSpacing: '0.5px' }}>
              VIBE CLUB
            </div>
            <div className="vv-nft-club-header-subtext" style={{ fontSize: '8px', color: '#88aacc', marginTop: '2px', letterSpacing: '0.3px' }}>
              VIBE VERSE: GENESIS
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* OpenSea Link (Hidden on mobile) */}
          <a
            href={`https://opensea.io/assets/base/${NFT_CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="vv-opensea-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'rgba(32, 129, 226, 0.15)',
              border: '1px solid #2081e2',
              color: '#2081e2',
              fontSize: '8px',
              textDecoration: 'none',
              fontWeight: 900
            }}
          >
            OPENSEA ↗
          </a>

          {/* DESKTOP WALLET CONNECT */}
          <div className="vv-desktop-wallet-btn">
            {authenticated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  background: 'rgba(0, 245, 255, 0.1)',
                  border: '1px solid rgba(0, 245, 255, 0.3)',
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '9px',
                  color: '#00ff88',
                  fontFamily: 'var(--vv-pixel)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <WalletSvgIcon size={12} /> {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                </div>
                <button
                  onClick={logout}
                  style={{
                    fontFamily: 'var(--vv-pixel)',
                    background: 'transparent',
                    border: '1px solid rgba(255, 68, 102, 0.4)',
                    color: '#ff4466',
                    padding: '6px 12px',
                    borderRadius: '20px',
                    fontSize: '8px',
                    cursor: 'pointer',
                    textTransform: 'uppercase'
                  }}
                >
                  LOGOUT
                </button>
              </div>
            ) : (
              <button
                onClick={login}
                style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '9px',
                  background: 'linear-gradient(135deg, #00f5ff, #0050ff)',
                  color: '#fff',
                  border: '1.5px solid #fff',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  boxShadow: '0 0 14px rgba(0, 245, 255, 0.4)',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <WalletSvgIcon size={13} /> CONNECT WALLET
              </button>
            )}
          </div>

          {/* MOBILE WALLET CONNECT */}
          <div className="vv-mobile-wallet-btn" style={{ alignItems: 'center' }}>
            {authenticated ? (
              <button
                onClick={logout}
                style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '8px',
                  background: 'rgba(0, 245, 255, 0.12)',
                  border: '1.5px solid #00f5ff',
                  color: '#00ff88',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.3)'
                }}
              >
                <WalletSvgIcon size={12} /> {walletAddress?.slice(0, 4)}...{walletAddress?.slice(-3)}
              </button>
            ) : (
              <button
                onClick={login}
                style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '8px',
                  background: 'linear-gradient(135deg, #00f5ff, #0050ff)',
                  color: '#fff',
                  border: '1.5px solid #ffffff',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 0 12px rgba(0, 245, 255, 0.4)',
                  fontWeight: 900
                }}
              >
                <WalletSvgIcon size={12} /> CONNECT
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTAINER ── */}
      <div className="vv-nft-club-container" style={{
        maxWidth: '1050px',
        margin: '24px auto 0 auto',
        padding: '0 20px',
        textAlign: 'center'
      }}>

        {/* ── MAIN CARD CONTAINER ── */}
        <div className="vv-nft-club-main-card" style={{
          background: 'rgba(4, 20, 48, 0.85)',
          border: '2px solid #00f5ff',
          borderRadius: '20px',
          padding: '28px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.8), 0 0 30px rgba(0, 245, 255, 0.25)',
          backdropFilter: 'blur(16px)',
          textAlign: 'left'
        }}>

          {/* MOBILE ONLY TOP ROW: PHASE BADGE + 2-LINE CONTRACT (ABOVE NFT CARD) */}
          <div className="vv-mobile-phase-row" style={{
            display: 'none',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '14px',
            width: '100%'
          }}>
            <div style={{
              display: 'inline-block',
              background: 'rgba(0, 255, 136, 0.15)',
              border: '1.5px solid #00ff88',
              color: '#00ff88',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '8px',
              letterSpacing: '0.4px',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap'
            }}>
              ● PHASE {currentPhase} MINT IS LIVE
            </div>

            <a
              href={`https://basescan.org/address/${NFT_CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#88aacc',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                textAlign: 'right',
                marginLeft: 'auto',
                lineHeight: 1.3
              }}
            >
              <span style={{ fontSize: '7px', color: '#88aacc', letterSpacing: '0.3px' }}>CONTRACT:</span>
              <span style={{ fontSize: '7.5px', color: '#00f5ff', letterSpacing: '0.3px' }}>
                {NFT_CONTRACT_ADDRESS.slice(0, 6)}...{NFT_CONTRACT_ADDRESS.slice(-4)} ↗
              </span>
            </a>
          </div>

          {/* TOP SECTION: LEFT HORIZONTAL SLIDER + RIGHT CONTROLS */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.1fr',
            gap: '28px',
            alignItems: 'stretch',
            marginBottom: '32px'
          }} className="vv-nft-club-main-grid">

            {/* LEFT COLUMN: PURE NFT HORIZONTAL SLIDER CARD */}
            <div className="vv-nft-card-frame" style={{
              position: 'relative',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '3px solid #00f5ff',
              boxShadow: '0 0 28px rgba(0, 245, 255, 0.4), 0 12px 30px rgba(0,0,0,0.8)',
              background: '#020b1a',
              aspectRatio: '1/1',
              width: '100%',
              maxWidth: '100%',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 0
            }}>
              {/* HARDWARE ACCELERATED HORIZONTAL SLIDING TRACK */}
              <div style={{
                display: 'flex',
                width: '100%',
                height: '100%',
                transform: `translateX(-${deckIndex * 100}%)`,
                transition: 'transform 0.65s cubic-bezier(0.25, 1, 0.5, 1)',
                willChange: 'transform'
              }}>
                {NFT_DECK.map((id) => (
                  <div
                    key={id}
                    style={{
                      flex: '0 0 100%',
                      minWidth: '100%',
                      maxWidth: '100%',
                      width: '100%',
                      height: '100%',
                      position: 'relative',
                      background: '#020b1a',
                      boxSizing: 'border-box',
                      overflow: 'hidden'
                    }}
                  >
                    <img
                      src={`/nft/images/${id}.png`}
                      onError={(e) => handleImageError(e, id)}
                      alt={`Vibe Club #${id}`}
                      loading="eager"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        display: 'block'
                      }}
                    />
                  </div>
                ))}
              </div>

              {/* BOTTOM CHARACTER NAME BADGE (ALWAYS BRAND CYAN #00F5FF & SINGLE NUMBER) */}
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '12px',
                right: '12px',
                background: 'rgba(2, 11, 26, 0.92)',
                border: '1.5px solid #00f5ff',
                padding: '8px 12px',
                borderRadius: '10px',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '9px',
                color: '#00f5ff',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.85)',
                zIndex: 10,
                textAlign: 'center',
                letterSpacing: '0.4px',
                backdropFilter: 'blur(8px)'
              }}>
                <span>
                  VIBE CLUB #{currentNftId} {cleanCharacterName.toUpperCase()}
                </span>
              </div>
            </div>

            {/* RIGHT COLUMN: CONTROLS WITH COMPACT GAPS (NO JUMP ON LOAD) */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              gap: '10px',
              height: '100%'
            }}>
              {/* DESKTOP ONLY TOP ROW: ACTIVE PHASE + CONTRACT */}
              <div className="vv-desktop-phase-row" style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
                width: '100%'
              }}>
                <div style={{
                  display: 'inline-block',
                  background: 'rgba(0, 255, 136, 0.15)',
                  border: '1.5px solid #00ff88',
                  color: '#00ff88',
                  borderRadius: '8px',
                  padding: '6px 10px',
                  fontSize: '8px',
                  letterSpacing: '0.4px',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap'
                }}>
                  ● PHASE {currentPhase} MINT IS LIVE
                </div>

                <a
                  href={`https://basescan.org/address/${NFT_CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '8px',
                    color: '#88aacc',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    marginLeft: 'auto',
                    textAlign: 'right',
                    whiteSpace: 'nowrap'
                  }}
                >
                  CONTRACT: {NFT_CONTRACT_ADDRESS.slice(0, 6)}...{NFT_CONTRACT_ADDRESS.slice(-4)} ↗
                </a>
              </div>

              {/* CARD 1: ETH PRICE & LIVE $VIBE PRICE + LIMIT */}
              <div style={{
                background: 'rgba(2, 11, 26, 0.7)',
                border: '1px solid rgba(0, 245, 255, 0.25)',
                borderRadius: '12px',
                padding: '10px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', color: '#aaa' }}>ETH PRICE</span>
                  <span style={{ fontFamily: 'var(--vv-pixel)', fontSize: '9px', color: '#00f5ff' }}>
                    {ethPriceFormatted} ETH
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', color: '#aaa' }}>LIVE $VIBE PRICE</span>
                  <span style={{ fontFamily: 'var(--vv-pixel)', fontSize: '9px', color: '#ffd700' }}>
                    {formatVibeComma(currentDynamicVibeAmount)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', color: '#aaa' }}>LIMIT</span>
                  <span style={{ fontFamily: 'var(--vv-pixel)', fontSize: '8px', color: '#00ff88' }}>
                    1 NFT PER WALLET
                  </span>
                </div>
              </div>

              {/* CARD 2: TOTAL MINTED & PROGRESS BAR */}
              <div style={{
                background: 'rgba(2, 11, 26, 0.7)',
                border: '1px solid rgba(0, 245, 255, 0.25)',
                borderRadius: '12px',
                padding: '10px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', color: '#aaa' }}>TOTAL MINTED</span>
                  <span style={{ fontFamily: 'var(--vv-pixel)', fontSize: '9px', color: '#00f5ff' }}>
                    {totalMinted} / {maxSupply}
                  </span>
                </div>
                {/* Progress Bar */}
                <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(1, (totalMinted / maxSupply) * 100)}%`, height: '100%', background: 'linear-gradient(90deg, #00f5ff, #00ff88)' }} />
                </div>
              </div>

              {/* CARD 3: TOTAL BURNED */}
              <div style={{
                background: 'rgba(2, 11, 26, 0.7)',
                border: '1px solid rgba(255, 68, 102, 0.35)',
                borderRadius: '12px',
                padding: '10px 14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', color: '#ff4466', fontWeight: 900 }}>TOTAL BURNED BY MINT</span>
                  <span style={{ fontFamily: 'var(--vv-pixel)', fontSize: '9px', color: '#ffffff' }}>
                    {formatVibeComma(totalVibeBurnedByContract)}
                  </span>
                </div>
              </div>

              {/* USER WALLET BALANCES */}
              <div style={{ padding: '2px 4px' }}>
                <div style={{ fontSize: '8px', color: '#88aacc', marginBottom: '4px', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>
                  YOUR WALLET BALANCES:
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', color: '#aaa' }}>• ETH BALANCE:</span>
                  <span style={{ fontFamily: 'var(--vv-pixel)', fontSize: '9px', color: authenticated ? '#00f5ff' : '#ff4466' }}>
                    {authenticated ? `${Number(balances?.eth || 0).toFixed(4)} ETH` : 'NOT CONNECTED'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', color: '#aaa' }}>• $VIBE BALANCE:</span>
                  <span style={{ fontFamily: 'var(--vv-pixel)', fontSize: '9px', color: authenticated ? '#ffd700' : '#ff4466' }}>
                    {authenticated ? formatVibeComma(Math.floor(Number(balances?.vibe || 0))) : 'NOT CONNECTED'}
                  </span>
                </div>
              </div>

              {/* DUAL MINT ACTION BUTTONS (PINNED TO BOTTOM VIA MARGIN-TOP AUTO) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'auto', paddingTop: '4px' }}>
                {errorMessage && (
                  <div style={{
                    background: 'rgba(255, 68, 102, 0.15)',
                    border: '1px solid #ff4466',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '8px',
                    color: '#ff6688',
                    textAlign: 'center',
                    marginBottom: '4px'
                  }}>
                    ⚠️ {errorMessage}
                  </div>
                )}

                {mintSuccess && (
                  <div style={{
                    background: 'rgba(0, 255, 136, 0.15)',
                    border: '1.5px solid #00ff88',
                    borderRadius: '10px',
                    padding: '12px',
                    fontSize: '9px',
                    color: '#00ff88',
                    textAlign: 'center',
                    marginBottom: '6px',
                    boxShadow: '0 0 16px rgba(0, 255, 136, 0.3)'
                  }}>
                    🎉 MINT SUCCESSFUL! WELCOME TO VIBE CLUB!
                    {txHash && (
                      <div style={{ marginTop: '6px' }}>
                        <a
                          href={`https://basescan.org/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#00f5ff', textDecoration: 'underline', fontSize: '8px' }}
                        >
                          VIEW ON BASESCAN ↗
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {!authenticated ? (
                  /* SINGLE BUTTON WHEN UNAUTHENTICATED */
                  <button
                    onClick={login}
                    style={{
                      width: '100%',
                      height: '46px',
                      fontFamily: 'var(--vv-pixel)',
                      fontSize: '10px',
                      fontWeight: 900,
                      background: 'linear-gradient(135deg, #00f5ff 0%, #0050ff 100%)',
                      border: '2px solid #ffffff',
                      borderRadius: '10px',
                      color: '#ffffff',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(0, 245, 255, 0.4)',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <WalletSvgIcon size={14} /> CONNECT WALLET TO MINT
                  </button>
                ) : hasMinted ? (
                  /* ALREADY MINTED */
                  <div style={{
                    width: '100%',
                    padding: '14px',
                    background: 'rgba(0, 255, 136, 0.12)',
                    border: '2px solid #00ff88',
                    borderRadius: '10px',
                    textAlign: 'center',
                    color: '#00ff88',
                    fontSize: '10px',
                    fontWeight: 900,
                    boxShadow: '0 0 16px rgba(0, 255, 136, 0.3)'
                  }}>
                    ✓ YOU HAVE MINTED (1/1 MAX)
                    <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setShowSuccessModal(true)}
                        style={{
                          fontFamily: 'var(--vv-pixel)',
                          background: 'rgba(0, 245, 255, 0.15)',
                          border: '1.5px solid #00f5ff',
                          color: '#00f5ff',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '8px',
                          cursor: 'pointer',
                          fontWeight: 900,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        🎉 VIEW MINT CARD & SHARE
                      </button>
                      <a
                        href={`https://opensea.io/assets/base/${NFT_CONTRACT_ADDRESS}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#00f5ff', textDecoration: 'underline', fontSize: '8px' }}
                      >
                        VIEW ON OPENSEA ↗
                      </a>
                    </div>
                  </div>
                ) : (
                  /* DUAL MINT BUTTONS */
                  <>
                    {/* 1. MINT FOR ETH BUTTON */}
                    <button
                      onClick={mintWithETH}
                      disabled={isMintingEth || isMintingVibe || isApprovingVibe}
                      style={{
                        width: '100%',
                        height: '44px',
                        fontFamily: 'var(--vv-pixel)',
                        fontSize: '10px',
                        fontWeight: 900,
                        background: 'linear-gradient(135deg, #00f5ff 0%, #0050ff 100%)',
                        border: '2px solid #ffffff',
                        borderRadius: '10px',
                        color: '#ffffff',
                        cursor: (isMintingEth || isMintingVibe || isApprovingVibe) ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 16px rgba(0, 245, 255, 0.4)',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        opacity: (isMintingEth || isMintingVibe || isApprovingVibe) ? 0.7 : 1
                      }}
                    >
                      {isMintingEth ? 'MINTING ON BASE...' : `MINT FOR ${ethPriceFormatted} ETH`}
                    </button>

                    {/* ELEGANT "- OR -" DIVIDER */}
                    <div style={{
                      textAlign: 'center',
                      fontSize: '8px',
                      color: '#88aacc',
                      letterSpacing: '1px',
                      margin: '1px 0'
                    }}>
                      — OR —
                    </div>

                    {/* 2. MINT FOR $VIBE BUTTON */}
                    <button
                      onClick={handleMintWithVibeClick}
                      disabled={isMintingEth || isMintingVibe || isApprovingVibe}
                      style={{
                        width: '100%',
                        height: '44px',
                        fontFamily: 'var(--vv-pixel)',
                        fontSize: '10px',
                        fontWeight: 900,
                        background: 'linear-gradient(135deg, #ffd700 0%, #ff6b35 100%)',
                        border: '2px solid #ffffff',
                        borderRadius: '10px',
                        color: '#ffffff',
                        cursor: (isMintingEth || isMintingVibe || isApprovingVibe) ? 'not-allowed' : 'pointer',
                        boxShadow: '0 4px 16px rgba(255, 215, 0, 0.4)',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        opacity: (isMintingEth || isMintingVibe || isApprovingVibe) ? 0.7 : 1
                      }}
                    >
                      {isApprovingVibe
                        ? 'APPROVING $VIBE...'
                        : isMintingVibe
                        ? 'MINTING WITH $VIBE...'
                        : `MINT FOR ${formatVibeComma(currentDynamicVibeAmount)}`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* BOTTOM SECTION: 4 MINT PHASES STACKED VERTICALLY */}
          <div style={{
            borderTop: '1px solid rgba(0, 245, 255, 0.2)',
            paddingTop: '20px'
          }}>
            <div style={{
              fontSize: '9px',
              color: '#88aacc',
              marginBottom: '14px',
              letterSpacing: '0.5px',
              whiteSpace: 'nowrap'
            }}>
              MINT PHASES SCHEDULE:
            </div>

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              {phases.map((p, idx) => (
                <div
                  key={idx}
                  className="vv-nft-phase-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    background: p.active ? 'rgba(0, 245, 255, 0.12)' : 'rgba(2, 11, 26, 0.5)',
                    border: p.active ? '1.5px solid #00f5ff' : '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '12px',
                    padding: '14px 18px',
                    boxShadow: p.active ? '0 0 18px rgba(0, 245, 255, 0.25)' : 'none',
                    opacity: p.active ? 1 : 0.65,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {/* LEFT: PHASE TITLE & PULSE DOT */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {p.active && <span className="vv-pulse-indicator" />}
                    <span className="vv-nft-phase-text" style={{
                      fontFamily: 'var(--vv-pixel)',
                      fontSize: '9px',
                      color: p.active ? '#00ff88' : p.done ? '#ffd700' : '#ffffff',
                      whiteSpace: 'nowrap'
                    }}>
                      {p.phase} ({p.count}) {p.done ? '✓' : ''}
                    </span>
                  </div>

                  {/* RIGHT: COLORED PRICES */}
                  <div className="vv-nft-phase-prices" style={{
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    marginLeft: 'auto',
                    whiteSpace: 'nowrap',
                    flexShrink: 0
                  }}>
                    {p.done ? (
                      <span style={{ color: '#ffd700', letterSpacing: '0.4px' }}>{p.phase} COMPLETED</span>
                    ) : (
                      <>
                        <span style={{ color: '#00f5ff' }}>{p.price}</span>
                        <span className="vv-phase-vibe-part" style={{ color: '#88aacc' }}>/</span>
                        <span className="vv-phase-vibe-part" style={{ color: '#ffd700' }}>{p.vibePrice}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── FAQ & VIBE CLUB BENEFITS SECTION ── */}
        <div style={{
          marginTop: '48px',
          textAlign: 'left'
        }}>
          <h2 className="vv-faq-section-title" style={{
            fontFamily: 'var(--vv-pixel)',
            fontSize: '14px',
            color: '#00f5ff',
            textShadow: '0 0 16px rgba(0, 245, 255, 0.4)',
            marginBottom: '24px',
            letterSpacing: '0.6px',
            textAlign: 'center',
            whiteSpace: 'nowrap'
          }}>
            FAQ & CLUB BENEFITS
          </h2>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {/* FAQ 1: 80% AUTO-BURN & 20% REWARDS POOL */}
            <div className="vv-faq-card" style={{
              background: 'rgba(4, 20, 48, 0.75)',
              border: '1.5px solid rgba(255, 68, 102, 0.35)',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(12px)'
            }}>
              <div className="vv-faq-title" style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '11px',
                color: '#ff4466',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '13px' }}>🔥</span> 80% AUTO-BURN & 20% REWARDS POOL
              </div>

              <div className="vv-faq-text" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                color: '#a0b5d0',
                lineHeight: 1.8,
                letterSpacing: '0.3px',
                textTransform: 'uppercase'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#ff4466', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>80% OF ALL NFT MINT REVENUE AUTO BUYS & BURNS $VIBE TOKENS ON CONTRACT LEVEL.</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#00ff88', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>THE REMAINING 20% GOES DIRECTLY INTO THE COMMUNITY REWARDS POOL.</span>
                </div>
              </div>
            </div>

            {/* FAQ 2: VIBE CLUB PRIVILEGES */}
            <div className="vv-faq-card" style={{
              background: 'rgba(4, 20, 48, 0.75)',
              border: '1.5px solid rgba(0, 245, 255, 0.35)',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(12px)'
            }}>
              <div className="vv-faq-title" style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '11px',
                color: '#00f5ff',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '13px' }}>💎</span> VIBE CLUB PRIVILEGES
              </div>

              <div className="vv-faq-text" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                color: '#a0b5d0',
                lineHeight: 1.8,
                letterSpacing: '0.3px',
                textTransform: 'uppercase'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#00ff88', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>UNLOCKS EXCLUSIVE PERKS IN VIBE VERSE</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#ffd700', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>LIFETIME $VIBE ROYALTIES DISTRIBUTED TO NFT HOLDERS IN 10-DAY EPOCHS (15% OF REWARDS POOL)</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#00f5ff', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>DAO ACCESS AND MORE COMING SOON</span>
                </div>
              </div>
            </div>

            {/* FAQ 3: FCFS & 4-PHASE PROGRESSION */}
            <div className="vv-faq-card" style={{
              background: 'rgba(4, 20, 48, 0.75)',
              border: '1.5px solid rgba(255, 215, 0, 0.35)',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(12px)'
            }}>
              <div className="vv-faq-title" style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '11px',
                color: '#ffd700',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '13px' }}>⚡</span> FCFS MINT & 4-PHASE PROGRESSION
              </div>

              <div className="vv-faq-text" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                color: '#a0b5d0',
                lineHeight: 1.8,
                letterSpacing: '0.3px',
                textTransform: 'uppercase'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#ffd700', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>MINT OPERATES ON A STRICT FIRST-COME, FIRST-SERVED (FCFS) BASIS FOR ALL PARTICIPANTS.</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#00ff88', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>THE MINT IS DIVIDED INTO 4 PHASES (103 / 100 / 100 / 30 NFTS) WITH INCREASING PRICES.</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#00f5ff', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>AS SOON AS THE SPECIFIED NFT COUNT IN A PHASE IS MINTED OUT, THE NEXT PHASE AUTOMATICALLY BEGINS.</span>
                </div>
              </div>
            </div>

            {/* FAQ 4: PRIMARY MINT & OPENSEA TRADING */}
            <div className="vv-faq-card" style={{
              background: 'rgba(4, 20, 48, 0.75)',
              border: '1.5px solid rgba(32, 129, 226, 0.45)',
              borderRadius: '16px',
              padding: '22px 24px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(12px)'
            }}>
              <div className="vv-faq-title" style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '11px',
                color: '#2081e2',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <span style={{ fontSize: '13px' }}>🛡️</span> OFFICIAL MINT & SECONDARY MARKET
              </div>

              <div className="vv-faq-text" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                color: '#a0b5d0',
                lineHeight: 1.8,
                letterSpacing: '0.3px',
                textTransform: 'uppercase'
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#00ff88', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>PRIMARY MINT IS EXCLUSIVELY AVAILABLE ONLY ON THIS OFFICIAL VIBE LAUNCHPAD PAGE.</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#2081e2', fontSize: '9px', flexShrink: 0 }}>•</span>
                  <span>
                    THE COLLECTION IS FULLY VERIFIED & TRADEABLE ON{' '}
                    <a
                      href={`https://opensea.io/assets/base/${NFT_CONTRACT_ADDRESS}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#00f5ff',
                        textDecoration: 'underline',
                        fontWeight: 900,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        letterSpacing: '0.5px'
                      }}
                    >
                      OPENSEA ↗
                    </a>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── 👑 ADMIN-ONLY CONTROLS: SWAP & AUTO-BURN (AT THE VERY BOTTOM) ── */}
        {isAdmin && (
          <div style={{
            marginTop: '36px',
            background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.08), rgba(4, 20, 48, 0.95))',
            border: '2px dashed #ffd700',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 0 30px rgba(255, 215, 0, 0.2)',
            textAlign: 'left'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              <div style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '10px',
                color: '#ffd700',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>👑</span> ADMIN PANEL: SWAP & AUTO-BURN
              </div>
              <div style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                color: '#00f5ff',
                background: 'rgba(0, 245, 255, 0.12)',
                padding: '4px 10px',
                borderRadius: '8px',
                border: '1px solid #00f5ff'
              }}>
                CONTRACT ETH: {parseFloat(contractEthBalance || '0').toFixed(4)} ETH
              </div>
            </div>

            {/* DEX Router Setup Warning / 1-Click Fix */}
            {aggregatorRouterAddress?.toLowerCase() !== '0x6131b5fae19ea4f9d964eac0408e4408b66337b5'.toLowerCase() ? (
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                background: 'rgba(255, 68, 102, 0.15)',
                border: '1.5px solid #ff4466',
                borderRadius: '10px'
              }}>
                <div style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '8px',
                  color: '#ff6688',
                  marginBottom: '8px',
                  lineHeight: 1.5
                }}>
                  ⚠️ CONTRACT REQUIRES 1-CLICK ROUTER SYNC (O1 / KYBERSWAP DEX META-ROUTER):
                </div>
                <button
                  onClick={executeSetAggregatorRouter}
                  disabled={isSettingRouter}
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '8.5px',
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #00f5ff 0%, #00ff88 100%)',
                    border: '2px solid #ffffff',
                    borderRadius: '8px',
                    color: '#020b1a',
                    cursor: isSettingRouter ? 'not-allowed' : 'pointer',
                    boxShadow: '0 0 16px rgba(0, 255, 136, 0.4)',
                    textTransform: 'uppercase'
                  }}
                >
                  {isSettingRouter ? '⏳ CONNECTING ROUTER ON BASE...' : '⚡ 1-CLICK: CONNECT ON-CHAIN DEX SWAP ROUTER'}
                </button>
                {setRouterSuccess && (
                  <div style={{ marginTop: '6px', color: '#00ff88', fontSize: '7.5px', fontFamily: 'var(--vv-pixel)' }}>
                    ✓ DEX ROUTER CONNECTED SUCCESSFULLY!
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                marginBottom: '14px',
                padding: '6px 10px',
                background: 'rgba(0, 255, 136, 0.1)',
                border: '1px solid #00ff88',
                borderRadius: '8px',
                color: '#00ff88',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '7.5px'
              }}>
                ✓ ON-CHAIN DEX ROUTER CONNECTED (0x6131...37b5)
              </div>
            )}

            <p style={{
              fontFamily: 'var(--vv-pixel)',
              fontSize: '7.5px',
              color: '#a0b5d0',
              lineHeight: 1.6,
              marginBottom: '14px',
              textTransform: 'uppercase'
            }}>
              Execute `adminSwapAndBurn` with live DEX router calldata to swap contract ETH into $VIBE & burn 80% to Dead Address.
            </p>

            <div style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              marginBottom: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ flex: 1, minWidth: '140px', position: 'relative' }}>
                <input
                  type="number"
                  step="0.001"
                  min="0.0001"
                  value={adminEthInput}
                  onChange={(e) => setAdminEthInput(e.target.value)}
                  placeholder="0.005"
                  style={{
                    width: '100%',
                    background: 'rgba(2, 11, 26, 0.9)',
                    border: '1.5px solid #ffd700',
                    borderRadius: '10px',
                    color: '#ffd700',
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '11px',
                    padding: '10px 14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <span style={{
                  position: 'absolute',
                  right: '12px',
                  top: '11px',
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '9px',
                  color: '#88aacc'
                }}>
                  ETH
                </span>
              </div>

              {/* Quick Amount Buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {['0.001', '0.005', contractEthBalance || '0.005'].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setAdminEthInput(Number(preset).toFixed(4))}
                    style={{
                      fontFamily: 'var(--vv-pixel)',
                      fontSize: '8px',
                      background: 'rgba(255, 215, 0, 0.15)',
                      border: '1px solid rgba(255, 215, 0, 0.5)',
                      color: '#ffd700',
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 900
                    }}
                  >
                    {idx === 2 ? 'MAX' : `${preset}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons Grid */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Execute Swap Button */}
              <button
                onClick={() => executeAdminSwapAndBurn(adminEthInput)}
                disabled={isAdminSwapping || isWithdrawingEth || parseFloat(adminEthInput || '0') <= 0}
                style={{
                  width: '100%',
                  height: '44px',
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '9.5px',
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #ffd700 0%, #ff4466 100%)',
                  border: '2px solid #ffffff',
                  borderRadius: '10px',
                  color: '#ffffff',
                  cursor: (isAdminSwapping || isWithdrawingEth) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 16px rgba(255, 68, 102, 0.4)',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  textTransform: 'uppercase'
                }}
              >
                {isAdminSwapping ? '⏳ SWAPPING & BURNING...' : `🔥 EXECUTE SWAP & BURN (${adminEthInput} ETH)`}
              </button>

              {/* Withdraw Contract ETH to Admin Wallet Button */}
              <button
                onClick={executeWithdrawEth}
                disabled={isWithdrawingEth || isAdminSwapping || parseFloat(contractEthBalance || '0') <= 0}
                style={{
                  width: '100%',
                  height: '38px',
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '8.5px',
                  fontWeight: 900,
                  background: 'rgba(0, 245, 255, 0.12)',
                  border: '1.5px solid #00f5ff',
                  borderRadius: '10px',
                  color: '#00f5ff',
                  cursor: (isWithdrawingEth || isAdminSwapping) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  textTransform: 'uppercase',
                  boxShadow: '0 0 12px rgba(0, 245, 255, 0.2)'
                }}
              >
                {isWithdrawingEth ? '⏳ WITHDRAWING ETH...' : `💸 WITHDRAW ALL ETH TO ADMIN WALLET (${parseFloat(contractEthBalance || '0').toFixed(4)} ETH)`}
              </button>
            </div>

            {/* Status messages */}
            {withdrawSuccess && (
              <div style={{
                marginTop: '12px',
                padding: '10px',
                background: 'rgba(0, 255, 136, 0.15)',
                border: '1px solid #00ff88',
                borderRadius: '8px',
                color: '#00ff88',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                lineHeight: 1.6
              }}>
                ✓ ETH WITHDRAWN TO ADMIN WALLET SUCCESSFULLY!
                {adminTxHash && (
                  <div style={{ marginTop: '4px' }}>
                    <a
                      href={`https://basescan.org/tx/${adminTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#00f5ff', textDecoration: 'underline' }}
                    >
                      VIEW TRANSACTION ON BASESCAN ↗
                    </a>
                  </div>
                )}
              </div>
            )}
            {adminSwapSuccess && (
              <div style={{
                marginTop: '12px',
                padding: '10px',
                background: 'rgba(0, 255, 136, 0.15)',
                border: '1px solid #00ff88',
                borderRadius: '8px',
                color: '#00ff88',
                fontFamily: 'var(--vv-pixel)',
                fontSize: '8px',
                lineHeight: 1.6
              }}>
                ✓ SWAP & AUTO-BURN EXECUTED ON BASE! 80% $VIBE BURNED!
                {adminTxHash && (
                  <div style={{ marginTop: '4px' }}>
                    <a
                      href={`https://basescan.org/tx/${adminTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#00f5ff', textDecoration: 'underline' }}
                    >
                      VIEW TRANSACTION ON BASESCAN ↗
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* ── ADMIN NFT MINT & GIVEAWAY SECTION ── */}
            <div style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid rgba(0, 245, 255, 0.25)'
            }}>
              <div style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '10px',
                color: '#00f5ff',
                marginBottom: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>🎁</span> ADMIN NFT MINT & GIVEAWAY TOOLS
              </div>
              <p style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '7.5px',
                color: '#a0b5d0',
                lineHeight: 1.6,
                marginBottom: '14px',
                textTransform: 'uppercase'
              }}>
                Mint NFTs directly with your Admin wallet (bypasses 1/1 per-wallet limit) to your address or directly to giveaway winners.
              </p>

              {/* DIRECT ADMIN MINT (FREE) */}
              <div style={{
                background: 'rgba(2, 11, 26, 0.6)',
                border: '1px solid rgba(0, 245, 255, 0.3)',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '12px'
              }}>
                <div style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '8px',
                  color: '#ffd700',
                  marginBottom: '10px'
                }}>
                  👑 1. DIRECT FREE MINT (SPECIFY TOKEN ID & RECIPIENT):
                </div>

                <div style={{
                  display: 'flex',
                  gap: '8px',
                  flexDirection: 'column',
                  marginBottom: '10px'
                }}>
                  <div>
                    <div style={{ fontSize: '7px', color: '#88aacc', fontFamily: 'var(--vv-pixel)', marginBottom: '4px' }}>
                      RECIPIENT ADDRESS (LEAVE EMPTY TO MINT TO YOUR ADMIN WALLET):
                    </div>
                    <input
                      type="text"
                      value={adminMintRecipient}
                      onChange={(e) => setAdminMintRecipient(e.target.value)}
                      placeholder={walletAddress || '0x... (Recipient Address)'}
                      style={{
                        width: '100%',
                        background: 'rgba(2, 11, 26, 0.9)',
                        border: '1px solid #00f5ff',
                        borderRadius: '8px',
                        color: '#00f5ff',
                        fontFamily: 'var(--vv-pixel)',
                        fontSize: '8px',
                        padding: '8px 10px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ fontSize: '7px', color: '#88aacc', fontFamily: 'var(--vv-pixel)', marginBottom: '4px' }}>
                      TOKEN ID (1 - 333):
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="333"
                      value={adminMintTokenId}
                      onChange={(e) => setAdminMintTokenId(e.target.value)}
                      placeholder="104"
                      style={{
                        width: '100%',
                        background: 'rgba(2, 11, 26, 0.9)',
                        border: '1px solid #ffd700',
                        borderRadius: '8px',
                        color: '#ffd700',
                        fontFamily: 'var(--vv-pixel)',
                        fontSize: '9px',
                        padding: '8px 10px',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <button
                  onClick={() => executeAdminDirectMint(adminMintRecipient, adminMintTokenId)}
                  disabled={isAdminDirectMinting || isMintingEth || isMintingVibe || !adminMintTokenId}
                  style={{
                    width: '100%',
                    height: '38px',
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '9px',
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #00f5ff 0%, #00ff88 100%)',
                    border: '2px solid #ffffff',
                    borderRadius: '8px',
                    color: '#020b1a',
                    cursor: (isAdminDirectMinting || isMintingEth || isMintingVibe || !adminMintTokenId) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 0 16px rgba(0, 255, 136, 0.35)',
                    textTransform: 'uppercase'
                  }}
                >
                  {isAdminDirectMinting ? '⏳ MINTING DIRECTLY ON BASE...' : `👑 FREE ADMIN MINT NFT #${adminMintTokenId || '?'}`}
                </button>
              </div>

              {/* ADMIN PUBLIC PHASE MINTING (WITH ETH OR VIBE) */}
              <div style={{
                background: 'rgba(2, 11, 26, 0.6)',
                border: '1px solid rgba(255, 215, 0, 0.3)',
                borderRadius: '10px',
                padding: '12px'
              }}>
                <div style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '8px',
                  color: '#ffd700',
                  marginBottom: '10px'
                }}>
                  🎲 2. RANDOM MINT (CURRENT PHASE PRICE, UNLIMITED FOR ADMIN):
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button
                    onClick={mintWithETH}
                    disabled={isMintingEth || isMintingVibe || isApprovingVibe || isAdminDirectMinting}
                    style={{
                      height: '38px',
                      fontFamily: 'var(--vv-pixel)',
                      fontSize: '8px',
                      fontWeight: 900,
                      background: 'linear-gradient(135deg, #00f5ff 0%, #0050ff 100%)',
                      border: '1.5px solid #ffffff',
                      borderRadius: '8px',
                      color: '#ffffff',
                      cursor: (isMintingEth || isMintingVibe || isApprovingVibe || isAdminDirectMinting) ? 'not-allowed' : 'pointer',
                      textTransform: 'uppercase',
                      boxShadow: '0 0 12px rgba(0, 245, 255, 0.25)'
                    }}
                  >
                    {isMintingEth ? 'MINTING...' : `MINT WITH ETH (${ethPriceFormatted} ETH)`}
                  </button>

                  <button
                    onClick={handleMintWithVibeClick}
                    disabled={isMintingEth || isMintingVibe || isApprovingVibe || isAdminDirectMinting}
                    style={{
                      height: '38px',
                      fontFamily: 'var(--vv-pixel)',
                      fontSize: '8px',
                      fontWeight: 900,
                      background: 'linear-gradient(135deg, #ffd700 0%, #ff6b35 100%)',
                      border: '1.5px solid #ffffff',
                      borderRadius: '8px',
                      color: '#ffffff',
                      cursor: (isMintingEth || isMintingVibe || isApprovingVibe || isAdminDirectMinting) ? 'not-allowed' : 'pointer',
                      textTransform: 'uppercase',
                      boxShadow: '0 0 12px rgba(255, 215, 0, 0.25)'
                    }}
                  >
                    {isMintingVibe ? 'MINTING...' : `MINT WITH $VIBE`}
                  </button>
                </div>
              </div>

              {/* Status messages for Admin Direct Mint */}
              {adminMintSuccess && (
                <div style={{
                  marginTop: '12px',
                  padding: '10px',
                  background: 'rgba(0, 255, 136, 0.15)',
                  border: '1px solid #00ff88',
                  borderRadius: '8px',
                  color: '#00ff88',
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '8px',
                  lineHeight: 1.6
                }}>
                  🎉 NFT #{adminMintedTokenId} SUCCESSFULLY MINTED FOR {adminMintRecipient || 'ADMIN WALLET'}!
                  {adminTxHash && (
                    <div style={{ marginTop: '4px' }}>
                      <a
                        href={`https://basescan.org/tx/${adminTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#00f5ff', textDecoration: 'underline' }}
                      >
                        VIEW TRANSACTION ON BASESCAN ↗
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── SUCCESS MINT MODAL POPUP ── */}
      {showSuccessModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 5, 17, 0.88)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: 'linear-gradient(145deg, rgba(4, 20, 48, 0.96), rgba(2, 11, 26, 0.98))',
            border: '2px solid #00f5ff',
            borderRadius: '24px',
            padding: '28px 24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 0 50px rgba(0, 245, 255, 0.4), 0 20px 60px rgba(0, 0, 0, 0.9)',
            position: 'relative',
            textAlign: 'center',
            boxSizing: 'border-box'
          }}>
            {/* CLOSE BUTTON (X) */}
            <button
              onClick={() => setShowSuccessModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(0, 245, 255, 0.4)',
                color: '#00f5ff',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                zIndex: 10
              }}
            >
              ✕
            </button>

            {/* CELEBRATION BADGE */}
            <div style={{
              fontSize: '8px',
              color: '#00ff88',
              letterSpacing: '1px',
              marginBottom: '8px',
              background: 'rgba(0, 255, 136, 0.12)',
              border: '1px solid #00ff88',
              padding: '4px 12px',
              borderRadius: '12px',
              display: 'inline-block'
            }}>
              🎉 MINT SUCCESSFUL!
            </div>

            {/* HEADER TITLE (100% CENTERED & RESPONSIVE FOR LONG NAMES) */}
            <h2 style={{
              fontFamily: 'var(--vv-pixel)',
              fontSize: '11px',
              color: '#00f5ff',
              textShadow: '0 0 14px rgba(0, 245, 255, 0.5)',
              margin: '8px auto 14px auto',
              lineHeight: 1.5,
              letterSpacing: '0.4px',
              textAlign: 'center',
              width: '100%',
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              padding: '0 16px',
              boxSizing: 'border-box'
            }}>
              VIBE CLUB #{modalNftId} {modalCleanName.toUpperCase()}
            </h2>

            {/* NFT IMAGE DISPLAY */}
            <div style={{
              position: 'relative',
              borderRadius: '16px',
              overflow: 'hidden',
              border: '2px solid #00f5ff',
              boxShadow: '0 0 24px rgba(0, 245, 255, 0.3)',
              aspectRatio: '1/1',
              maxWidth: '250px',
              margin: '0 auto 16px auto',
              background: '#020b1a'
            }}>
              <img
                src={`/nft/images/${modalNftId}.png`}
                onError={(e) => handleImageError(e, modalNftId)}
                alt={`Vibe Club #${modalNftId}`}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block'
                }}
              />
            </div>

            {/* STEPS FLOW: STEP 1 (SAVE IMAGE) -> STEP 2 (SHARE ON X) */}
            <div style={{ marginTop: '10px' }}>
              {/* STEP HEADERS WITH CONNECTOR LINE */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
                position: 'relative',
                padding: '0 6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', zIndex: 2 }}>
                  <span style={{
                    background: '#00f5ff',
                    color: '#020b1a',
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '7.5px',
                    fontWeight: 900,
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    1
                  </span>
                  <span style={{
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '7.5px',
                    color: '#00f5ff',
                    letterSpacing: '0.4px'
                  }}>
                    SAVE IMAGE
                  </span>
                </div>

                {/* CONNECTOR LINE WITH ARROW */}
                <div style={{
                  flex: 1,
                  height: '2px',
                  background: 'linear-gradient(90deg, #00f5ff, #1da1f2)',
                  margin: '0 8px',
                  position: 'relative',
                  opacity: 0.7
                }}>
                  <span style={{
                    position: 'absolute',
                    right: '-2px',
                    top: '-5.5px',
                    fontSize: '8px',
                    color: '#1da1f2'
                  }}>
                    ▶
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', zIndex: 2 }}>
                  <span style={{
                    background: '#1da1f2',
                    color: '#ffffff',
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '7.5px',
                    fontWeight: 900,
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    2
                  </span>
                  <span style={{
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '7.5px',
                    color: '#1da1f2',
                    letterSpacing: '0.4px'
                  }}>
                    SHARE ON X
                  </span>
                </div>
              </div>

              {/* ACTION BUTTONS GRID */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px'
              }}>
                {/* 1. SAVE IMAGE BUTTON */}
                <button
                  onClick={handleSaveImage}
                  style={{
                    height: '44px',
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '9px',
                    fontWeight: 900,
                    background: 'linear-gradient(135deg, #00f5ff 0%, #0050ff 100%)',
                    border: '1.5px solid #ffffff',
                    borderRadius: '12px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(0, 245, 255, 0.35)',
                    letterSpacing: '0.4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '0 4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  📥 SAVE IMAGE
                </button>

                {/* 2. SHARE ON X BUTTON */}
                <button
                  onClick={handleShareOnX}
                  style={{
                    height: '44px',
                    fontFamily: 'var(--vv-pixel)',
                    fontSize: '9px',
                    fontWeight: 900,
                    background: '#000000',
                    border: '1.5px solid #1da1f2',
                    borderRadius: '12px',
                    color: '#1da1f2',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(29, 161, 242, 0.3)',
                    letterSpacing: '0.4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '0 4px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  SHARE ON X
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
