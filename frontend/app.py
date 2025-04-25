from dotenv import load_dotenv
from pathlib import Path
import os
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import numpy as np
from catboost import CatBoostRegressor
from geopy.distance import distance
import polyline
import time
import json
from functools import lru_cache
import logging

# Load environment variables
env_path = Path(__file__).parent / '.env'
load_dotenv(env_path)

# Initialize Flask and CORS
app = Flask(__name__)
CORS(app, resources={
    r"/.*": {
        "origins": ["*"],
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# Configure logging
logging.basicConfig(level=logging.INFO)
app.logger.setLevel(logging.INFO)

# Load ML model
model = CatBoostRegressor()
model.load_model("model/cat.cbm")

# API Config
AQI_API_KEY = '64290e07f158484e2d2f271320fe1826ce447c34'
AQI_API_URL = 'http://api.waqi.info/feed/{}/?token={}'
OPENROUTE_API_KEY = os.getenv('OPENROUTE_API_KEY')
OPENROUTE_URL = 'https://api.openrouteservice.org/v2/directions/driving-car'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse'
GEOCODE_URL = 'https://nominatim.openstreetmap.org/search'

# Caches
AQI_CACHE = {}
AQI_CACHE_DURATION = 3600  # 1 hour

def get_aqi_category(aqi):
    """Classify AQI into health categories"""
    if aqi <= 50: return "Good"
    elif aqi <= 100: return "Moderate"
    elif aqi <= 150: return "Unhealthy for Sensitive Groups"
    elif aqi <= 200: return "Unhealthy"
    elif aqi <= 300: return "Very Unhealthy"
    else: return "Hazardous"

@app.route('/get-aqi', methods=['POST'])
def get_aqi():
    try:
        data = request.get_json()
        city = data.get('city')
        if not city:
            return jsonify({'error': 'City name is required'}), 400

        # Cache check
        cache_key = f"city_{city}"
        if cache_key in AQI_CACHE and time.time() - AQI_CACHE[cache_key]['timestamp'] < AQI_CACHE_DURATION:
            return jsonify(AQI_CACHE[cache_key]['data'])

        # Fetch from API
        response = requests.get(AQI_API_URL.format(city, AQI_API_KEY), timeout=10)
        response.raise_for_status()
        aqi_data = response.json()

        if aqi_data.get('status') != 'ok':
            return jsonify({'error': 'Invalid API response'}), 400

        # Process pollutants
        iaqi = aqi_data['data'].get('iaqi', {})
        pollutants = {
            'pm25': iaqi.get('pm25', {}).get('v', 0),
            'pm10': iaqi.get('pm10', {}).get('v', 0),
            'o3': iaqi.get('o3', {}).get('v', 0),
            'no2': iaqi.get('no2', {}).get('v', 0),
            'so2': iaqi.get('so2', {}).get('v', 0),
            'co': iaqi.get('co', {}).get('v', 0)
        }

        # Predict AQI
        input_data = np.array([list(pollutants.values())], dtype=float)
        predicted_aqi = round(float(model.predict(input_data)[0]), 1)
        
        # Prepare result
        result = {
            'city': city,
            **{k: round(v, 2) for k, v in pollutants.items()},
            'predicted_aqi': predicted_aqi,
            'aqi_category': get_aqi_category(predicted_aqi),
            'lat': aqi_data['data']['city']['geo'][0] if 'geo' in aqi_data['data']['city'] else None,
            'lng': aqi_data['data']['city']['geo'][1] if 'geo' in aqi_data['data']['city'] else None
        }

        # Cache result
        AQI_CACHE[cache_key] = {
            'data': result,
            'timestamp': time.time()
        }

        return jsonify(result)

    except Exception as e:
        app.logger.error(f"Error in get_aqi: {str(e)}")
        return jsonify({'error': str(e)}), 500

@lru_cache(maxsize=100)
def reverse_geocode(lat, lng):
    """Cached geocoding with proper headers"""
    try:
        headers = {
            'User-Agent': 'AirQualityApp/1.0 (contact@yourapp.com)'
        }
        params = {
            'lat': lat,
            'lon': lng,
            'format': 'json',
            'zoom': 10
        }
        response = requests.get(NOMINATIM_URL, headers=headers, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        return data['address'].get('city') or data['address'].get('town') or data['address'].get('village')
    except Exception as e:
        app.logger.error(f"Reverse geocode error: {str(e)}")
        return None

def geocode_location(location_name):
    """Geocode a location name to coordinates"""
    try:
        headers = {
            'User-Agent': 'AirQualityApp/1.0 (contact@yourapp.com)'
        }
        params = {
            'q': location_name,
            'format': 'json',
            'limit': 1
        }
        response = requests.get(GEOCODE_URL, headers=headers, params=params, timeout=5)
        response.raise_for_status()
        data = response.json()
        if data:
            return {
                'lat': float(data[0]['lat']),
                'lng': float(data[0]['lon']),
                'name': data[0].get('display_name', location_name)
            }
        return None
    except Exception as e:
        app.logger.error(f"Geocode location error: {str(e)}")
        return None

def calculate_route_aqi(points):
    """Calculate weighted AQI for route points"""
    total = 0
    weights = 0
    valid_points = 0
    
    for point in points:
        aqi = get_point_aqi(point['lat'], point['lng'])
        if aqi is not None:
            weight = 2 if aqi > 100 else 1  # Higher weight for bad air
            total += aqi * weight
            weights += weight
            valid_points += 1
    
    return round(total / weights, 1) if valid_points > 0 else None

def get_point_aqi(lat, lng):
    """Get AQI for a single map point"""
    city = reverse_geocode(lat, lng)
    if not city:
        return None
        
    cache_key = f"city_{city}"
    if cache_key in AQI_CACHE:
        return AQI_CACHE[cache_key]['data']['predicted_aqi']
        
    try:
        response = requests.get(AQI_API_URL.format(f"geo:{lat};{lng}", AQI_API_KEY), timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get('status') == 'ok':
                iaqi = data['data'].get('iaqi', {})
                input_data = np.array([[
                    iaqi.get('pm25', {}).get('v', 0),
                    iaqi.get('pm10', {}).get('v', 0),
                    iaqi.get('o3', {}).get('v', 0),
                    iaqi.get('no2', {}).get('v', 0),
                    iaqi.get('so2', {}).get('v', 0),
                    iaqi.get('co', {}).get('v', 0)
                ]], dtype=float)
                return float(model.predict(input_data)[0])
    except Exception as e:
        app.logger.error(f"Get point AQI error: {str(e)}")
        return None

def sample_route_points(coordinates, max_points=7):
    """Evenly sample points along a route"""
    if len(coordinates) <= max_points:
        return [{'lat': lat, 'lng': lng} for lat, lng in coordinates]
        
    step = max(1, len(coordinates) // (max_points - 1))
    return [{'lat': coordinates[i][0], 'lng': coordinates[i][1]} 
            for i in range(0, len(coordinates), step)][:max_points]

@app.route('/get-routes', methods=['POST'])
def get_routes():
    try:
        data = request.get_json()
        start = data['start']  # {lat, lng} or string
        end = data['end']      # {lat, lng} or string
        preferences = data.get('preferences', {
            'avoidHighAQI': False,
            'balanceAQIAndTime': False
        })
        
        if not OPENROUTE_API_KEY:
            return jsonify({'error': 'OpenRoute API key missing'}), 500

        # Geocode if locations are strings
        if isinstance(start, str):
            start_coords = geocode_location(start)
            if not start_coords:
                return jsonify({'error': f'Could not find start location: {start}'}), 400
            start = {'lat': start_coords['lat'], 'lng': start_coords['lng']}
            
        if isinstance(end, str):
            end_coords = geocode_location(end)
            if not end_coords:
                return jsonify({'error': f'Could not find end location: {end}'}), 400
            end = {'lat': end_coords['lat'], 'lng': end_coords['lng']}

        # Get routes from OpenRouteService
        headers = {
            'Authorization': OPENROUTE_API_KEY,
            'Content-Type': 'application/json; charset=utf-8'
        }
        
        # Get all possible unique route variations
        all_routes = []
        route_preferences = ['fastest', 'shortest', 'recommended']
        
        for pref in route_preferences:
            try:
                body = {
                    "coordinates": [
                        [start['lng'], start['lat']],
                        [end['lng'], end['lat']]
                    ],
                    "preference": pref,
                    "instructions": False,
                    "options": {
                        "avoid_features": ["highways"] if preferences.get('avoidHighAQI') else []
                    }
                }
                
                response = requests.post(OPENROUTE_URL, json=body, headers=headers, timeout=10)
                if response.status_code == 200:
                    route_data = response.json()
                    if 'routes' in route_data and route_data['routes']:
                        # Check if this route is different from existing ones
                        route_geometry = route_data['routes'][0]['geometry']
                        if not any(r['routes'][0]['geometry'] == route_geometry for r in all_routes):
                            all_routes.append(route_data)
            except Exception as e:
                app.logger.error(f"Error getting route with preference {pref}: {str(e)}")
                continue

        if not all_routes:
            return jsonify({'error': 'No routes found between locations'}), 404

        # Process each unique route
        processed_routes = []
        for i, route in enumerate(all_routes):
            try:
                route_data = route['routes'][0]
                coords = polyline.decode(route_data['geometry'])
                sampled_points = sample_route_points(coords)
                
                # Calculate AQI score
                aqi_score = calculate_route_aqi(sampled_points)
                if aqi_score is None:
                    continue
                    
                processed_routes.append({
                    'id': f"route_{i}",
                    'summary': f"Route {i+1}",
                    'start_location': start,
                    'end_location': end,
                    'distance': round(route_data['summary']['distance'] / 1000, 1),
                    'duration': round(route_data['summary']['duration'] / 60, 1),
                    'geometry': route_data['geometry'],
                    'aqiScore': aqi_score,
                    'healthImpact': 'high' if aqi_score > 150 else 'moderate' if aqi_score > 100 else 'low',
                    'waypoints': sampled_points,
                    'preference': route_preferences[i % len(route_preferences)]
                })
            except Exception as e:
                app.logger.error(f"Route processing error: {str(e)}")
                continue

        if not processed_routes:
            return jsonify({'error': 'Could not calculate AQI for any routes'}), 500

        # Sort based on preferences
        if preferences.get('avoidHighAQI'):
            processed_routes.sort(key=lambda x: x['aqiScore'])
        elif preferences.get('balanceAQIAndTime'):
            processed_routes.sort(key=lambda x: (x['aqiScore'] * 0.7) + (x['duration'] * 0.3))
        else:
            processed_routes.sort(key=lambda x: x['duration'])

        return jsonify({
            'routes': processed_routes,
            'start_name': reverse_geocode(start['lat'], start['lng']) or "Start Location",
            'end_name': reverse_geocode(end['lat'], end['lng']) or "End Location"
        })

    except requests.exceptions.RequestException as e:
        app.logger.error(f"OpenRouteService API error: {str(e)}")
        return jsonify({'error': 'Failed to get routing data from OpenRouteService'}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error in get_routes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/get-aqi-for-coords', methods=['POST'])
def get_aqi_for_coords():
    try:
        data = request.get_json()
        lat = data.get('lat')
        lng = data.get('lng')
        if not lat or not lng:
            return jsonify({'error': 'Coordinates required'}), 400
            
        city = reverse_geocode(lat, lng)
        aqi = get_point_aqi(lat, lng)
        
        if not city or not aqi:
            return jsonify({'error': 'Location not supported'}), 404
            
        return jsonify({
            'city': city,
            'aqi': aqi,
            'aqi_category': get_aqi_category(aqi),
            'lat': lat,
            'lng': lng
        })
    except Exception as e:
        app.logger.error(f"Error in get_aqi_for_coords: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)