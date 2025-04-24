import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

const App = () => {
  const [city, setCity] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPollutant, setSelectedPollutant] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [voiceResponse, setVoiceResponse] = useState('');
  const [routeStart, setRouteStart] = useState('');
  const [routeEnd, setRouteEnd] = useState('');
  const [routeOptions, setRouteOptions] = useState(null);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [isRouting, setIsRouting] = useState(false);
  const recognitionRef = useRef(null);

  // Initialize speech recognition
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event) => {
        const command = event.results[0][0].transcript.toLowerCase();
        setTranscript(command);
        processVoiceCommand(command);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setError('Speech recognition not supported in this browser');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Process voice commands
  const processVoiceCommand = async (command) => {
    // Route planning commands
    if (command.includes("best route") || command.includes("cleanest path") || command.includes("safest route")) {
      const routeMatch = command.match(/from (.+) to (.+)/i);
      if (routeMatch && routeMatch[1] && routeMatch[2]) {
        setRouteStart(routeMatch[1]);
        setRouteEnd(routeMatch[2]);
        speakResponse(`Finding the cleanest air quality route from ${routeMatch[1]} to ${routeMatch[2]}`);
        await findCleanestRoute(routeMatch[1], routeMatch[2]);
      } else {
        speakResponse("Please specify both start and destination locations for route planning.");
      }
      return;
    }

    // Existing voice commands...
    let extractedCity = '';
    const cityMatch = command.match(/air quality in (\w+)/i);
    if (cityMatch && cityMatch[1]) {
      extractedCity = cityMatch[1];
    }
    
    const directCityMatch = command.match(/check (\w+)/i);
    if (directCityMatch && directCityMatch[1]) {
      extractedCity = directCityMatch[1];
    }

    if (extractedCity) {
      setCity(extractedCity);
      await fetchAQIWithCity(extractedCity);
    } else if (command.includes("how's the air quality") || command.includes("what's the air quality")) {
      if (data) {
        speakResponse(`The current air quality index in ${data.City} is ${data['Live AQI']}, which is considered ${getAqiLevel(data['Live AQI'])}.`);
      } else if (city) {
        await fetchAQIWithCity(city);
      } else {
        speakResponse("Please specify a city or use the locate me feature first.");
      }
    } else if (command.includes("locate me") || command.includes("my location")) {
      handleLocateMe();
      speakResponse("Getting your current location...");
    } else if (command.includes("safe to jog") || command.includes("safe to exercise") || 
               command.includes("safe for outdoor activities")) {
      if (data) {
        const aqi = data['Live AQI'];
        let response = "";
        
        if (aqi <= 50) {
          response = `With an AQI of ${aqi}, the air quality is good. It's perfectly safe to jog outside.`;
        } else if (aqi <= 100) {
          response = `With an AQI of ${aqi}, the air quality is moderate. It's generally safe to jog, but sensitive individuals might want to reduce prolonged outdoor exertion.`;
        } else if (aqi <= 150) {
          response = `With an AQI of ${aqi}, the air quality is unhealthy for sensitive groups. If you have respiratory issues, consider limiting your outdoor jogging.`;
        } else if (aqi <= 200) {
          response = `With an AQI of ${aqi}, the air quality is unhealthy. It's recommended to reduce prolonged outdoor exercise.`;
        } else if (aqi <= 300) {
          response = `With an AQI of ${aqi}, the air quality is very unhealthy. Avoid outdoor jogging today.`;
        } else {
          response = `With an AQI of ${aqi}, the air quality is hazardous. Avoid all outdoor physical activities.`;
        }
        
        speakResponse(response);
      } else {
        speakResponse("Please check the air quality for a specific city first.");
      }
    } else if (command.includes("what does pm2.5") || command.includes("what is pm 2.5")) {
      speakResponse("PM2.5 refers to particulate matter that is 2.5 micrometers or smaller in diameter. These fine particles can penetrate deep into the lungs and even enter the bloodstream, potentially causing serious health problems.");
    } else if (command.includes("what does pm10") || command.includes("what is pm 10")) {
      speakResponse("PM10 refers to particulate matter that is 10 micrometers or smaller in diameter. These particles can be inhaled into the lungs and may cause respiratory issues, particularly for sensitive individuals.");
    } else if (command.includes("help") || command.includes("what can you do")) {
      speakResponse("You can ask me questions like 'How's the air quality in Mumbai today?', 'Is it safe to jog outside?', 'What is PM2.5?', or tell me to 'Find the best route from Delhi to Gurgaon'.");
    } else {
      speakResponse("I didn't understand that command. Try asking about air quality in a specific city or if it's safe for outdoor activities.");
    }
  };

  // Find the cleanest route based on AQI
  const findCleanestRoute = async (start, end) => {
    setIsRouting(true);
    setError(null);
    
    try {
      // First geocode the start and end locations
      const startResponse = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(start)}`
      );
      const endResponse = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(end)}`
      );

      if (startResponse.data.length === 0 || endResponse.data.length === 0) {
        throw new Error("Could not find one or both locations");
      }

      const startCoords = {
        lat: parseFloat(startResponse.data[0].lat),
        lng: parseFloat(startResponse.data[0].lon)
      };
      
      const endCoords = {
        lat: parseFloat(endResponse.data[0].lat),
        lng: parseFloat(endResponse.data[0].lon)
      };

      // Get route options from backend
      const routeResponse = await axios.post('http://127.0.0.1:5000/get-routes', {
        start: startCoords,
        end: endCoords
      });

      // Process route options
      const processedRoutes = routeResponse.data.routes.map(route => ({
        ...route,
        aqiScore: calculateAQIScore(route.aqiData)
      }));

      // Sort by AQI score (lower is better)
      processedRoutes.sort((a, b) => a.aqiScore - b.aqiScore);
      
      setRouteOptions(processedRoutes);
      setSelectedRoute(processedRoutes[0]);

      

      // Send route data to map
      const iframe = document.querySelector("iframe[name='qgis-map']");
      if (iframe) {
        iframe.contentWindow.postMessage(
          {
            type: 'route',
            routes: processedRoutes,
            selectedRoute: processedRoutes[0].id
          },
          "*"
        );
      }

      speakResponse(`Found ${processedRoutes.length} route options. The cleanest air quality route is ${processedRoutes[0].summary} with an average AQI of ${Math.round(processedRoutes[0].aqiScore)}.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to find routes');
      speakResponse("Sorry, I couldn't find a route between those locations.");
    } finally {
      setIsRouting(false);
    }
  };

  // Calculate AQI score for a route
  const calculateAQIScore = (aqiData) => {
    if (!aqiData || aqiData.length === 0) return 0;
    
    // Simple average for now - could be weighted by segment length
    const sum = aqiData.reduce((total, point) => total + point.aqi, 0);
    return sum / aqiData.length;
  };

  // Select a different route
  const selectRoute = (routeId) => {
    const route = routeOptions.find(r => r.id === routeId);
    if (route) {
      setSelectedRoute(route);
      
      // Update map
      const iframe = document.querySelector("iframe[name='qgis-map']");
      if (iframe) {
        iframe.contentWindow.postMessage(
          {
            type: 'route',
            selectedRoute: route.id
          },
          "*"
        );
      }
    }
  };

  // Clear route planning
  const clearRoutePlanning = () => {
    setRouteOptions(null);
    setSelectedRoute(null);
    setRouteStart('');
    setRouteEnd('');
    
    // Clear routes from map
    const iframe = document.querySelector("iframe[name='qgis-map']");
    if (iframe) {
      iframe.contentWindow.postMessage(
        {
          type: 'clear-route'
        },
        "*"
      );
    }
  };

  // Fetch AQI with specific city
  const fetchAQIWithCity = async (cityName) => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await axios.post('http://127.0.0.1:5000/get-aqi', { city: cityName });
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
            city: cityName,
            lat: responseData.lat,
            lng: responseData.lng,
            value: responseData.predicted_aqi,
            zoom: 12,
          },
          "*"
        );
      }

      // Voice response with AQI info
      speakResponse(`The air quality index in ${processedData.City} is ${processedData['Live AQI']}, which is considered ${getAqiLevel(processedData['Live AQI'])}.`);
      
      return processedData;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to fetch data';
      setError(errorMsg);
      speakResponse(`Sorry, I couldn't find air quality data for ${cityName}. ${errorMsg}`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Speak response using speech synthesis
  const speakResponse = (text) => {
    setVoiceResponse(text);
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Toggle voice recognition
  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        setTranscript('');
        setVoiceResponse('');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
  };

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

      {/* Voice Assistant Section */}
      <div className="voice-assistant-section">
        <button 
          onClick={toggleListening} 
          className={`voice-button ${isListening ? 'listening' : ''}`}
        >
          {isListening ? 'Listening...' : 'Ask Air Quality Assistant'}
          <span className="microphone-icon">{isListening ? '🎤' : '🔊'}</span>
        </button>
        
        {transcript && (
          <div className="voice-transcript">
            <p><strong>You said:</strong> {transcript}</p>
            {voiceResponse && <p><strong>Response:</strong> {voiceResponse}</p>}
          </div>
        )}
        
        <div className="voice-assistant-help">
          <p>Try saying: "How's the air quality in Mumbai?"</p>
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
            className="locate-button"
          >
            <span className="location-icon">📍</span> Locate Me
          </button>
        </div>
      </div>

      {/* Route Planning Section */}
      {!routeOptions ? (
        <div className="route-planning-section">
          <h3>Find Cleanest Route</h3>
          <div className="route-inputs">
            <input
              type="text"
              value={routeStart}
              onChange={(e) => setRouteStart(e.target.value)}
              placeholder="Starting location"
              className="route-input"
            />
            <input
              type="text"
              value={routeEnd}
              onChange={(e) => setRouteEnd(e.target.value)}
              placeholder="Destination"
              className="route-input"
            />
            <button
              onClick={() => findCleanestRoute(routeStart, routeEnd)}
              disabled={isRouting || !routeStart || !routeEnd}
              className="route-button"
            >
              {isRouting ? 'Finding Route...' : 'Find Cleanest Route'}
            </button>
          </div>
        </div>
      ) : (
        <div className="route-results-section">
          <h3>Route Options (Sorted by Air Quality)</h3>
          <div className="route-options">
            {routeOptions.map((route) => (
              <div 
                key={route.id}
                className={`route-option ${selectedRoute?.id === route.id ? 'selected' : ''}`}
                onClick={() => selectRoute(route.id)}
              >
                <h4>{route.summary}</h4>
                <p>Distance: {route.distance} km</p>
                <p>Duration: {route.duration} mins</p>
                <p>Avg AQI: {Math.round(route.aqiScore)} ({getAqiLevel(route.aqiScore)})</p>
                <div className="aqi-bar" style={{ width: `${Math.min(100, (route.aqiScore / 300) * 100)}%`, backgroundColor: getAqiColor(route.aqiScore) }}></div>
              </div>
            ))}
          </div>
          <button 
            onClick={clearRoutePlanning}
            className="clear-route-button"
          >
            Clear Route
          </button>
        </div>
      )}

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
        <h2>Air Quality Map {selectedRoute && `- ${selectedRoute.summary}`}</h2>
        <div className="map-container">
          <iframe
            src="/map/index.html"
            name="qgis-map"
            title="QGIS Map"
            className="map-iframe"
          ></iframe>
        </div>
      </div>
    </div>
  );
};

export default App;