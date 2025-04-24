from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify
from flask_cors import CORS
import requests
import numpy as np
from catboost import CatBoostRegressor
import os
from geopy.distance import distance
import polyline


# Load the CatBoost model
model = CatBoostRegressor()
model.load_model("model/cat.cbm")

app = Flask(__name__)
CORS(app)

# API Keys and Endpoints
AQI_API_KEY = '64290e07f158484e2d2f271320fe1826ce447c34'
AQI_API_URL = 'http://api.waqi.info/feed/{}/?token={}'
OPENROUTE_API_KEY = os.getenv('OPENROUTE_API_KEY')

# Function to calculate AQI category
def get_aqi_category(aqi):
    if aqi <= 50:
        return "Good"
    elif aqi <= 100:
        return "Moderate"
    elif aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    elif aqi <= 200:
        return "Unhealthy"
    elif aqi <= 300:
        return "Very Unhealthy"
    else:
        return "Hazardous"

@app.route('/get-aqi', methods=['POST'])
def get_aqi():
    try:
        data = request.get_json()
        city = data.get('city')

        if not city:
            return jsonify({'error': 'City name is required'}), 400

        # Fetch real-time data from the API
        response = requests.get(AQI_API_URL.format(city, AQI_API_KEY))
        response.raise_for_status()  # Raise exception for HTTP errors
        response_data = response.json()

        if response_data.get('status') != 'ok':
            return jsonify({'error': 'Failed to fetch data from API'}), 400

        raw_data = response_data['data'].get('iaqi', {})
        station_coords = response_data['data'].get('city', {}).get('geo', [])

        # Extract pollutants with fallback to 0 if missing
        pm25 = raw_data.get('pm25', {}).get('v', 0.0)
        pm10 = raw_data.get('pm10', {}).get('v', 0.0)
        o3 = raw_data.get('o3', {}).get('v', 0.0)
        no2 = raw_data.get('no2', {}).get('v', 0.0)
        so2 = raw_data.get('so2', {}).get('v', 0.0)
        co = raw_data.get('co', {}).get('v', 0.0)

        # Prepare input for the model
        input_data = np.array([[pm25, pm10, o3, no2, so2, co]], dtype=float)
        predicted_aqi = model.predict(input_data)[0]
        aqi_category = get_aqi_category(predicted_aqi)

        return jsonify({
            'city': city,
            'pm25': round(pm25, 2),
            'pm10': round(pm10, 2),
            'o3': round(o3, 2),
            'no2': round(no2, 2),
            'so2': round(so2, 2),
            'co': round(co, 2),
            'predicted_aqi': round(predicted_aqi, 2),
            'aqi_category': aqi_category,
            'lat': station_coords[0] if len(station_coords) > 0 else None,
            'lng': station_coords[1] if len(station_coords) > 1 else None
        })

    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API request failed: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get-routes', methods=['POST'])
def get_routes():
    try:
        data = request.get_json()
        start = data['start']
        end = data['end']
        
        if not OPENROUTE_API_KEY:
            return jsonify({'error': 'Routing API not configured'}), 500
        
        # Get route alternatives from OpenRouteService
        headers = {
            'Authorization': os.getenv('OPENROUTE_API_KEY'),
            'Content-Type': 'application/json'
        }
        
        body = {
            "coordinates": [
                [start['lng'], start['lat']],
                [end['lng'], end['lat']]
            ],
            "alternative_routes": {
                "target_count": 3,  # Get 3 alternative routes
                "weight_factor": 2   # How much alternatives can differ
            },
            "instructions": "false"
        }
        
        response = requests.post(
            'https://api.openrouteservice.org/v2/directions/driving-car',
            json=body,
            headers=headers
        )
        response.raise_for_status()
        
        routes_data = response.json()
        
        # Process routes and add AQI data
        processed_routes = []
        for i, route in enumerate(routes_data['routes']):
            # Decode polyline geometry to get coordinates
            coordinates = polyline.decode(route['geometry'])
            
            # Sample points along the route (every ~1km)
            sampled_points = []
            step = max(1, len(coordinates) // 10)  # Sample ~10 points
            for j in range(0, len(coordinates), step):
                lat, lng = coordinates[j]
                sampled_points.append({
                    'lat': lat,
                    'lng': lng
                })
            
            # Get AQI for sampled points
            aqi_data = []
            total_aqi = 0
            point_count = 0
            
            for point in sampled_points:
                try:
                    # Get nearest city for the point (simplified approach)
                    geo_response = requests.get(
                        f"https://nominatim.openstreetmap.org/reverse?format=json&lat={point['lat']}&lon={point['lng']}&zoom=10"
                    )
                    geo_response.raise_for_status()
                    location_data = geo_response.json()
                    
                    city = location_data.get('address', {}).get('city') or \
                           location_data.get('address', {}).get('town') or \
                           location_data.get('address', {}).get('village')
                    
                    if city:
                        # Get AQI for the city
                        aqi_response = requests.get(AQI_API_URL.format(city, AQI_API_KEY))
                        if aqi_response.status_code == 200:
                            aqi_data_response = aqi_response.json()
                            if aqi_data_response.get('status') == 'ok':
                                raw_data = aqi_data_response['data'].get('iaqi', {})
                                input_data = np.array([[
                                    raw_data.get('pm25', {}).get('v', 0.0),
                                    raw_data.get('pm10', {}).get('v', 0.0),
                                    raw_data.get('o3', {}).get('v', 0.0),
                                    raw_data.get('no2', {}).get('v', 0.0),
                                    raw_data.get('so2', {}).get('v', 0.0),
                                    raw_data.get('co', {}).get('v', 0.0)
                                ]], dtype=float)
                                aqi = model.predict(input_data)[0]
                                total_aqi += aqi
                                point_count += 1
                                aqi_data.append({
                                    'lat': point['lat'],
                                    'lng': point['lng'],
                                    'aqi': aqi,
                                    'city': city
                                })
                except Exception:
                    continue
            
            avg_aqi = total_aqi / point_count if point_count > 0 else 50
            
            # Create route summary
            processed_routes.append({
                'id': f"route_{i}",
                'summary': f"Route {i+1}",
                'distance': round(route['summary']['distance'] / 1000, 1),  # km
                'duration': round(route['summary']['duration'] / 60, 1),  # minutes
                'geometry': route['geometry'],
                'aqiData': aqi_data,
                'aqiScore': round(avg_aqi, 1)
            })
            
        return jsonify({'routes': processed_routes})
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'Routing API request failed: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get-aqi-for-coords', methods=['POST'])
def get_aqi_for_coords():
    try:
        data = request.get_json()
        lat = data.get('lat')
        lng = data.get('lng')
        
        if not lat or not lng:
            return jsonify({'error': 'Latitude and longitude are required'}), 400
            
        # Get nearest city for the coordinates
        geo_response = requests.get(
            f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lng}&zoom=10"
        )
        geo_response.raise_for_status()
        location_data = geo_response.json()
        
        city = location_data.get('address', {}).get('city') or \
               location_data.get('address', {}).get('town') or \
               location_data.get('address', {}).get('village')
        
        if not city:
            return jsonify({'error': 'Could not determine city for coordinates'}), 400
        
        # Get AQI for the city
        aqi_response = requests.get(AQI_API_URL.format(city, AQI_API_KEY))
        if aqi_response.status_code != 200:
            return jsonify({'error': 'Failed to fetch AQI data'}), 400
            
        aqi_data = aqi_response.json()
        if aqi_data.get('status') != 'ok':
            return jsonify({'error': 'Invalid AQI data'}), 400
            
        raw_data = aqi_data['data'].get('iaqi', {})
        input_data = np.array([[
            raw_data.get('pm25', {}).get('v', 0.0),
            raw_data.get('pm10', {}).get('v', 0.0),
            raw_data.get('o3', {}).get('v', 0.0),
            raw_data.get('no2', {}).get('v', 0.0),
            raw_data.get('so2', {}).get('v', 0.0),
            raw_data.get('co', {}).get('v', 0.0)
        ]], dtype=float)
        
        aqi = model.predict(input_data)[0]
        
        return jsonify({
            'city': city,
            'aqi': round(aqi, 1),
            'aqi_category': get_aqi_category(aqi),
            'lat': lat,
            'lng': lng
        })
        
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API request failed: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)