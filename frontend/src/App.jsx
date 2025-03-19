import React, { useState } from 'react';
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
        // Reordering keys in the desired sequence
        const orderedData = {
          
          "PM25": data.pm25,
          "PM10": data.pm10,
          "O3": data.o3,
          "NO2": data.no2,
          "SO2": data.so2,
          "CO": data.co,
        };
        setData(orderedData);
      } else if (data.hasOwnProperty(type.toLowerCase())) {
        setData({ [type]: data[type.toLowerCase()] });
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
          className="search-bar"
        />
        
        {/* Get AQI Button */}
        <button 
          onClick={() => fetchAQI('all')}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Get AQI
        </button>

              {/* ✅ New Container for City, Live AQI, and Category */}
      {data && (
        <div className="flex flex-col gap-2 bg-blue-100 border border-blue-300 p-4 rounded-lg shadow-md mb-4">
          <p className="text-lg font-semibold text-gray-800">
            <span className="text-blue-700">City:</span> {data.city}
          </p>
          <p className="text-lg font-semibold text-gray-800">
            <span className="text-blue-700">Live AQI:</span> {data.predicted_aqi}
          </p>
          <p className="text-lg font-semibold text-gray-800">
            <span className="text-blue-700">AQI Category:</span> {data.aqi_category}
          </p>
        </div>
      )}

        {/* Individual Parameter Buttons */}
        <div className="button-container">
            <button onClick={() => fetchAQI('PM25')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700">PM25</button>
            <button onClick={() => fetchAQI('PM10')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700">PM10</button>
            <button onClick={() => fetchAQI('O3')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700">O3</button>
            <button onClick={() => fetchAQI('NO2')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700">NO2</button>
            <button onClick={() => fetchAQI('SO2')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700">SO2</button>
            <button onClick={() => fetchAQI('CO')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-700">CO</button>
        </div>
      </div>

      {/* Error Display */}
      {error && <p className="text-red-500 mt-4">{error}</p>}
      
      {/* Data Display */}
      {data && (
        <div className="mt-4">
          {Object.entries(data).map(([key, value]) => (
            <p key={key}><strong>{key}:</strong> {value}</p>
          ))}
        </div>
      )}
    </div>
  );
};

export default App;
