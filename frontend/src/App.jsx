import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

const App = () => {
  const [city, setCity] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPollutant, setSelectedPollutant] = useState(null);
  const [userLocation, setUserLocation] = useState(null);

  const fetchAQI = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await axios.post('http://127.0.0.1:5000/get-aqi', { city });
      const responseData = response.data;

      const processedData = {
        City: responseData.city,
        'Live AQI': responseData.predicted_aqi,
        Level: responseData.aqi_category,
        PM25: responseData.pm25,
        PM10: responseData.pm10,
        O3: responseData.o3,
        NO2: responseData.no2,
        SO2: responseData.so2,
        CO: responseData.co,
      };
      setData(processedData);
      setSelectedPollutant(null);

      // Send full AQI data to map
      const iframe = document.querySelector("iframe[name='qgis-map']");
      if (iframe) {
        iframe.contentWindow.postMessage(
          {
            type: 'aqi',
            city,
            lat: responseData.lat,
            lng: responseData.lng,
            value: responseData.predicted_aqi,
            zoom: 12,
          },
          "*"
        );
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePollutantClick = (pollutant) => {
    setSelectedPollutant(pollutant);
    
    // Send specific pollutant data to map
    const iframe = document.querySelector("iframe[name='qgis-map']");
    if (iframe && data) {
      iframe.contentWindow.postMessage(
        {
          type: 'pollutant',
          layer: pollutant.toLowerCase(),
          value: data[pollutant],
        },
        "*"
      );
    }
  };

  const getAqiColor = (aqi) => {
    if (!aqi) return 'aqi-gray';
    if (aqi <= 50) return 'aqi-green';
    if (aqi <= 100) return 'aqi-yellow';
    if (aqi <= 150) return 'aqi-orange';
    if (aqi <= 200) return 'aqi-red';
    if (aqi <= 300) return 'aqi-purple';
    return 'aqi-maroon';
  };

  const getAqiLevel = (aqi) => {
    if (!aqi) return 'Unknown';
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
  };

  const handleLocateMe = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            setUserLocation({ lat: latitude, lng: longitude });
            
            // Reverse geocode to get city name
            const response = await axios.get(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            );
            
            const cityName = response.data.address.city || 
                            response.data.address.town || 
                            response.data.address.village;
            if (cityName) {
              setCity(cityName);
              fetchAQI();
            }
          } catch (err) {
            setError('Could not determine your location');
          }
        },
        (error) => {
          setError('Location access denied. Please enable location services.');
        }
      );
    } else {
      setError('Geolocation is not supported by your browser');
    }
  };

  const calculateSliderPosition = (aqi) => {
    if (!aqi) return 0;
    if (aqi <= 50) return (aqi / 50) * 16.66;
    if (aqi <= 100) return 16.66 + ((aqi - 50) / 50) * 16.66;
    if (aqi <= 150) return 33.33 + ((aqi - 100) / 50) * 16.66;
    if (aqi <= 200) return 50 + ((aqi - 150) / 50) * 16.66;
    if (aqi <= 300) return 66.66 + ((aqi - 200) / 100) * 16.66;
    return 83.33 + ((Math.min(aqi, 500) - 300) / 200) * 16.66;
  };

  const pollutants = [
    { name: 'PM25', label: 'Particulate Matter (PM2.5)', unit: 'µg/m³' },
    { name: 'PM10', label: 'Particulate Matter (PM10)', unit: 'µg/m³' },
    { name: 'CO', label: 'Carbon Monoxide (CO)', unit: 'ppb' },
    { name: 'SO2', label: 'Sulfur Dioxide (SO2)', unit: 'ppb' },
    { name: 'NO2', label: 'Nitrogen Dioxide (NO2)', unit: 'ppb' },
    { name: 'O3', label: 'Ozone (O3)', unit: 'ppb' },
  ];

  return (
    <div className="app-container">
      {/* Header Section */}
      <div className="header">
        <div className="live-badge">
          <span className="live-pulse">●</span>
          <span>LIVE</span>
        </div>
        <div className="header-text">
          <h1>Air Quality Index (AQI) | Air Pollution</h1>
          <p className="subtitle">Real-time PM2.5, PM10 air pollution level in {data?.City || "your area"}</p>
        </div>
      </div>

      {/* Search and Location */}
      <div className="search-section">
        <div className="search-bar-container">
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Enter city name"
            className="search-input"
          />
          <button
            onClick={fetchAQI}
            disabled={isLoading}
            className="search-button"
          >
            {isLoading ? 'Loading...' : 'Get AQI'}
          </button>
          <button
            onClick={handleLocateMe}
            className="locate-me-button"
          >
            <span className="button-icon">📍</span>
            <span>Locate me</span>
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && <div className="error-message">{error}</div>}

      {/* Main Content Grid */}
      <div className="content-grid">
        {/* AQI Card */}
        <div className="card aqi-card">
          <h2>Air Quality Index</h2>
          {data ? (
            <div className="aqi-display">
              <div className={`aqi-value ${getAqiColor(data['Live AQI'])}`}>
                {data['Live AQI']}
              </div>
              <div className="aqi-info">
                <p className="aqi-level">Air Quality is {getAqiLevel(data['Live AQI'])}</p>
                <div className="aqi-slider-container">
                  <div className="aqi-slider-labels">
                    <span>Good</span>
                    <span>Moderate</span>
                    <span>Poor</span>
                    <span>Unhealthy</span>
                    <span>Severe</span>
                    <span>Hazardous</span>
                  </div>
                  <div className="aqi-slider-track">
                    <div 
                      className="aqi-slider-thumb"
                      style={{ left: `${calculateSliderPosition(data['Live AQI'])}%` }}
                    ></div>
                  </div>
                  <div className="aqi-slider-markers">
                    <span>0</span>
                    <span>50</span>
                    <span>100</span>
                    <span>150</span>
                    <span>200</span>
                    <span>300</span>
                    <span>301+</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="no-data">No data available</p>
          )}
        </div>

        {/* Pollutant Data Card */}
        <div className="card pollutant-card">
          <h2>Pollutant Levels</h2>
          {data ? (
            <div className="pollutant-grid">
              {pollutants.map((pollutant) => (
                <div 
                  key={pollutant.name}
                  className={`pollutant-item ${selectedPollutant === pollutant.name ? 'selected' : ''}`}
                  onClick={() => handlePollutantClick(pollutant.name)}
                >
                  <h3>{pollutant.label}</h3>
                  <p className="pollutant-value">{data[pollutant.name]} {pollutant.unit}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="no-data">No data available</p>
          )}
        </div>
      </div>

      {/* Map Card */}
      <div className="card map-card">
        <h2>Air Quality Map</h2>
        <div className="map-container">
          <iframe
            src="/map/index.html"
            name="qgis-map"
            title="QGIS Map"
            className="map-iframe"
          ></iframe>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button className="action-button save-button">
          <span className="button-icon">❤️</span>
          <span>Save location</span>
        </button>
        <button className="action-button share-button">
          <span className="button-icon">↗️</span>
          <span>Share</span>
        </button>
      </div>
    </div>
  );
};

export default App;