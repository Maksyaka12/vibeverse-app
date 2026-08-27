import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useUserBalances } from '../hooks/useUserBalances';
import { useVibeNftContract, NFT_CONTRACT_ADDRESS, OPENSEA_COLLECTION_URL } from '../../hooks/useVibeNftContract';

export default function NftMintPanel({ player }) {
  const { user, authenticated, login } = usePrivy();
  const balances = useUserBalances(user?.wallet?.address);

  const {
    totalMinted,
    remainingTokens,
    maxSupply,
    ethPriceFormatted,
    vibePriceFormatted,
    hasMinted,
    isMintingEth,
    isMintingVibe,
    isApprovingVibe,
    txHash,
    errorMessage,
    mintSuccess,
    mintWithETH,
    mintWithVIBE
  } = useVibeNftContract();

  const [previewId, setPreviewId] = useState(1);

  useEffect(() => {
    const t = setInterval(() => {
      setPreviewId((p) => (p % 333) + 1);
    }, 4000);
    return () => clearInterval(t);
  }, []);

  const phases = [
    { phase: 'Phase 1', count: '103 NFT', price: `${ethPriceFormatted} ETH`, vibe: `${vibePriceFormatted} VIBE`, active: currentPhase === 1, done: currentPhase > 1 || totalMinted >= 103 },
    { phase: 'Phase 2', count: '100 NFT', price: '0.015 ETH', vibe: '3,000,000 VIBE', active: currentPhase === 2, done: currentPhase > 2 || totalMinted >= 203 },
    { phase: 'Phase 3', count: '100 NFT', price: '0.05 ETH', vibe: '10,000,000 VIBE', active: currentPhase === 3, done: currentPhase > 3 || totalMinted >= 303 },
    { phase: 'Phase 4', count: '30 NFT', price: '0.1 ETH', vibe: '20,000,000 VIBE', active: currentPhase === 4, done: false },
  ];

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: '#fff', fontSize: '12px', padding: '4px' }}>
      {/* ── 1. TOP MAIN CARD: LEFT NFT IMAGE + RIGHT DETAILS & DUAL MINT BUTTONS ── */}
      <div className="vv-nft-top-card" style={{
        background: 'rgba(4, 20, 48, 0.95)',
        border: '2.5px solid #00f5ff',
        borderRadius: '16px',
        padding: '24px 30px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '30px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 28px rgba(0, 245, 255, 0.25)'
      }}>
        {/* Left Side: Large NFT Image */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <img
            src={`/nft/images/${previewId}.png`}
            onError={(e) => { e.target.src = '/vibe-dog.jpg'; }}
            alt="Genesis NFT"
            className="vv-nft-main-img"
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '16px',
              border: '4px solid #ffd700',
              objectFit: 'cover',
              boxShadow: '0 0 28px rgba(255, 215, 0, 0.55)',
              imageRendering: 'pixelated'
            }}
          />
          <span style={{
            position: 'absolute',
            bottom: '-8px',
            right: '-8px',
            background: 'linear-gradient(135deg, #ff007f 0%, #ff44aa 100%)',
            color: '#fff',
            fontSize: '11px',
            padding: '4px 12px',
            borderRadius: '6px',
            fontWeight: 900,
            border: '1.5px solid #fff',
            boxShadow: '0 3px 10px rgba(0,0,0,0.6)'
          }}>
            GENESIS #{previewId}
          </span>
        </div>

        {/* Right Side: Phase Badge, Title, Counter & Mint Buttons */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Pulsing Phase Badge + Contract Link */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0, 255, 136, 0.12)',
              border: '1.5px solid #00ff88',
              borderRadius: '8px',
              padding: '4px 10px',
              boxShadow: '0 0 12px rgba(0, 255, 136, 0.3)'
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#00ff88',
                boxShadow: '0 0 8px #00ff88'
              }} />
              <span style={{ fontSize: '10px', color: '#00ff88', fontWeight: 900, letterSpacing: '0.8px' }}>
                PHASE 1 LIVE
              </span>
            </div>

            <a
              href={OPENSEA_COLLECTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: '#00f5ff',
                fontSize: '10px',
                fontWeight: 900,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              OPENSEA ↗
            </a>
          </div>

          <div>
            <div style={{
              fontSize: '22px',
              color: '#ffd700',
              fontWeight: 900,
              letterSpacing: '1px',
              marginBottom: '4px',
              textShadow: '2px 2px 0 #000, 0 0 16px rgba(255, 215, 0, 0.6)'
            }}>
              VIBE CLUB GENESIS
            </div>
            <div style={{ fontSize: '12px', color: '#00f5ff', fontWeight: 900 }}>
              MINTED: <strong style={{ color: '#fff', fontSize: '14px' }}>{totalMinted}</strong> / {maxSupply} (1 NFT MAX PER WALLET)
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div style={{
              background: 'rgba(255, 68, 102, 0.15)',
              border: '1px solid #ff4466',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '10px',
              color: '#ff6688'
            }}>
              ⚠️ {errorMessage}
            </div>
          )}

          {/* Success Message */}
          {mintSuccess && (
            <div style={{
              background: 'rgba(0, 255, 136, 0.15)',
              border: '1.5px solid #00ff88',
              borderRadius: '8px',
              padding: '8px 12px',
              fontSize: '11px',
              color: '#00ff88',
              textAlign: 'center'
            }}>
              🎉 MINT SUCCESSFUL! WELCOME TO VIBE CLUB!
              {txHash && (
                <div style={{ marginTop: '4px' }}>
                  <a
                    href={`https://basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#00f5ff', fontSize: '10px' }}
                  >
                    View on BaseScan ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Mint Buttons */}
          {!authenticated ? (
            <button
              onClick={login}
              style={{
                fontFamily: 'var(--vv-pixel)',
                fontSize: '12px',
                fontWeight: 900,
                background: 'linear-gradient(135deg, #00f5ff 0%, #0050ff 100%)',
                border: '2px solid #ffffff',
                borderRadius: '10px',
                padding: '12px 20px',
                color: '#ffffff',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(0, 245, 255, 0.4)'
              }}
            >
              CONNECT WALLET TO MINT
            </button>
          ) : hasMinted ? (
            <div style={{
              padding: '12px',
              background: 'rgba(0, 255, 136, 0.12)',
              border: '2px solid #00ff88',
              borderRadius: '10px',
              textAlign: 'center',
              color: '#00ff88',
              fontWeight: 900,
              fontSize: '12px'
            }}>
              ✓ YOU ALREADY OWN A VIBE CLUB NFT (1/1 MAX)
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <button
                onClick={mintWithETH}
                disabled={isMintingEth || isMintingVibe || isApprovingVibe}
                style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '11px',
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #00f5ff 0%, #0050ff 100%)',
                  border: '2px solid #ffffff',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#ffffff',
                  cursor: (isMintingEth || isMintingVibe || isApprovingVibe) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(0, 245, 255, 0.4)',
                  opacity: (isMintingEth || isMintingVibe || isApprovingVibe) ? 0.7 : 1
                }}
              >
                {isMintingEth ? 'MINTING...' : `MINT: ${ethPriceFormatted} ETH`}
              </button>

              <button
                onClick={mintWithVIBE}
                disabled={isMintingEth || isMintingVibe || isApprovingVibe}
                style={{
                  fontFamily: 'var(--vv-pixel)',
                  fontSize: '11px',
                  fontWeight: 900,
                  background: 'linear-gradient(135deg, #ffd700 0%, #ff6b35 100%)',
                  border: '2px solid #ffffff',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  color: '#ffffff',
                  cursor: (isMintingEth || isMintingVibe || isApprovingVibe) ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 12px rgba(255, 215, 0, 0.4)',
                  opacity: (isMintingEth || isMintingVibe || isApprovingVibe) ? 0.7 : 1
                }}
              >
                {isApprovingVibe ? 'APPROVING...' : isMintingVibe ? 'MINTING...' : `MINT: ${vibePriceFormatted} $VIBE`}
              </button>
            </div>
          )}

          <div style={{ fontSize: '10px', color: '#88aacc', display: 'flex', justifyContent: 'space-between' }}>
            <span>ETH: <strong style={{ color: '#00f5ff' }}>{balances.loading ? '...' : `${balances.ethFormatted} ETH`}</strong></span>
            <span>$VIBE: <strong style={{ color: '#ffd700' }}>{balances.loading ? '...' : `${balances.vibe} VIBE`}</strong></span>
          </div>
        </div>
      </div>

      {/* ── 2. MIDDLE SECTION: MINT PRICING PHASES ── */}
      <div style={{
        background: 'rgba(2, 11, 26, 0.85)',
        border: '1.5px solid rgba(0, 245, 255, 0.3)',
        borderRadius: '14px',
        padding: '16px 20px',
        marginBottom: '16px',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6)'
      }}>
        <div style={{ color: '#ffd700', fontSize: '11px', marginBottom: '10px', letterSpacing: '0.8px', fontWeight: 900 }}>
          MINT PRICING PHASES
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {phases.map((p) => (
            <div
              key={p.phase}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 16px',
                borderRadius: '8px',
                background: p.active ? 'rgba(0, 245, 255, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: p.active ? '1.5px solid #00f5ff' : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: p.active ? '0 0 16px rgba(0, 245, 255, 0.25)' : 'none',
                width: '100%'
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 900, color: p.active ? '#00f5ff' : p.done ? '#00ff88' : '#ffffff', letterSpacing: '0.5px' }}>
                {p.phase} <span style={{ color: '#88aacc', fontSize: '10px', marginLeft: '6px' }}>({p.count})</span>
              </div>
              <div style={{ fontSize: '11px', fontWeight: 900, color: p.done ? '#00ff88' : p.active ? '#ffd700' : '#888888', letterSpacing: '0.5px' }}>
                {p.done ? `${p.phase.toUpperCase()} COMPLETED` : `${p.price} / ${p.vibe}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. BOTTOM SECTION: EXPLANATORY BENEFIT CARDS ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px'
      }}>
        {/* Card 1: 80% Buyback & Burn + 20% Treasury */}
        <div style={{
          background: 'rgba(2, 11, 26, 0.9)',
          border: '1.5px solid rgba(255, 68, 170, 0.4)',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 4px 16px rgba(255, 68, 170, 0.15)'
        }}>
          <div style={{ fontSize: '11px', color: '#ff44aa', fontWeight: 900, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🔥</span> 80% BURN / 20% POOL
          </div>
          <div style={{ fontSize: '9.5px', color: '#ccc', lineHeight: 1.5 }}>
            80% of all ETH & $VIBE from mints is permanently burned to 0x...dEaD, 20% funds the Community rewards pool.
          </div>
        </div>

        {/* Card 2: Elite Community */}
        <div style={{
          background: 'rgba(2, 11, 26, 0.9)',
          border: '1.5px solid rgba(255, 215, 0, 0.4)',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 4px 16px rgba(255, 215, 0, 0.15)'
        }}>
          <div style={{ fontSize: '11px', color: '#ffd700', fontWeight: 900, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>👑</span> GENESIS PRIVILEGES
          </div>
          <div style={{ fontSize: '9.5px', color: '#ccc', lineHeight: 1.5 }}>
            Vibe Club members receive lifetime royalties distributed every 10-day epoch (15% of Community Rewards Pool), VIP roles, and premier status.
          </div>
        </div>

        {/* Card 3: Game Perks */}
        <div style={{
          background: 'rgba(2, 11, 26, 0.9)',
          border: '1.5px solid rgba(0, 245, 255, 0.4)',
          borderRadius: '12px',
          padding: '14px 16px',
          boxShadow: '0 4px 16px rgba(0, 245, 255, 0.15)'
        }}>
          <div style={{ fontSize: '11px', color: '#00f5ff', fontWeight: 900, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>🎮</span> IN-GAME PERKS
          </div>
          <div style={{ fontSize: '9.5px', color: '#ccc', lineHeight: 1.5 }}>
            Exclusive avatars in VibeVerse, custom badges, unlockable locations, and boosted daily rewards.
          </div>
        </div>
      </div>
    </div>
  );
}
