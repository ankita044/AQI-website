import React, { useState, useEffect } from 'react';
import axios from 'axios';

const App = () => {
  const [city, setCity] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchAQI = async (type) => {
    setError(null);
    try {
      const response = await axios.post('http://127.0.0.1:5000/get-aqi', { city });
      const data = response.data;

      console.log('Fetched Data:', data);

      if (type === 'all') {
        const orderedData = {
          City: data.city,
          'Live AQI': data.predicted_aqi,
          Level: data.aqi_category,
          pm25: data.pm25,
          pm10: data.pm10,
          o3: data.o3,
          no2: data.no2,
          so2: data.so2,
          co: data.co,
        };
        setData(orderedData);

        // Send city and AQI to map
        const iframe = document.querySelector("iframe[name='qgis-map']");
        if (iframe) {
          iframe.contentWindow.postMessage(
            {
              type: 'aqi',
              city,
              lat: data.lat,
              lng: data.lng,
              value: data.predicted_aqi,
              zoom: 12,
            },
            "*"
          );
        }
      } else if (data.hasOwnProperty(type.toLowerCase())) {
        setData({ [type]: data[type.toLowerCase()] });

        // Send pollutant info to map
        const iframe = document.querySelector("iframe[name='qgis-map']");
        if (iframe) {
          iframe.contentWindow.postMessage(
            {
              type: 'pollutant',
              layer: type.toLowerCase(),
              value: data[type.toLowerCase()],
            },
            "*"
          );
        }
      } else {
        setError(`No data available for ${type}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      {/* Search Bar */}
      <div className="search-container">
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Enter city name"
          className="search-bar border rounded px-4 py-2"
        />
        <button
          onClick={() => fetchAQI('all')}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700 ml-2"
        >
          Get AQI
        </button>
      </div>

      {/* Individual Pollutant Buttons */}
      <div className="button-container mt-2">
        {['PM25', 'PM10', 'O3', 'NO2', 'SO2', 'CO'].map((param) => (
          <button
            key={param}
            onClick={() => fetchAQI(param)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700 m-1"
          >
            {param}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && <p className="text-red-500 mt-4">{error}</p>}

      {/* Data Display */}
      {data && (
        <div className="mt-4 w-1/2">
          {Object.entries(data).map(([key, value]) => (
            <p key={key}>
              <strong>{key}:</strong> {value}
            </p>
          ))}
        </div>
      )}

      {/* QGIS Map */}
    <div className="mt-4 w-1/2 h-64">
      <div style={{ width: '800px'}}>
        <iframe
          src="/map/index.html"
          name="qgis-map"
          title="QGIS Map"
          style={{ width: '100%', height: '500px', border: 'none', paddingLeft:'850px', paddingTop:'30px'}}
        ></iframe>
      </div>
    </div>

    </div>
  );
};

export default App;
