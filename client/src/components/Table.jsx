// client/src/components/Table.jsx
import React from 'react';
import Card from './Card';
import './Table.css'; // We'll create this CSS file below

function Table({ tableCards }) {
    // Ensure tableCards is always an array
    const cardsOnTable = Array.isArray(tableCards) ? tableCards : [];

    return (
        <div className="table">
            <div className="table-cards">
                {cardsOnTable.length === 0 && <div className="table-placeholder">Table empty</div>}
                {cardsOnTable.map(card => (
                    <Card key={card.id} card={card} /> // Table cards are always face up
                ))}
            </div>
        </div>
    );
}

export default Table;