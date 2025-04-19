// client/src/GameRouter.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { socket, connectSocket } from './socket';
import GameScreen_1v1 from './GameScreen_1v1';
import GameScreen_2v2 from './GameScreen_2v2';

function GameRouter() {
    const { roomId } = useParams();
    const navigate = useNavigate();
    const [mode, setMode] = useState(null); // '1v1', '2v2', or null initially
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isMounted = true; // Prevent state update on unmounted component

        const handleRoomInfo = (data) => {
            if (!isMounted) return;
            if (data && data.roomId === roomId) { // Check response is for this room
                 if (data.error) {
                     console.error("Error getting room info:", data.error);
                     setError(`Error joining room: ${data.error}`);
                     setTimeout(() => navigate('/'), 3000); // Go home on error
                 } else if (data.mode) {
                    console.log(`GameRouter: Received mode ${data.mode} for room ${roomId}`);
                    setMode(data.mode);
                } else {
                     setError("Could not determine game mode.");
                }
            }
             setIsLoading(false);
        };

        const handleDisconnect = () => {
             if (!isMounted) return;
             setError("Disconnected from server.");
             setIsLoading(false);
        };

        socket.on('roomInfoResponse', handleRoomInfo);
        socket.on('disconnect', handleDisconnect);
        connectSocket(); // Ensure connection

        // Request room info if connected, otherwise wait for connect
        if (socket.connected) {
            console.log(`GameRouter: Requesting info for room ${roomId}`);
            socket.emit('getRoomInfo', { roomId });
        } else {
             // Wait for connection event
             const handleConnect = () => {
                 if(isMounted) {
                     console.log(`GameRouter: Requesting info for room ${roomId} after connect.`);
                     socket.emit('getRoomInfo', { roomId });
                 }
             }
             socket.once('connect', handleConnect);
             // Clean up temporary connect listener if component unmounts first
             return () => socket.off('connect', handleConnect);
        }


        // Cleanup
        return () => {
            isMounted = false;
            socket.off('roomInfoResponse', handleRoomInfo);
            socket.off('disconnect', handleDisconnect);
        };

    }, [roomId, navigate]); // Re-run if roomId changes

    if (isLoading) {
        return <div className="game-layout"><p>Fetching room details...</p></div>;
    }

    if (error) {
        return <div className="game-layout"><p style={{color: 'red'}}>{error}</p></div>;
    }

    if (mode === '1v1') {
        return <GameScreen_1v1 />;
    } else if (mode === '2v2') {
        return <GameScreen_2v2 />;
    } else {
        // Should not happen if server responds correctly
        return <div className="game-layout"><p>Unknown game mode for room {roomId}.</p></div>;
    }
}

export default GameRouter;