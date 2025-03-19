import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.jsx';

const fetchData = async () => {
  try {
    const data = {
      pm2_5: 45,
      pm10: 80,
      no2: 30,
      co: 0.8,
      so2: 15,
      ozone: 60,
    };

    const response = await fetch('http://127.0.0.1:5000/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const result = await response.json();
    console.log('Prediction:', result);
  } catch (error) {
    console.error('Error fetching data:', error);
  }
};

const Root = () => {
  useEffect(() => {
    fetchData();
  }, []);

  return <App />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
