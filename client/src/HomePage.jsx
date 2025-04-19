// client/src/HomePage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket, connectSocket, emitCreateRoom, emitJoinRoom } from './socket';
import { useTheme } from './ThemeContext';

function HomePage() {
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [winningScore, setWinningScore] = useState(11);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isConnected, setIsConnected] = useState(socket.connected);

  const themeContext = useTheme();
  const { theme = 'nan', changeTheme = () => {}, availableThemes = ['nan'] } = themeContext || {};

  useEffect(() => {
    const onConnect = () => { setIsConnected(true); setErrorMessage(''); };
    const onDisconnect = () => { setIsConnected(false); setErrorMessage('Disconnected'); };
    const onError = () => { setIsConnected(false); setErrorMessage('Connection failed'); };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onError);
    if (!socket.connected) connectSocket();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onError);
    };
  }, []);

  const handleCreateRoom = (mode) => {
    if (!isConnected) return setErrorMessage('Not connected');
    if (!playerName.trim()) return setErrorMessage('Enter name');
    setErrorMessage(''); setIsLoading(true);
    emitCreateRoom({ playerName: playerName.trim(), mode, winningScore, deckTheme: theme }, (res) => {
      setIsLoading(false);
      if (res.success) navigate(`/game/${res.roomId}`);
      else setErrorMessage(res.message || 'Failed to create room');
    });
  };

  const handleJoinRoom = () => {
    if (!isConnected) return setErrorMessage('Not connected');
    if (!playerName.trim()) return setErrorMessage('Enter name');
    if (!roomCode.trim()) return setErrorMessage('Enter room code');
    setErrorMessage(''); setIsLoading(true);
    emitJoinRoom({ playerName: playerName.trim(), roomId: roomCode.trim() }, (res) => {
      setIsLoading(false);
      if (res.success) navigate(`/game/${res.roomId}`);
      else setErrorMessage(res.message || 'Failed to join room');
    });
  };

  const status = errorMessage || (!isConnected ? 'Connecting...' : '');

  // Inline styles
  const containerStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', margin: 0, background: 'linear-gradient(135deg, #5D3FD3 0%, #8E44AD 100%)' };
  const cardStyle = { background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)', padding: '2rem', borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxWidth: '400px', width: '100%', textAlign: 'center' };
  const titleStyle = { fontSize: '2.5rem', margin: '0 0 1rem', color: '#2C3E50', textShadow: '1px 1px 4px rgba(0,0,0,0.1)' };
  const statusStyle = { color: '#E74C3C', margin: '0.5rem 0', fontWeight: 500 };
  const fieldStyle = { margin: '1rem 0', textAlign: 'left' };
  const labelStyle = { display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#34495E' };
  const inputStyle = { width: '100%', padding: '0.75rem 1rem', fontSize: '1rem', borderRadius: '8px', border: '2px solid #DDD', transition: 'border-color 0.3s', boxSizing: 'border-box' };
  const selectStyle = { ...inputStyle };
  const optionsRowStyle = { display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' };
  const optionBtnStyle = { flex: 1, padding: '0.75rem', border: '2px solid #6C5B7B', borderRadius: '8px', background: 'transparent', cursor: 'pointer', transition: 'all 0.3s', color: '#6C5B7B' };
  const activeOptionBtn = { background: '#6C5B7B', color: '#FFF', transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' };
  const createBtnGroupStyle = { display: 'flex', gap: '0.5rem', marginTop: '1rem' };
  const createBtnStyle = { flex: 1, padding: '0.75rem', background: '#8E44AD', border: 'none', borderRadius: '8px', color: '#FFF', fontSize: '1rem', cursor: 'pointer', transition: 'background 0.3s' };
  const joinRowStyle = { display: 'flex', gap: '0.5rem' };
  const joinInputStyle = { ...inputStyle, flex: 1 };
  const joinBtnStyle = { padding: '0.75rem 1rem', background: '#5D3FD3', border: 'none', borderRadius: '8px', color: '#FFF', cursor: 'pointer', transition: 'background 0.3s' };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>🎴 Chkobba Online</h1>
        {status && <p style={statusStyle}>{status}</p>}

        <div style={fieldStyle}>
          <label htmlFor="playerName" style={labelStyle}>Username</label>
          <input
            id="playerName" type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
            placeholder="Enter Username" disabled={isLoading} style={inputStyle}
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="deckSelect" style={labelStyle}>Card Deck</label>
          <select
            id="deckSelect" value={theme} onChange={e => changeTheme(e.target.value)} disabled={isLoading}
            style={selectStyle}
          >
            <option value="">Select Deck</option>
            {availableThemes.map(opt => (
              <option key={opt} value={opt}>{opt.charAt(0).toUpperCase()+opt.slice(1)}</option>
            ))}
          </select>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Play to</label>
          <div style={optionsRowStyle}>
            {[11,21].map(score => {
              const isActive = winningScore === score;
              return (
                <button
                  key={score}
                  onClick={() => setWinningScore(score)} disabled={isLoading}
                  style={isActive ? {...optionBtnStyle, ...activeOptionBtn} : optionBtnStyle}
                >
                  {score}
                </button>
              );
            })}
          </div>
        </div>

        <div style={createBtnGroupStyle}>
          <button
            onClick={() => handleCreateRoom('1v1')}
            disabled={isLoading || !isConnected}
            style={createBtnStyle}
          >Create 1v1 Game</button>
          <button
            onClick={() => handleCreateRoom('2v2')}
            disabled={isLoading || !isConnected}
            style={createBtnStyle}
          >Create 2v2 Game</button>
        </div>

        <hr style={{ border: 'none', height: '1px', background: '#DDD', margin: '1.5rem 0' }} />

        <div style={fieldStyle}>
          <label htmlFor="roomCode" style={labelStyle}>Room Code</label>
          <div style={joinRowStyle}>
            <input
              id="roomCode" type="text" value={roomCode} onChange={e => setRoomCode(e.target.value)}
              placeholder="Enter Room Code" disabled={isLoading} style={joinInputStyle}
            />
            <button
              onClick={handleJoinRoom} disabled={isLoading || !isConnected}
              style={joinBtnStyle}
            >Join</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
