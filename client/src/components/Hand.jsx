// client/src/components/Hand.jsx
import React from 'react';
import Card from './Card';
import './Hand.css'; // We'll create this CSS file below

function Hand({ hand, onCardSelect, selectedPlayerCardId, isOpponent }) {
    // Ensure hand is always an array, even if null/undefined initially
    const cardsInHand = Array.isArray(hand) ? hand : [];

    return (
        <div className="hand">
            {/* If opponent and hand empty, maybe show placeholder */}
            {isOpponent && cardsInHand.length === 0 && <div className="hand-placeholder">No cards</div>}

            {/* Render actual cards */}
            {cardsInHand.map((card, index) => (
                <Card
                    // Use a more robust key if possible, index is fallback
                    key={card?.id || `opponent-card-${index}`}
                    card={card}
                    // isSelected only matters for the player's hand
                    isSelected={!isOpponent && card?.id === selectedPlayerCardId}
                    // onClick only works for the player's hand cards
                    onClick={!isOpponent && onCardSelect ? onCardSelect : undefined}
                    // Opponent cards are face down, or if card data is missing show back
                    isFaceDown={isOpponent || !card?.value}
                />
            ))}
        </div>
    );
}

export default Hand;