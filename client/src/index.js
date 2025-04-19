import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Optional: A file for global base styles
import App from './App'; // Import your main App component (assuming it's App.jsx)
import reportWebVitals from './reportWebVitals'; // Optional: For performance monitoring

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();