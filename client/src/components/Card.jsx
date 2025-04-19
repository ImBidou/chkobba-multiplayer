// client/src/components/Card.jsx
import React from 'react';
import { useTheme } from '../ThemeContext';
import './Card.css';

// Helper map for rank names used in filenames
const rankToFileRank = {
    'A': 'ace', '2': 'two', '3': 'three', '4': 'four', '5': 'five',
    '6': 'six', '7': 'seven', 'J': 'jack', 'Q': 'queen', 'K': 'king'
};

function Card({ card, isSelected, onClick, isFaceDown }) {
    const { theme } = useTheme();

    const hasCardData = card && card.id && card.value && card.suit;

    // Prepare data needed for classes and image paths
    const internalRank = hasCardData ? card.value : ''; // e.g., 'K', '7', 'A'
    const internalSuit = hasCardData ? card.suit : ''; // e.g., 'diamonds', 'hearts'

    const fileRank = rankToFileRank[internalRank] || ''; // e.g., 'king', 'seven', 'ace'
    const fileSuit = internalSuit.toLowerCase(); // e.g., 'diamonds', 'hearts'

    const displayValue = internalRank; // Text display still uses 'K', '7', 'A'
    const displaySuit = hasCardData ? getSuitIcon(internalSuit) : '';

    // Dynamic classes
    const suitClass = fileSuit; // Use lowercase suit for class
    const rankClass = fileRank ? `rank-${fileRank}` : ''; // Use file rank for class if needed
    // Add 'has-face-image' class if we intend to show a custom face image
    const showCustomFace = hasCardData && !isFaceDown;
    const cardClass = `card theme-${theme} ${suitClass} ${rankClass} ${isSelected ? 'selected' : ''} ${isFaceDown || !hasCardData ? 'face-down' : ''} ${showCustomFace ? 'has-face-image' : ''}`;

    const handleClick = onClick && !isFaceDown && hasCardData ? () => onClick(card.id) : undefined;

    // Calculate inline styles
    const cardBackImageUrl = `${process.env.PUBLIC_URL}/decks/${theme}/card_back.webp`;
    const cardBackStyle = { backgroundImage: `url('${cardBackImageUrl}')` };

    let cardFaceStyle = {};
    if (showCustomFace && fileSuit && fileRank) {
        const cardFaceImageUrl = `${process.env.PUBLIC_URL}/decks/${theme}/${fileSuit}_${fileRank}.webp`;
        cardFaceStyle = { backgroundImage: `url('${cardFaceImageUrl}')` };
        console.log(`Card ${card.id} Theme ${theme} -> Face URL: ${cardFaceImageUrl}`); // Debug log
    }

    return (
        <div className={cardClass} onClick={handleClick}>
            <div className="card-face" style={cardFaceStyle}> {/* Apply face style */}
                {/* Text content might be hidden by CSS if .has-face-image */}
                <div className="card-value top-left">{displayValue}</div>
                <div className="card-suit-icon">{displaySuit}</div>
                <div className="card-value bottom-right">{displayValue}</div>
            </div>
            <div className="card-back" style={cardBackStyle}></div>
        </div>
    );
}

function getSuitIcon(suit) {
    // Use lowercase suit name received from constants/server
    switch (suit?.toLowerCase()) {
        case 'diamonds': return '♦'; // Changed from dineri
        case 'hearts': return '♥';
        case 'clubs': return '♣';
        case 'spades': return '♠';
        default: return '?';
    }
}

export default Card;