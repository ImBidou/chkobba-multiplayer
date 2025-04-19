// client/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './HomePage';
import GameRouter from './GameRouter';
import { ThemeProvider } from './ThemeContext'; // <-- Make sure this is imported
import './App.css';

function App() {
  return (
    // ThemeProvider MUST wrap the components that use the useTheme hook
    <ThemeProvider>
      <BrowserRouter>
        <div className="App"> {/* Or your main container */}
          <Routes>
            {/* HomePage is rendered inside ThemeProvider here */}
            <Route path="/" element={<HomePage />} />
            {/* GameRouter (and subsequently GameScreen components) are also inside */}
            <Route path="/game/:roomId" element={<GameRouter />} />
          </Routes>
        </div>
      </BrowserRouter>
    </ThemeProvider> // <-- Make sure it wraps everything
  );
}

export default App;