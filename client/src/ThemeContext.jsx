// client/src/ThemeContext.jsx
import React, { createContext, useState, useContext, useEffect } from 'react';

// Define available themes (make sure 'classic' exists)
const THEMES = ['classic', 'dbz', 'rourou', 'odd', 'circus']; // Example theme names
const DEFAULT_THEME = 'classic';

// Create context object
const ThemeContext = createContext();

// Create provider component
export function ThemeProvider({ children }) { // Named export
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('chkobbaDeckTheme');
        return THEMES.includes(savedTheme) ? savedTheme : DEFAULT_THEME;
    });

    useEffect(() => {
        localStorage.setItem('chkobbaDeckTheme', theme);
        console.log(`Theme set to: ${theme}`);
    }, [theme]);

    const changeTheme = (newTheme) => {
        if (THEMES.includes(newTheme)) {
            setTheme(newTheme);
        } else {
            console.warn(`Attempted to set invalid theme: ${newTheme}`);
        }
    };

    // Value provided contains state, setter, and theme list
    const value = { theme, changeTheme, availableThemes: THEMES };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

// Create custom hook for using the context
export function useTheme() { // *** Ensure this is exported correctly ***
    const context = useContext(ThemeContext);
    if (context === undefined) {
      throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}