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
  const [routePreferences, setRoutePreferences] = useState({
    avoidHighAQI: false,
    balanceAQIAndTime: false,
    maxAdditionalTime: 20
  });
  const recognitionRef = useRef(null);
  const mapRef = useRef(null);

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
    if (command.includes("best route") || command.includes("cleanest path") || command.includes("safest route")) {
      const routeMatch = command.match(/from (.+) to (.+)/i);
      if (routeMatch && routeMatch[1] && routeMatch[2]) {
        setRouteStart(routeMatch[1]);
        setRouteEnd(routeMatch[2]);
        speakResponse(`Finding the best route from ${routeMatch[1]} to ${routeMatch[2]}`);
        await findCleanestRoute(routeMatch[1], routeMatch[2]);
      } else {
        speakResponse("Please specify both start and destination locations for route planning.");
      }
      return;
    }

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
      speakResponse("You can ask me questions like 'How's the air quality in Mumbai today?', 'Is it safe to jog outside?', 'What is PM2.5?', or tell me to 'Find the best route from Delhi to Gurgaon'. You can also specify route preferences like 'avoid polluted areas' or 'find the fastest route'.");
    } else {
      speakResponse("I didn't understand that command. Try asking about air quality in a specific city or if it's safe for outdoor activities.");
    }
  };

   // Find the cleanest route based on AQI - Modified to process cities along route
   const findCleanestRoute = async (start, end) => {
    setIsRouting(true);
    setError(null);
    
    try {
      const response = await axios.post('http://127.0.0.1:5000/get-routes', {
        start: start,
        end: end,
        preferences: routePreferences
      });
      /*,{
        headers: {
          'Content-Type': 'application/json'
        }
      }*/

      if (!response.data.routes || response.data.routes.length === 0) {
        throw new Error("No routes found between these locations");
      }

      // Process routes with city names
    const processedRoutes = await Promise.all(response.data.routes.map(async (route) => {
      // Get city names for waypoints if available
      let citiesAlongPath = [];
      if (route.waypoints && route.waypoints.length > 0) {
        citiesAlongPath = await Promise.all(
          route.waypoints.map(async (point) => {
            const city = await reverseGeocode(point.lat, point.lng);
            return city || 'Unknown location';
          })
        );
      }
      
      return {
        ...route,
        start: route.start_name || start,
        end: route.end_name || end,
        citiesAlongRoute: [route.start_name || start, ...citiesAlongPath, route.end_name || end]
      };
    }));

    setRouteOptions(processedRoutes);
    setSelectedRoute(processedRoutes[0]);


      // Generate voice response
      const bestRoute = response.data.routes[0];
      const aqiLevel = getAqiLevel(bestRoute.aqiScore);
      
      let responseText = `Found ${response.data.routes.length} route option${response.data.routes.length > 1 ? 's' : ''}. `;
      
      if (routePreferences.avoidHighAQI && !routePreferences.balanceAQIAndTime) {
        responseText += `The cleanest air quality route has an average AQI of ${Math.round(bestRoute.aqiScore)} (${aqiLevel})`;
      } else if (routePreferences.balanceAQIAndTime && !routePreferences.avoidHighAQI) {
        responseText += `The balanced route has an average AQI of ${Math.round(bestRoute.aqiScore)} and takes ${Math.round(bestRoute.duration)} minutes`;
      } else if (routePreferences.avoidHighAQI && routePreferences.balanceAQIAndTime) {
        responseText += `The optimized route balances air quality and time with AQI ${Math.round(bestRoute.aqiScore)} and duration ${Math.round(bestRoute.duration)} minutes`;
      } else {
        responseText += `The fastest route takes ${Math.round(bestRoute.duration)} minutes`;
      }
      
      speakResponse(responseText);
    } catch (err) {
      console.error('Route planning error:', err);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to find routes';
      setError(errorMsg);
      
      // Only speak error if we didn't find any routes
      if (!routeOptions || routeOptions.length === 0) {
        speakResponse("Sorry, I couldn't find a route between those locations.");
      }
    } finally {
      setIsRouting(false);
    }
  };

  // Helper function to extract cities from route geometry
  const extractCitiesFromRoute = (route) => {
    try {
      if (!route.geometry || !route.geometry.coordinates) return [];
      
      // This is a simplified approach - you'll need to implement reverse geocoding
      // for key points along the route in your backend
      if (route.citiesAlongPath) {
        return route.citiesAlongPath;
      }
      
      // Fallback: just show start and end if no city data available
      return [route.start, route.end];
    } catch (error) {
      console.error('Error extracting cities from route:', error);
      return [route.start, route.end];
    }
  };

  // Update map with routes
  const updateMapWithRoutes = (routes, selectedRouteId) => {
    const iframe = document.querySelector("iframe[name='qgis-map']");
    if (iframe) {
      iframe.contentWindow.postMessage(
        {
          type: 'route',
          routes: routes.map(route => ({
            ...route,
            color: route.id === selectedRouteId ? '#00FF00' : '#FF0000' // Green for selected, red for others
          })),
          selectedRoute: selectedRouteId
        },
        "*"
      );
    }
  };

  // Reverse geocode coordinates to city name
  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'User-Agent': 'AirQualityApp/1.0'
          }
        }
      );
      return response.data.address.city || 
             response.data.address.town || 
             response.data.address.village ||
             response.data.address.county;
    } catch (err) {
      console.error('Reverse geocoding error:', err);
      return null;
    }
  };

  // Estimate health impact of a route
  const calculateHealthImpact = (aqiScore) => {
    if (!aqiScore) return 'minimal';
    if (aqiScore > 150) return 'high';
    if (aqiScore > 100) return 'moderate';
    return 'low';
  };

  // Select a different route
  const selectRoute = (routeId) => {
    const route = routeOptions.find(r => r.id === routeId);
    if (route) {
      setSelectedRoute(route);
      updateMapWithRoutes(routeOptions, routeId);
      speakResponse(`Selected ${route.summary}. This route has an average AQI of ${Math.round(route.aqiScore)} and takes about ${Math.round(route.duration)} minutes.`);
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
    
    speakResponse("Route planning cleared.");
  };

  // Toggle route preference
  const toggleRoutePreference = (pref) => {
    setRoutePreferences(prev => ({
      ...prev,
      [pref]: !prev[pref]
    }));
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
      speakResponse(`Sorry, I couldn't find air quality data for ${cityName}.`);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Speak response using speech synthesis
  const speakResponse = (text) => {
    setVoiceResponse(text);
    
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Cancel any ongoing speech
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
    if (!city) {
      setError('City name is required');
      return;
    }
    
    await fetchAQIWithCity(city);
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

  const getHealthImpactColor = (impact) => {
    switch (impact) {
      case 'high': return 'health-impact-high';
      case 'moderate': return 'health-impact-moderate';
      default: return 'health-impact-low';
    }
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          
          // Reverse geocode to get city name
          const cityName = await reverseGeocode(latitude, longitude);
          
          if (cityName) {
            setCity(cityName);
            await fetchAQIWithCity(cityName);
          } else {
            setError('Could not determine city name for your location');
            speakResponse("Sorry, I couldn't determine your current city.");
          }
        } catch (err) {
          setError('Could not determine your location');
          speakResponse("Sorry, I couldn't determine your location.");
        } finally {
          setIsLoading(false);
        }
      },
      (error) => {
        setIsLoading(false);
        let errorMsg = '';
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMsg = 'Location access denied. Please enable location services in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMsg = 'Location information is unavailable.';
            break;
          case error.TIMEOUT:
            errorMsg = 'The request to get user location timed out.';
            break;
          default:
            errorMsg = 'An unknown error occurred while getting your location.';
        }
        setError(errorMsg);
        speakResponse("Sorry, I couldn't access your location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
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
    
    <div className="route-preferences">
      <h4>Route Preferences:</h4>
      <div className="preference-options">
        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={routePreferences.avoidHighAQI}
            onChange={() => toggleRoutePreference('avoidHighAQI')}
          />
          <span className="toggle-slider"></span>
          <span>Avoid high AQI areas</span>
        </label>
        
        <label className="preference-toggle">
          <input
            type="checkbox"
            checked={routePreferences.balanceAQIAndTime}
            onChange={() => toggleRoutePreference('balanceAQIAndTime')}
          />
          <span className="toggle-slider"></span>
          <span>Balance AQI and travel time</span>
        </label>
      </div>
    </div>

    {/* Route Results - Updated to show cities along route */}
    {routeOptions && (
  <div className="route-results-container">
    <h4>Route Options (Sorted by Air Quality)</h4>
    
    <div className="route-options-list">
      {routeOptions.map((route) => (
        <div 
          key={route.id}
          className={`route-option ${selectedRoute?.id === route.id ? 'selected' : ''}`}
          onClick={() => selectRoute(route.id)}
        >
          {/* First line: Start and Destination */}
          <div className="route-locations">
            <div className="location-item">
              <span className="location-label">Start Location:</span>
              <span className="location-value">{route.start}</span>
            </div>
            <div className="location-item">
              <span className="location-label">Destination:</span>
              <span className="location-value">{route.end}</span>
            </div>
          </div>

          {/* Route Path */}
          <div className="route-path">
            <span className="path-label">Route:</span>
            <div className="path-cities">
              {route.citiesAlongRoute.map((city, index) => (
                <React.Fragment key={index}>
                  <span className="city-name">{city}</span>
                  {index < route.citiesAlongRoute.length - 1 && (
                    <span className="city-arrow"> → </span>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Stats in a row */}
          <div className="route-stats-row">
            <div className="route-stat">
              <span className="stat-label">Distance:</span>
              <span className="stat-value">{route.distance} km</span>
            </div>
            <div className="route-stat">
              <span className="stat-label">Duration:</span>
              <span className="stat-value">{Math.round(route.duration)} mins</span>
            </div>
            <div className="route-stat">
              <span className="stat-label">Avg AQI:</span>
              <span className={`stat-value ${getAqiColor(Math.round(route.aqiScore))}`}>
                {Math.round(route.aqiScore)} ({getAqiLevel(route.aqiScore)})
              </span>
            </div>
          </div>
              
              <div className="aqi-bar-container">
                <div 
                  className="aqi-bar" 
                  style={{ 
                    width: `${Math.min(100, (route.aqiScore / 300) * 100)}%`,
                    backgroundColor: `var(--${getAqiColor(Math.round(route.aqiScore))})`
                  }}
                ></div>
              </div>
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
    <h2>Air Quality Map {selectedRoute && `- ${selectedRoute.summary}`}</h2>
    <div className="map-container">
      <iframe
        src="/map/index.html"
        name="qgis-map"
        title="QGIS Map"
        className="map-iframe"
        ref={mapRef}
      ></iframe>
    </div>
  </div>
</div>
);
};

export default App;